<?php

namespace Tests\Feature;

use App\Models\DailyPractice;
use App\Models\DailyPracticeAttempt;
use App\Models\Program;
use App\Models\User;
use App\Services\DailyPracticeAttemptService;
use App\Services\DailyPracticeService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class DailyPracticeRaceTest extends TestCase
{
    public function test_real_postgres_collisions_start_save_submit_and_deadline(): void
    {
        $this->assertSame('testing', app()->environment());
        $this->assertSame('hiru_academy_test', DB::connection()->getDatabaseName());
        $this->assertContains(config('database.connections.pgsql.host'), ['localhost', '127.0.0.1', '::1']);
        $this->assertSame('hiru_backend_test_gamification_final_20261008', DB::selectOne('SELECT current_schema() AS name')->name);
        if (! Schema::hasTable('daily_practices')) {
            (require database_path('migrations/2026_11_13_000001_create_daily_practices_tables.php'))->up();
        }
        $program = Program::where('code', 'n5')->first();
        $createdProgram = ! $program;
        $program ??= Program::create(['code' => 'n5', 'slug' => 'n5', 'name' => 'N5', 'family' => 'jlpt', 'status' => 'active', 'sort_order' => 1]);
        $user = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $user->forceFill(['role' => 'student', 'account_status' => 'active'])->save();
        $practice = null;
        try {
            $content = app(DailyPracticeService::class);
            $practice = $content->save(['title' => 'Daily race', 'category' => 'grammar', 'target_level' => 'n5', 'starts_at' => now()->subMinute()->toISOString(), 'ends_at' => now()->addMinute()->toISOString()]);
            $q = $content->saveQuestion($practice, ['session' => 'grammar', 'question' => 'Question', 'options' => ['A' => 'One', 'B' => 'Two', 'C' => 'Three', 'D' => 'Four'], 'correct_option' => 'B', 'point_value' => 1.25, 'status' => 'published']);
            $practice = $content->save(['status' => 'published'], $practice);
            $results = $this->collide($user, $practice, ['start', 'start'], 'daily_practices', $practice->id);
            $this->assertSame($results[0]['id'], $results[1]['id']);
            $this->assertSame(1, DailyPracticeAttempt::where('daily_practice_id', $practice->id)->count());
            $attempt = DailyPracticeAttempt::findOrFail($results[0]['id']);
            $results = $this->collide($user, $practice, ['save', 'save'], 'daily_practice_attempts', $attempt->id, $q->id);
            $this->assertSame([200, 409], $this->statuses($results));
            $this->assertSame(1, $attempt->fresh()->revision);
            $snapshot = $attempt->fresh()->grading_snapshot;
            $results = $this->collide($user, $practice, ['submit', 'save_stale', 'submit'], 'daily_practice_attempts', $attempt->id, $q->id);
            $this->assertSame([200, 200, 409], $this->statuses($results));
            $this->assertSame(2, $attempt->fresh()->revision);
            $this->assertEquals(1.25, $attempt->fresh()->result_snapshot['earned']);
            $this->assertSame($snapshot, $attempt->fresh()->grading_snapshot);
            $this->assertSame('B', $attempt->fresh()->answers[$q->id]);
            // New practice: expired autosave races scheduled finalization and manual submit.
            $other = $content->save(['title' => 'Deadline race', 'category' => 'grammar', 'target_level' => 'n5', 'starts_at' => now()->subMinute()->toISOString(), 'ends_at' => now()->addMinute()->toISOString()]);
            $otherQ = $content->saveQuestion($other, ['session' => 'grammar', 'question' => 'Question', 'options' => ['A' => 'One', 'B' => 'Two', 'C' => 'Three', 'D' => 'Four'], 'correct_option' => 'B', 'point_value' => 1, 'status' => 'published']);
            $other = $content->save(['status' => 'published'], $other);
            $due = app(DailyPracticeAttemptService::class)->start($user, $other);
            $results = $this->collide($user, $other, ['save', 'scheduled', 'submit'], 'daily_practice_attempts', $due->id, $otherQ->id, $other->ends_at->toISOString());
            $this->assertContains($this->statuses($results), [[200, 200, 200], [200, 200, 409]]);
            $this->assertSame(1, $due->fresh()->revision);
            $this->assertSame([], $due->fresh()->answers);
            $this->assertSame(0, $due->fresh()->result_snapshot['earned']);
        } finally {
            while (DB::transactionLevel() > 0) {
                DB::rollBack();
            }
            $ids = DailyPracticeAttempt::where('user_id', $user->id)->pluck('daily_practice_id')->all();
            DailyPracticeAttempt::where('user_id', $user->id)->delete();
            foreach (array_unique(array_filter([...$ids, $practice?->id, $other->id ?? null])) as $id) {
                DB::table('daily_practice_questions')->where('daily_practice_id', $id)->delete();
                DailyPractice::whereKey($id)->delete();
            }
            $user->delete();
            if ($createdProgram) {
                $program->delete();
            }
        }
    }

    private function statuses(array $results): array
    {
        $statuses = array_column($results, 'http');
        sort($statuses);

        return $statuses;
    }

    private function collide(User $user, DailyPractice $practice, array $actions, string $table, int $id, int $question = 0, ?string $clock = null): array
    {
        $code = <<<'PHP'
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
config(['database.default' => 'pgsql', 'database.connections.pgsql' => json_decode(getenv('RACE_CONNECTION'), true)]);
Illuminate\Support\Facades\DB::purge();
if (!app()->environment('testing') || Illuminate\Support\Facades\DB::connection()->getDatabaseName() !== 'hiru_academy_test' || Illuminate\Support\Facades\DB::selectOne('SELECT current_schema() AS name')->name !== 'hiru_backend_test_gamification_final_20261008') exit(90);
Illuminate\Support\Facades\DB::select("SELECT set_config('application_name', ?, false)", [getenv('RACE_NAME')]);
Illuminate\Support\Facades\DB::statement("SET lock_timeout = '15s'");
if (getenv('RACE_CLOCK')) Illuminate\Support\Carbon::setTestNow(getenv('RACE_CLOCK'));
$user = App\Models\User::findOrFail(getenv('RACE_USER'));
$practice = App\Models\DailyPractice::findOrFail(getenv('RACE_PRACTICE'));
$engine = app(App\Services\DailyPracticeAttemptService::class);
try {
    $action = getenv('RACE_ACTION');
    if ($action === 'start') $result = $engine->start($user, $practice);
    else {
        $attempt = App\Models\DailyPracticeAttempt::where('daily_practice_id', $practice->id)->where('user_id', $user->id)->firstOrFail();
        if ($action === 'scheduled') { $engine->finalizeDue($practice->id); $result = $attempt->fresh(); }
        elseif ($action === 'submit') $result = $engine->submit($user, $practice, $attempt, 1);
        else $result = $engine->save($user, $practice, $attempt, [getenv('RACE_QUESTION') => $action === 'save_stale' ? 'A' : 'B'], 0);
    }
    echo json_encode(['http' => 200, 'id' => $result->id, 'revision' => $result->revision]);
} catch (Symfony\Component\HttpKernel\Exception\HttpExceptionInterface $e) { echo json_encode(['http' => $e->getStatusCode()]); }
PHP;
        $connection = config('database.connections.pgsql');
        $connection['url'] = null;
        $workers = [];
        $names = [];
        try {
            DB::beginTransaction();
            DB::table($table)->where('id', $id)->lockForUpdate()->first();
            foreach ($actions as $action) {
                $name = 'daily_'.bin2hex(random_bytes(6));
                $names[] = $name;
                $worker = new Process([PHP_BINARY, '-r', $code], base_path(), ['APP_ENV' => 'testing', 'APP_CONFIG_CACHE' => base_path('bootstrap/cache/race-nonexistent.php'), 'DB_URL' => '', 'RACE_CONNECTION' => json_encode($connection), 'RACE_NAME' => $name, 'RACE_USER' => (string) $user->id, 'RACE_PRACTICE' => (string) $practice->id, 'RACE_QUESTION' => (string) $question, 'RACE_ACTION' => $action, 'RACE_CLOCK' => $clock ?? ''], null, 25);
                $worker->start();
                $workers[] = $worker;
            }
            $deadline = microtime(true) + 12;
            do {
                DB::select('SELECT pg_stat_clear_snapshot()');
                $blocked = DB::table('pg_stat_activity')->where('datname', DB::connection()->getDatabaseName())->whereIn('application_name', $names)->where('wait_event_type', 'Lock')->count();
                if ($blocked === count($actions)) {
                    break;
                }
                usleep(20000);
            } while (microtime(true) < $deadline);
            $this->assertSame(count($actions), $blocked, 'All workers must overlap while blocked on PostgreSQL locks.');
            DB::commit();
            $results = [];
            foreach ($workers as $worker) {
                $this->assertSame(0, $worker->wait(), $worker->getErrorOutput());
                $results[] = json_decode($worker->getOutput(), true, 512, JSON_THROW_ON_ERROR);
            }

            return $results;
        } finally {
            while (DB::transactionLevel() > 0) {
                DB::rollBack();
            }
            foreach ($workers as $worker) {
                if ($worker->isRunning()) {
                    $worker->stop();
                }
            }
        }
    }
}
