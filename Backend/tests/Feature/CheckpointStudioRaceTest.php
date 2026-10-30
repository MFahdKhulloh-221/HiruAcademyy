<?php

namespace Tests\Feature;

use App\Models\CheckpointAttempt;
use App\Models\CheckpointPackage;
use App\Models\Program;
use App\Models\User;
use App\Services\CheckpointAttemptService;
use App\Services\CheckpointPackageService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class CheckpointStudioRaceTest extends TestCase
{
    public function test_double_submit_and_stale_save_preserve_checkpoint_snapshot(): void
    {
        $this->assertTrue(app()->environment('testing'));
        $this->assertSame('hiru_academy_test', DB::connection()->getDatabaseName());
        $this->assertContains(config('database.connections.pgsql.host'), ['localhost', '127.0.0.1', '::1']);
        $this->assertSame('hiru_backend_test_gamification_final_20261008', DB::selectOne('SELECT current_schema() AS name')->name);
        $this->assertTrue(Schema::hasTable('checkpoint_studio_questions'), 'Run Checkpoint Studio migration on isolated test schema first.');
        $user = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $user->forceFill(['role' => 'student', 'account_status' => 'active'])->save();
        $package = null;
        $program = Program::where('code', 'n5')->first();
        $createdProgram = $program === null;
        $program ??= Program::create(['code' => 'n5', 'slug' => 'n5', 'name' => 'JLPT N5', 'family' => 'jlpt', 'cumulative_rank' => 5, 'status' => 'active', 'sort_order' => 2]);
        $workers = [];
        try {
            $content = app(CheckpointPackageService::class);
            $package = $content->save(['program_id' => $program->id, 'title' => 'Checkpoint race', 'access_type' => 'free', 'max_score' => 4, 'session_passing_scores' => array_fill_keys(array_keys($content::SESSIONS), 1)]);
            foreach (array_keys($content::SESSIONS) as $session) {
                $content->saveQuestion($package, ['session' => $session, 'question' => 'Question', 'options' => ['A' => 'One', 'B' => 'Two', 'C' => 'Three', 'D' => 'Four'], 'correct_option' => 'B', 'point_value' => 1, 'status' => 'published', 'audio_url' => $session === 'audio' ? 'https://example.test/audio.mp3' : null]);
            }
            $package = $content->save(['status' => 'published'], $package);
            $service = app(CheckpointAttemptService::class);
            $attempt = $service->start($user, $package);
            $answers = array_fill_keys(array_column($attempt->content_snapshot, 'id'), 'B');
            $attempt = $service->save($user, $package, $attempt, $answers, 0);
            $snapshot = $attempt->grading_snapshot;
            $connection = config('database.connections.pgsql');
            $connection['url'] = null;
            $code = <<<'PHP'
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
config(['database.default' => 'pgsql', 'database.connections.pgsql' => json_decode(getenv('RACE_CONNECTION'), true)]);
Illuminate\Support\Facades\DB::purge();
if (!app()->environment('testing') || Illuminate\Support\Facades\DB::connection()->getDatabaseName() !== 'hiru_academy_test' || Illuminate\Support\Facades\DB::selectOne('SELECT current_schema() AS name')->name !== 'hiru_backend_test_gamification_final_20261008') exit(90);
Illuminate\Support\Facades\DB::select("SELECT set_config('application_name', ?, false)", [getenv('RACE_NAME')]);
Illuminate\Support\Facades\DB::statement("SET lock_timeout = '15s'");
try {
    $result = app(App\Services\CheckpointAttemptService::class)->submit(App\Models\User::findOrFail(getenv('RACE_USER')), App\Models\CheckpointPackage::findOrFail(getenv('RACE_PACKAGE')), App\Models\CheckpointAttempt::findOrFail(getenv('RACE_ATTEMPT')), 1);
    echo json_encode(['status' => $result->status, 'revision' => $result->revision, 'result' => $result->result_snapshot]);
} catch (Symfony\Component\HttpKernel\Exception\HttpExceptionInterface $e) { echo json_encode(['http' => $e->getStatusCode()]); }
PHP;
            $names = ['checkpoint_'.bin2hex(random_bytes(6)), 'checkpoint_'.bin2hex(random_bytes(6))];
            DB::beginTransaction();
            DB::table('checkpoint_attempts')->where('id', $attempt->id)->lockForUpdate()->first();
            foreach ($names as $name) {
                $worker = new Process([PHP_BINARY, '-r', $code], base_path(), ['APP_ENV' => 'testing', 'APP_CONFIG_CACHE' => base_path('bootstrap/cache/race-nonexistent.php'), 'DB_URL' => '', 'RACE_CONNECTION' => json_encode($connection), 'RACE_NAME' => $name, 'RACE_USER' => (string) $user->id, 'RACE_PACKAGE' => (string) $package->id, 'RACE_ATTEMPT' => (string) $attempt->id], null, 25);
                $worker->start();
                $workers[] = $worker;
            }
            $deadline = microtime(true) + 12;
            do {
                DB::select('SELECT pg_stat_clear_snapshot()');
                $blocked = DB::select("SELECT application_name FROM pg_stat_activity WHERE datname = current_database() AND application_name IN (?, ?) AND wait_event_type = 'Lock'", $names);
                if (count($blocked) === 2) break;
                usleep(20000);
            } while (microtime(true) < $deadline);
            $this->assertCount(2, $blocked);
            DB::commit();
            $results = [];
            foreach ($workers as $worker) {
                $this->assertSame(0, $worker->wait(), $worker->getErrorOutput());
                $results[] = json_decode($worker->getOutput(), true, 512, JSON_THROW_ON_ERROR);
            }
            $this->assertSame($results[0], $results[1]);
            $this->assertSame('completed', $results[0]['status']);
            $this->assertSame(2, $results[0]['revision']);
            $this->assertSame(4, $results[0]['result']['earned']);
            try {
                $service->save($user, $package, $attempt, [array_key_first($answers) => 'A'], 0);
                $this->fail('Stale save must be rejected.');
            } catch (\Symfony\Component\HttpKernel\Exception\HttpExceptionInterface $e) {
                $this->assertSame(409, $e->getStatusCode());
            }
            $this->assertSame($answers, $attempt->fresh()->answers);
            $this->assertSame($snapshot, $attempt->fresh()->grading_snapshot);
            $this->assertArrayNotHasKey('correct_option', $service->payload($attempt->fresh())['questions'][0]);
        } finally {
            while (DB::transactionLevel() > 0) DB::rollBack();
            foreach ($workers as $worker) if ($worker->isRunning()) $worker->stop();
            CheckpointAttempt::where('user_id', $user->id)->delete();
            $package?->delete();
            DB::table('gamification_rewards')->where('user_id', $user->id)->delete();
            $user->delete();
            if ($createdProgram) $program->delete();
        }
    }
}
