<?php

namespace Tests\Feature;

use App\Models\PlacementAttempt;
use App\Models\PlacementConfig;
use App\Services\AssessmentAudioService;
use App\Support\DatabaseSafety;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class AssessmentAudioTest extends TestCase
{
    private ?PlacementConfig $config = null;
    private array $attemptIds = [];
    private string $owner = 'audio-test-owner';

    protected function setUp(): void
    {
        parent::setUp();
        DatabaseSafety::assertTarget(true);
        $this->assertSame(0, DB::transactionLevel());
        $this->assertMatchesRegularExpression('/^hiru_backend_test_[a-z0-9_]+$/D', (string) getenv('HIRU_TEST_SCHEMA'));
        $this->assertSame(getenv('HIRU_TEST_SCHEMA'), DB::selectOne('SELECT current_schema() AS name')->name);
        $this->assertTrue(Schema::hasTable('assessment_audio_plays'), 'Install audio-play migration explicitly in isolated test schema first.');
        $this->withSession(['placement_owner' => $this->owner]);
    }

    protected function tearDown(): void
    {
        try {
            if ($this->attemptIds !== []) {
                DB::table('assessment_audio_plays')->where('attempt_type', 'placement')->whereIn('attempt_id', $this->attemptIds)->delete();
                DB::transaction(function () {
                    DB::statement('ALTER TABLE placement_attempts DISABLE TRIGGER USER');
                    DB::table('placement_attempts')->whereIn('id', $this->attemptIds)->delete();
                    DB::statement('ALTER TABLE placement_attempts ENABLE TRIGGER USER');
                });
            }
            $this->config?->delete();
        } finally {
            parent::tearDown();
        }
    }

    private function fixture(): PlacementAttempt
    {
        $this->config ??= PlacementConfig::create(['title' => 'Audio test', 'intro_heading' => 'Test', 'duration_minutes' => 7, 'description' => 'Audio test', 'status' => 'draft']);
        $questions = [];
        foreach ([1, 2] as $id) {
            $questions[] = ['id' => $id, 'prompt' => 'Audio', 'options' => ['A' => 'One', 'B' => 'Two', 'C' => 'Three', 'D' => 'Four'], 'category' => 'Choukai', 'sort_order' => $id, 'audio_url' => 'https://example.test/audio.mp3'];
        }
        $attempt = PlacementAttempt::create([
            'placement_config_id' => $this->config->id, 'user_id' => null, 'owner_hash' => hash('sha256', $this->owner),
            'applicant_snapshot' => ['name' => 'Audio test'], 'config_snapshot' => $this->config->toArray(),
            'content_snapshot' => $questions, 'grading_snapshot' => [1 => 'A', 2 => 'A'], 'answers' => [],
            'status' => 'in_progress', 'started_at' => now(), 'expires_at' => now()->addMinutes(7),
        ]);
        $this->attemptIds[] = $attempt->id;

        return $attempt;
    }

    public function test_shared_audio_refresh_lease_commit_release_ownership_and_new_attempt(): void
    {
        $attempt = $this->fixture();
        $before = $attempt->getAttributes();
        $base = '/api/assessment-audio/placement/'.$attempt->id;
        $token = (string) Str::uuid();
        $other = (string) Str::uuid();
        $this->getJson($base.'/1')->assertOk()->assertJsonPath('data.status', 'available');
        // A non-UTC PostgreSQL session must not shift or immediately expire the lease.
        $timezone = DB::selectOne('SHOW TIME ZONE')->TimeZone;
        DB::statement("SET TIME ZONE 'Asia/Jakarta'");
        try {
            $reservation = $this->postJson($base.'/1/reserve', ['token' => $token])->assertOk()->assertJsonPath('data.status', 'reserved');
            $seconds = now()->diffInSeconds(\Illuminate\Support\Carbon::parse($reservation->json('data.expires_at')), false);
            $this->assertGreaterThan(20, $seconds);
            $this->assertLessThanOrEqual(30, $seconds);
        } finally {
            DB::select("SELECT set_config('TimeZone', ?, false)", [$timezone]);
        }
        $this->postJson($base.'/2/reserve', ['token' => $token])->assertOk();
        $this->postJson($base.'/2/reserve', ['token' => $other])->assertConflict();
        $this->postJson($base.'/1/release', ['token' => $other])->assertConflict();
        $this->postJson($base.'/1/release', ['token' => $token])->assertOk()->assertJsonPath('data.status', 'available');
        $this->postJson($base.'/1/reserve', ['token' => $token])->assertOk();
        DB::table('assessment_audio_plays')->where('attempt_type', 'placement')->where('attempt_id', $attempt->id)->update(['reserved_until' => now()->subSecond()]);
        $this->postJson($base.'/1/commit', ['token' => $token])->assertConflict();
        $this->postJson($base.'/2/reserve', ['token' => $other])->assertOk();
        $this->postJson($base.'/1/commit', ['token' => $other])->assertOk()->assertJsonPath('data.status', 'used');
        $this->postJson($base.'/2/commit', ['token' => $other])->assertOk();
        $this->postJson($base.'/1/release', ['token' => $other])->assertConflict();
        $this->getJson($base.'/2')->assertOk()->assertJsonPath('data.status', 'used');
        $this->assertSame($before, $attempt->fresh()->getAttributes());
        $new = $this->fixture();
        $this->getJson('/api/assessment-audio/placement/'.$new->id.'/1')->assertOk()->assertJsonPath('data.status', 'available');
        $this->withSession(['placement_owner' => 'wrong'])->getJson($base.'/1')->assertNotFound();
        $this->withSession(['placement_owner' => $this->owner]);
        $this->getJson($base.'/999')->assertNotFound();
        $this->postJson($base.'/1/reserve', ['token' => 'invalid'])->assertUnprocessable();
        $this->travel(8)->minutes();
        try {
            $this->getJson($base.'/1')->assertConflict();
        } finally {
            $this->travelBack();
        }
    }

    public function test_concurrent_shared_audio_reservations_have_one_winner(): void
    {
        $attempt = $this->fixture();
        $connection = DB::connection()->getConfig();
        $code = <<<'PHP'
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
config(['database.default' => 'audio_race', 'database.connections.audio_race' => json_decode(getenv('AUDIO_CONNECTION'), true)]);
App\Support\DatabaseSafety::assertTarget(true);
$request = Illuminate\Http\Request::create('/');
$session = app('session.store');
$session->put('placement_owner', 'audio-test-owner');
$request->setLaravelSession($session);
try {
    app(App\Services\AssessmentAudioService::class)->handle($request, 'placement', getenv('AUDIO_ATTEMPT'), getenv('AUDIO_QUESTION'), 'reserve', getenv('AUDIO_TOKEN'));
    echo 'reserved';
} catch (Symfony\Component\HttpKernel\Exception\HttpException $e) {
    echo $e->getStatusCode();
}
PHP;
        $workers = [];
        foreach ([1, 2] as $question) {
            $workers[] = new Process([PHP_BINARY, '-r', $code], base_path(), ['APP_ENV' => 'testing', 'APP_CONFIG_CACHE' => base_path('bootstrap/cache/audio-race-nonexistent.php'), 'DB_URL' => '', 'AUDIO_CONNECTION' => json_encode($connection, JSON_THROW_ON_ERROR), 'AUDIO_ATTEMPT' => (string) $attempt->id, 'AUDIO_QUESTION' => (string) $question, 'AUDIO_TOKEN' => (string) Str::uuid()], null, 20);
        }
        // Hold parent lock until both independent connections are launched.
        DB::beginTransaction();
        try {
            DB::table('placement_attempts')->where('id', $attempt->id)->lockForUpdate()->first();
            foreach ($workers as $worker) {
                $worker->start();
            }
        } finally {
            DB::commit();
        }
        $results = [];
        foreach ($workers as $worker) {
            $worker->wait();
            $this->assertTrue($worker->isSuccessful(), $worker->getErrorOutput());
            $results[] = $worker->getOutput();
        }
        sort($results);
        $this->assertSame(['409', 'reserved'], $results);
        $this->assertSame(1, DB::table('assessment_audio_plays')->where('attempt_type', 'placement')->where('attempt_id', $attempt->id)->count());
    }

    public function test_canonical_identity_ignores_signatures_not_semantic_query(): void
    {
        $this->assertSame(AssessmentAudioService::audioKey('https://EXAMPLE.test/audio.mp3?X-Amz-Signature=one&Expires=1'), AssessmentAudioService::audioKey('https://example.test/audio.mp3?Expires=2&X-Amz-Signature=two'));
        $this->assertNotSame(AssessmentAudioService::audioKey('https://example.test/audio?id=1'), AssessmentAudioService::audioKey('https://example.test/audio?id=2'));
    }
}
