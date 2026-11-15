<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class Ga4ReportingService
{
    public function summary(string $period): array
    {
        if (! in_array($period, ['7d', '30d'], true)) {
            throw new RuntimeException('Analytics unavailable.');
        }

        return $this->report('runReport', ['activeUsers', 'sessions', 'screenPageViews', 'userEngagementDuration'], [
            'dateRanges' => [['startDate' => $period === '7d' ? '6daysAgo' : '29daysAgo', 'endDate' => 'today']],
        ], 'summary:'.$period, 300, static fn ($values) => [
            'period' => $period,
            'metrics' => [
                'activeUsers' => (int) $values[0],
                'sessions' => (int) $values[1],
                'screenPageViews' => (int) $values[2],
                'averageEngagementSeconds' => $values[0] > 0 ? round($values[3] / $values[0], 2) : 0,
            ],
        ]);
    }

    public function realtime(): array
    {
        return $this->report('runRealtimeReport', ['activeUsers', 'screenPageViews'], [
            'minuteRanges' => [['startMinutesAgo' => 29, 'endMinutesAgo' => 0]],
        ], 'realtime', 15, static fn ($values) => [
            'windowMinutes' => 30,
            'refreshedAt' => now()->toIso8601String(),
            'metrics' => ['activeUsers' => (int) $values[0], 'screenPageViews' => (int) $values[1]],
        ]);
    }

    private function report(string $method, array $names, array $ranges, string $cacheKey, int $ttl, callable $format): array
    {
        $property = (string) config('services.ga4.property_id');
        $path = config('services.ga4.credentials_path');
        $file = is_string($path) ? realpath($path) : false;
        $repository = realpath(base_path('..'));
        if (! preg_match('/^\d+$/D', $property) || ! $file || ! is_file($file) || ! is_readable($file)
            || ! preg_match('~^(?:[A-Za-z]:[\\\\/]|/)~', $path)
            || str_starts_with(strtolower($file), strtolower($repository.DIRECTORY_SEPARATOR))) {
            throw new RuntimeException('Analytics unavailable.');
        }

        // Cache only aggregate metrics; credentials and OAuth tokens remain in memory.
        return Cache::remember('ga4:'.$property.':'.$cacheKey, $ttl, function () use ($file, $property, $method, $names, $ranges, $format) {
            $credentials = json_decode(file_get_contents($file), true, 512, JSON_THROW_ON_ERROR);
            if (($credentials['type'] ?? null) !== 'service_account'
                || ! filter_var($credentials['client_email'] ?? '', FILTER_VALIDATE_EMAIL)
                || ! is_string($credentials['private_key'] ?? null)) {
                throw new RuntimeException('Analytics unavailable.');
            }

            $encode = static fn (string $value): string => rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
            $now = time();
            $assertion = $encode(json_encode(['alg' => 'RS256', 'typ' => 'JWT'])).'.'.$encode(json_encode([
                'iss' => $credentials['client_email'],
                'scope' => 'https://www.googleapis.com/auth/analytics.readonly',
                'aud' => 'https://oauth2.googleapis.com/token',
                'iat' => $now,
                'exp' => $now + 3600,
            ]));
            $key = @openssl_pkey_get_private($credentials['private_key']);
            if (! $key || openssl_pkey_get_details($key)['type'] !== OPENSSL_KEYTYPE_RSA
                || ! openssl_sign($assertion, $signature, $key, OPENSSL_ALGO_SHA256)) {
                throw new RuntimeException('Analytics unavailable.');
            }

            $oauth = Http::asForm()->withOptions(['allow_redirects' => false])->connectTimeout(5)->timeout(15)->post('https://oauth2.googleapis.com/token', [
                'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion' => $assertion.'.'.$encode($signature),
            ]);
            $token = $oauth->json('access_token');
            if (! $oauth->successful() || ! is_string($token) || $token === '') {
                throw new RuntimeException('Analytics unavailable.');
            }

            $response = Http::withToken($token)->withOptions(['allow_redirects' => false])->connectTimeout(5)->timeout(15)
                ->post('https://analyticsdata.googleapis.com/v1beta/properties/'.$property.':'.$method, $ranges + [
                    'metrics' => array_map(static fn ($name) => ['name' => $name], $names),
                ]);
            $emptyReport = $response->json('kind') === 'analyticsData#'.$method
                && $response->json('rows', []) === [] && $response->json('metricHeaders', []) === [];
            if (! $response->successful() || (! $emptyReport && $response->json('metricHeaders.*.name') !== $names)) {
                throw new RuntimeException('Analytics unavailable.');
            }

            $rows = $response->json('rows', []);
            if (! is_array($rows) || count($rows) > 1
                || $response->json('rowCount', count($rows)) !== count($rows)) {
                throw new RuntimeException('Analytics unavailable.');
            }
            $metricValues = $rows[0]['metricValues'] ?? [];
            if (! is_array($metricValues)) {
                throw new RuntimeException('Analytics unavailable.');
            }
            $values = $rows === [] ? array_fill(0, count($names), 0) : array_column($metricValues, 'value');
            if (count($values) !== count($names)) {
                throw new RuntimeException('Analytics unavailable.');
            }
            foreach ($values as $value) {
                if (! is_numeric($value) || ! is_finite((float) $value) || $value < 0
                    || ($method === 'runRealtimeReport' && (! preg_match('/^\d+$/D', (string) $value) || $value > 9007199254740991))) {
                    throw new RuntimeException('Analytics unavailable.');
                }
            }

            return $format($values);
        });
    }
}
