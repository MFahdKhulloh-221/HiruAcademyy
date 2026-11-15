<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Http\Client\Factory;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AdminAnalyticsTest extends TestCase
{
    private ?string $credentials = null;

    protected function setUp(): void
    {
        parent::setUp();
        config(['cache.default' => 'array', 'services.ga4.property_id' => '558392393', 'services.ga4.credentials_path' => null]);
        Cache::flush();
        Http::preventStrayRequests();
    }

    protected function tearDown(): void
    {
        if ($this->credentials) {
            unlink($this->credentials);
        }
        parent::tearDown();
    }

    private function login(string $role = 'admin', string $status = 'active'): void
    {
        $user = new User;
        $user->id = 123;
        $user->role = $role;
        $user->account_status = $status;
        $this->actingAs($user);
    }

    private function configureCredentials(): void
    {
        $key = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        openssl_pkey_export($key, $privateKey);
        $this->credentials = tempnam(sys_get_temp_dir(), 'ga4-test-');
        file_put_contents($this->credentials, json_encode([
            'type' => 'service_account', 'client_email' => 'test@example.iam.gserviceaccount.com', 'private_key' => $privateKey,
        ]));
        config(['services.ga4.credentials_path' => $this->credentials]);
    }

    private function fakeGoogle(array $rows = [['metricValues' => [['value' => '4'], ['value' => '8'], ['value' => '12'], ['value' => '50']]]]): void
    {
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response(['access_token' => 'test-token']),
            'https://analyticsdata.googleapis.com/*' => Http::response([
                'metricHeaders' => array_map(fn ($name) => ['name' => $name], ['activeUsers', 'sessions', 'screenPageViews', 'userEngagementDuration']),
                'rows' => $rows,
            ]),
        ]);
    }

    public function test_accepts_google_metadata_only_empty_report(): void
    {
        $this->login();
        $this->configureCredentials();
        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response(['access_token' => 'test-token']),
            'https://analyticsdata.googleapis.com/*' => Http::response(['kind' => 'analyticsData#runReport', 'metadata' => ['currencyCode' => 'IDR']]),
        ]);
        $this->getJson('/api/admin/analytics')->assertOk()->assertJsonPath('data.metrics.activeUsers', 0)->assertJsonPath('data.metrics.screenPageViews', 0);
    }

    public function test_requires_active_admin(): void
    {
        $this->getJson('/api/admin/analytics')->assertUnauthorized();
        $this->login('student');
        $this->getJson('/api/admin/analytics')->assertForbidden();
        $this->login('admin', 'inactive');
        $this->getJson('/api/admin/analytics')->assertUnauthorized();
        Http::assertNothingSent();
    }

    public function test_validates_period_and_returns_unavailable_without_credentials(): void
    {
        $this->login();
        foreach (['1d', '', '30', '7d&extra'] as $period) {
            $this->getJson('/api/admin/analytics?period='.urlencode($period))->assertUnprocessable();
        }
        $this->getJson('/api/admin/analytics?period[]=7d')->assertUnprocessable();
        $this->getJson('/api/admin/analytics')->assertStatus(503)->assertExactJson([
            'code' => 'analytics_unavailable', 'message' => 'Analytics unavailable. Please try again later.',
        ]);
        Http::assertNothingSent();
    }

    public function test_reports_metrics_signs_readonly_jwt_and_caches_only_summary_for_five_minutes(): void
    {
        $this->login();
        $this->configureCredentials();
        $this->fakeGoogle();
        $expected = ['data' => ['period' => '7d', 'metrics' => [
            'activeUsers' => 4, 'sessions' => 8, 'screenPageViews' => 12, 'averageEngagementSeconds' => 12.5,
        ]]];
        $this->getJson('/api/admin/analytics')->assertOk()->assertExactJson($expected)->assertHeader('Cache-Control', 'no-store, private');
        Http::assertSent(function ($request) {
            if ($request->url() !== 'https://oauth2.googleapis.com/token') {
                return false;
            }
            [$header, $payload, $signature] = explode('.', $request['assertion']);
            $claims = json_decode(base64_decode(strtr($payload, '-_', '+/')), true);
            $credentials = json_decode(file_get_contents($this->credentials), true);
            $publicKey = openssl_pkey_get_details(openssl_pkey_get_private($credentials['private_key']))['key'];

            return $claims['scope'] === 'https://www.googleapis.com/auth/analytics.readonly'
                && $claims['aud'] === 'https://oauth2.googleapis.com/token'
                && $claims['exp'] - $claims['iat'] === 3600
                && openssl_verify($header.'.'.$payload, base64_decode(strtr($signature, '-_', '+/')), $publicKey, OPENSSL_ALGO_SHA256) === 1;
        });
        $this->getJson('/api/admin/analytics')->assertOk();
        Http::assertSentCount(2);
        $this->travel(301)->seconds();
        $this->getJson('/api/admin/analytics')->assertOk();
        Http::assertSentCount(4);
        $cached = json_encode(Cache::getStore()->all());
        $this->assertStringNotContainsString('PRIVATE KEY', $cached);
        $this->assertStringNotContainsString('test-token', $cached);
    }

    public function test_thirty_day_period_and_genuine_empty_report(): void
    {
        $this->login();
        $this->configureCredentials();
        $this->fakeGoogle([]);
        $this->getJson('/api/admin/analytics?period=30d')->assertOk()->assertJsonPath('data.period', '30d')
            ->assertJsonPath('data.metrics.averageEngagementSeconds', 0);
        Http::assertSent(fn ($request) => str_contains($request->url(), ':runReport')
            && $request['dateRanges'] === [['startDate' => '29daysAgo', 'endDate' => 'today']]);
    }

    public function test_provider_errors_and_malformed_responses_never_become_zero_metrics_or_leak_details(): void
    {
        $this->login();
        $this->configureCredentials();
        foreach ([401, 403, 429, 500] as $status) {
            Http::swap(new Factory);
            Http::preventStrayRequests();
            Http::fake(['*' => Http::response(['error' => 'sensitive-provider-error'], $status)]);
            $this->getJson('/api/admin/analytics')->assertStatus(503)->assertJsonMissing(['error' => 'sensitive-provider-error']);
        }
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response(['access_token' => 'test-token']),
            '*' => Http::response(['error' => 'sensitive-provider-error'], 403),
        ]);
        $this->getJson('/api/admin/analytics')->assertStatus(503);
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake(['*' => Http::response([])]);
        $this->getJson('/api/admin/analytics')->assertStatus(503);
        $this->fakeGoogle([['metricValues' => [['value' => 'bad']]]]);
        $this->getJson('/api/admin/analytics')->assertStatus(503);
        $this->fakeGoogle();
        $this->getJson('/api/admin/analytics')->assertOk();
    }

    public function test_realtime_requires_active_admin(): void
    {
        $this->getJson('/api/admin/analytics/realtime')->assertUnauthorized();
        $this->login('student');
        $this->getJson('/api/admin/analytics/realtime')->assertForbidden();
        $this->login('admin', 'inactive');
        $this->getJson('/api/admin/analytics/realtime')->assertUnauthorized();
        Http::assertNothingSent();
    }

    public function test_realtime_uses_explicit_window_and_separate_fifteen_second_cache(): void
    {
        $this->login();
        $this->configureCredentials();
        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response(['access_token' => 'test-token']),
            '*:runRealtimeReport' => Http::response([
                'metricHeaders' => [['name' => 'activeUsers'], ['name' => 'screenPageViews']],
                'rows' => [['metricValues' => [['value' => '2'], ['value' => '11']]]],
            ]),
            '*:runReport' => Http::response(['kind' => 'analyticsData#runReport']),
        ]);
        $this->getJson('/api/admin/analytics/realtime')->assertOk()
            ->assertJsonPath('data.windowMinutes', 30)->assertJsonPath('data.metrics.activeUsers', 2)
            ->assertJsonPath('data.metrics.screenPageViews', 11)->assertJsonStructure(['data' => ['refreshedAt']])
            ->assertHeader('Cache-Control', 'no-store, private');
        Http::assertSent(fn ($request) => str_ends_with($request->url(), ':runRealtimeReport')
            && $request['minuteRanges'] === [['startMinutesAgo' => 29, 'endMinutesAgo' => 0]]
            && $request['metrics'] === [['name' => 'activeUsers'], ['name' => 'screenPageViews']]
            && ! isset($request['dateRanges']));
        $this->getJson('/api/admin/analytics/realtime')->assertOk();
        Http::assertSentCount(2);
        $this->getJson('/api/admin/analytics?period=30d')->assertOk()->assertJsonPath('data.metrics.activeUsers', 0);
        Http::assertSentCount(4);
        $this->travel(16)->seconds();
        $this->getJson('/api/admin/analytics/realtime')->assertOk();
        $this->getJson('/api/admin/analytics?period=30d')->assertOk();
        Http::assertSentCount(6);
        $cached = json_encode(Cache::getStore()->all());
        $this->assertStringNotContainsString('test-token', $cached);
        $this->assertStringNotContainsString('PRIVATE KEY', $cached);
    }

    public function test_realtime_accepts_empty_reports_but_fails_closed_on_invalid_provider_data(): void
    {
        $this->login();
        $this->configureCredentials();
        foreach ([[], ['kind' => 'analyticsData#runReport'], ['kind' => 'analyticsData#runRealtimeReport', 'rows' => 'invalid'],
            ['metricHeaders' => [['name' => 'activeUsers'], ['name' => 'screenPageViews']], 'rows' => [['metricValues' => [['value' => '-1'], ['value' => '2']]]]],
            ['error' => 'sensitive-provider-error']] as $body) {
            Http::swap(new Factory);
            Http::preventStrayRequests();
            Http::fake([
                'https://oauth2.googleapis.com/token' => Http::response(['access_token' => 'test-token']),
                '*' => Http::response($body),
            ]);
            $this->getJson('/api/admin/analytics/realtime')->assertStatus(503)->assertExactJson([
                'code' => 'analytics_unavailable', 'message' => 'Analytics unavailable. Please try again later.',
            ]);
        }
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response(['access_token' => 'test-token']),
            '*' => Http::response(['kind' => 'analyticsData#runRealtimeReport']),
        ]);
        $this->getJson('/api/admin/analytics/realtime')->assertOk()->assertJsonPath('data.metrics.activeUsers', 0);
    }

    public function test_rejects_invalid_credentials_without_network_request(): void
    {
        $this->login();
        $this->configureCredentials();
        file_put_contents($this->credentials, '{invalid json');
        $this->getJson('/api/admin/analytics')->assertStatus(503);
        file_put_contents($this->credentials, json_encode(['type' => 'service_account', 'client_email' => 'test@example.com', 'private_key' => 'invalid']));
        $this->getJson('/api/admin/analytics')->assertStatus(503);
        config(['services.ga4.credentials_path' => base_path('composer.json')]);
        $this->getJson('/api/admin/analytics')->assertStatus(503);
        Http::assertNothingSent();
    }
}
