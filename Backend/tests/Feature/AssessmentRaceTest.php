<?php

namespace Tests\Feature;

use App\Models\AudioQuestion;
use App\Models\Chapter;
use App\Models\LearningAttempt;
use App\Models\MiniCheckpointQuestion;
use App\Models\Program;
use App\Models\TryOut;
use App\Models\TryOutAttempt;
use App\Models\User;
use App\Services\LearningAttemptService;
use App\Services\TryOutAttemptService;
use App\Services\TryOutService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class AssessmentRaceTest extends TestCase
{
    private ?User $student = null;

    private ?Chapter $chapter = null;

    private ?TryOut $tryOut = null;

    private ?int $createdProgramId = null;

    private ?int $createdOfferId = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->guardDatabase();
        $this->assertSame(0, DB::transactionLevel());
    }

    private function guardDatabase(): void
    {
        $this->assertTrue(app()->environment('testing'));
        $this->assertSame('pgsql', DB::getDriverName());
        $this->assertSame('hiru_academy_test', DB::connection()->getDatabaseName());
        $host = config('database.connections.'.config('database.default').'.host');
        $this->assertContains($host, ['localhost', '127.0.0.1', '::1']);
    }

    protected function tearDown(): void
    {
        try {
            $this->guardDatabase();
            while (DB::transactionLevel() > 0) {
                DB::rollBack();
            }
            if ($this->student) {
                DB::transaction(function () {
                    foreach (['activity_completions', 'learning_attempts', 'try_out_attempts'] as $table) {
                        if (Schema::hasTable($table)) {
                            DB::table($table)->where('user_id', $this->student->id)->delete();
                        }
                    }
                    $this->chapter?->delete();
                    $this->tryOut?->delete();
                    DB::table('access_grants')->where('user_id', $this->student->id)->delete();
                    $this->student->delete();
                });
            }
            if ($this->createdOfferId) {
                DB::table('program_offers')->where('id', $this->createdOfferId)->delete();
            }
            if ($this->createdProgramId) {
                DB::table('programs')->where('id', $this->createdProgramId)->delete();
            }
        } finally {
            parent::tearDown();
        }
    }

    private function fixture(string $kind, bool $expired = true): array
    {
        $program = Program::where('code', 'n5')->first();
        if (! $program) {
            $program = Program::create(['code' => 'n5', 'slug' => 'n5', 'name' => 'JLPT N5', 'family' => 'jlpt', 'cumulative_rank' => 5, 'status' => 'active', 'sort_order' => 2]);
            $this->createdProgramId = $program->id;
        }
        $this->assertSame('active', $program->status);
        $this->student = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $this->student->forceFill(['role' => 'student', 'account_status' => 'active'])->save();
        $options = ['A' => 'One', 'B' => 'Two', 'C' => 'Three', 'D' => 'Four'];
        if ($kind === 'try_out') {
            $this->assertSame('hiru_backend_test_gamification_final_20261008', DB::selectOne('SELECT current_schema() AS name')->name);
            if (! Schema::hasColumn('try_out_attempts', 'expires_at')) {
                (require database_path('migrations/2026_10_11_000001_add_try_out_duration_and_attempt_deadline.php'))->up();
            }
            if (! Schema::hasColumn('try_outs', 'max_score')) {
                (require database_path('migrations/2026_10_20_000002_add_try_out_builder_configuration.php'))->up();
            }
            if (! Schema::hasColumn('try_outs', 'access_type')) {
                (require database_path('migrations/2026_10_28_000003_add_access_type_to_try_outs.php'))->up();
            }
            if (! Schema::hasColumn('try_out_attempts', 'abandoned_at')) {
                (require database_path('migrations/2026_10_29_000032_add_try_out_attempt_abandonment.php'))->up();
            }
            if (! Schema::hasTable('try_out_passages')) {
                (require database_path('migrations/2026_10_29_000033_add_try_out_shared_passages.php'))->up();
            }
            $content = app(TryOutService::class);
            $this->tryOut = $content->save(['program_id' => $program->id, 'title' => 'Race '.bin2hex(random_bytes(8)), 'access_type' => 'free']);
            foreach (array_keys(TryOutService::SESSIONS) as $session) {
                $content->saveQuestion($this->tryOut, ['session' => $session, 'question' => 'Race question', 'options' => $options, 'correct_option' => 'B', 'point_value' => 45, 'status' => 'published', 'audio_url' => $session === 'audio' ? 'https://example.test/race.mp3' : null]);
            }
            $this->tryOut = $content->save(['status' => 'published'], $this->tryOut);
            $service = app(TryOutAttemptService::class);
            $attempt = $service->start($this->student, $this->tryOut);
            foreach ($attempt->content_snapshot as $question) {
                $attempt = $service->save($this->student, $this->tryOut, $attempt, [$question['id'] => 'B'], $attempt->revision, true);
            }

            return ['kind' => $kind, 'table' => 'try_out_attempts', 'id' => $attempt->id, 'parent' => $this->tryOut->id, 'user' => $this->student->id, 'revision' => $attempt->revision, 'answers' => $attempt->answers];
        }
        $number = (int) Chapter::where('program_id', $program->id)->max('chapter_number') + 1;
        $this->chapter = Chapter::create(['program_id' => $program->id, 'chapter_number' => $number, 'title' => 'Race '.bin2hex(random_bytes(8)), 'status' => 'published']);
        $plan = $kind === 'mini' ? 'sensei' : 'lms';
        if (! DB::table('program_offers')->where('program_id', $program->id)->where('plan_code', $plan)->exists()) {
            $this->createdOfferId = DB::table('program_offers')->insertGetId(['program_id' => $program->id, 'plan_code' => $plan, 'duration_months' => 6, 'status' => 'inactive', 'created_at' => now(), 'updated_at' => now()]);
        }
        DB::table('access_grants')->insert(['user_id' => $this->student->id, 'program_id' => $program->id, 'plan_code' => $plan, 'status' => 'active', 'starts_at' => now()->subDay()->toDateString(), 'ends_at' => now()->addDay()->toDateString(), 'created_at' => now(), 'updated_at' => now()]);
        $question = AudioQuestion::create(['chapter_id' => $this->chapter->id, 'question' => 'Race question', 'options' => $options, 'correct_option' => 'B', 'audio_url' => 'https://example.test/race.mp3', 'status' => 'published']);
        $service = app(LearningAttemptService::class);
        $attempt = $service->start($this->student, $program, $this->chapter, 'audio');
        $attempt = $service->save($this->student, $program, $this->chapter, $attempt, [$question->id => 'B'], 0);
        if ($kind === 'mini') {
            $service->submit($this->student, $program, $this->chapter, $attempt, $attempt->answers, $attempt->revision);
            $question = MiniCheckpointQuestion::create(['chapter_id' => $this->chapter->id, 'question' => 'Mini race', 'options' => $options, 'correct_option' => 'B', 'status' => 'published', 'session' => 2, 'part' => 3, 'duration_minutes' => 1, 'passing_score' => 70]);
            $attempt = $service->start($this->student, $program, $this->chapter, 'mini', 2, 3);
            $attempt = $service->save($this->student, $program, $this->chapter, $attempt, [$question->id => 'B'], 0);
            if ($expired) {
                DB::table('learning_attempts')->where('id', $attempt->id)->update(['created_at' => now()->utc()->subMinutes(2)->format('Y-m-d H:i:sP')]);
            }
        }

        return ['kind' => $kind, 'table' => 'learning_attempts', 'id' => $attempt->id, 'parent' => $this->chapter->id, 'program' => $program->id, 'user' => $this->student->id, 'revision' => $attempt->revision, 'answers' => $attempt->answers, 'expired' => $expired];
    }

    private function worker(array $fixture, string $operation, string $name): Process
    {
        $code = <<<'PHP'
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$connection = json_decode(getenv('RACE_CONNECTION'), true, 512, JSON_THROW_ON_ERROR);
config(['database.default' => 'pgsql', 'database.connections.pgsql' => $connection]);
Illuminate\Support\Facades\DB::purge();
if (! app()->environment('testing') || Illuminate\Support\Facades\DB::getDriverName() !== 'pgsql' || Illuminate\Support\Facades\DB::connection()->getDatabaseName() !== 'hiru_academy_test' || ! in_array($connection['host'], ['localhost', '127.0.0.1', '::1'], true)) {
    exit(90);
}
Illuminate\Support\Facades\DB::select("SELECT set_config('application_name', ?, false)", [getenv('RACE_NAME')]);
Illuminate\Support\Facades\DB::statement("SET lock_timeout = '15s'");
$f = json_decode(getenv('RACE_FIXTURE'), true, 512, JSON_THROW_ON_ERROR);
$user = App\Models\User::findOrFail($f['user']);
$save = getenv('RACE_OPERATION') === 'save';
try {
    if (isset($f['studio'])) {
        $service = app(App\Services\TryOutService::class);
        $service->saveStudio(App\Models\TryOut::findOrFail($f['parent']), $f['studio']);
        echo json_encode(['http' => 200], JSON_THROW_ON_ERROR);
        return;
    }
    if ($f['kind'] === 'try_out') {
        $service = app(App\Services\TryOutAttemptService::class);
        $parent = App\Models\TryOut::findOrFail($f['parent']);
        $attempt = App\Models\TryOutAttempt::findOrFail($f['id']);
        if (getenv('RACE_OPERATION') === 'abandon') {
            $service->abandon($user, $parent, $attempt);
            $result = $attempt->fresh();
        } elseif (getenv('RACE_OPERATION') === 'refresh') {
            $result = $service->refresh($user, $parent, $attempt);
        } else {
            $result = $save ? $service->save($user, $parent, $attempt, [array_key_first($f['answers']) => 'A'], $f['revision'] - 1, false) : $service->submit($user, $parent, $attempt, $f['revision']);
        }
    } else {
        $service = app(App\Services\LearningAttemptService::class);
        $program = App\Models\Program::findOrFail($f['program']);
        $parent = App\Models\Chapter::findOrFail($f['parent']);
        $attempt = App\Models\LearningAttempt::findOrFail($f['id']);
        $result = $save ? $service->save($user, $program, $parent, $attempt, [], $f['revision'] - 1) : $service->submit($user, $program, $parent, $attempt, $f['kind'] === 'mini' && $f['expired'] ? [999999 => 'E'] : $f['answers'], $f['kind'] === 'mini' && $f['expired'] ? 0 : $f['revision']);
    }
    echo json_encode(['http' => 200, 'status' => $result->status, 'revision' => $result->revision, 'result' => $result->result_snapshot, 'answers' => $result->answers], JSON_THROW_ON_ERROR);
} catch (Symfony\Component\HttpKernel\Exception\HttpExceptionInterface $exception) {
    echo json_encode(['http' => $exception->getStatusCode()], JSON_THROW_ON_ERROR);
}
PHP;
        $connection = config('database.connections.'.config('database.default'));
        $connection['url'] = null;

        return new Process([PHP_BINARY, '-r', $code], base_path(), ['APP_ENV' => 'testing', 'APP_CONFIG_CACHE' => base_path('bootstrap/cache/race-nonexistent.php'), 'DB_URL' => '', 'RACE_CONNECTION' => json_encode($connection, JSON_THROW_ON_ERROR), 'RACE_FIXTURE' => json_encode($fixture, JSON_THROW_ON_ERROR), 'RACE_OPERATION' => $operation, 'RACE_NAME' => $name], null, 25);
    }

    private function race(string $kind, bool $staleSave, bool $expired = true, bool $crossDeadline = false): void
    {
        $fixture = $this->fixture($kind, $crossDeadline ? false : $expired);
        if ($crossDeadline) {
            if ($kind === 'try_out') {
                $expiresAt = now()->utc()->addSeconds(3);
                DB::table('try_out_attempts')->where('id', $fixture['id'])->update(['expires_at' => $expiresAt->format('Y-m-d H:i:sP')]);
            } else {
                DB::table('learning_attempts')->where('id', $fixture['id'])->update(['created_at' => now()->utc()->subSeconds(55)->format('Y-m-d H:i:sP')]);
                $this->assertTrue(now()->utc()->lessThan(LearningAttempt::findOrFail($fixture['id'])->created_at->copy()->utc()->addMinute()));
            }
            $fixture['expired'] = true;
        }
        $names = ['race_'.bin2hex(random_bytes(8)), 'race_'.bin2hex(random_bytes(8))];
        $workers = [$this->worker($fixture, 'submit', $names[0]), $this->worker($fixture, $kind === 'try_out' && $crossDeadline && ! $staleSave ? 'refresh' : ($staleSave ? 'save' : 'submit'), $names[1])];
        DB::beginTransaction();
        DB::table($fixture['table'])->where('id', $fixture['id'])->lockForUpdate()->first();
        try {
            foreach ($workers as $worker) {
                $worker->start();
            }
            $deadline = microtime(true) + 12;
            do {
                DB::select('SELECT pg_stat_clear_snapshot()');
                $blocked = DB::select("SELECT application_name FROM pg_stat_activity WHERE datname = current_database() AND application_name IN (?, ?) AND wait_event_type = 'Lock'", $names);
                if (count($blocked) === 2) {
                    break;
                }
                foreach ($workers as $worker) {
                    $this->assertTrue($worker->isRunning(), 'Worker exited before lock barrier: '.$worker->getErrorOutput());
                }
                usleep(20000);
            } while (microtime(true) < $deadline);
            $this->assertCount(2, $blocked, 'Both separate PHP workers must block on the assessment row lock.');
            if ($crossDeadline) {
                $expiresAt = $kind === 'try_out' ? TryOutAttempt::findOrFail($fixture['id'])->expires_at : LearningAttempt::findOrFail($fixture['id'])->created_at->copy()->utc()->addMinute();
                while (now()->utc()->lessThan($expiresAt)) {
                    usleep(20000);
                }
            }
            DB::commit();
            $results = [];
            foreach ($workers as $worker) {
                $this->assertSame(0, $worker->wait(), $worker->getErrorOutput());
                $results[] = json_decode($worker->getOutput(), true, 512, JSON_THROW_ON_ERROR);
            }
            $this->assertSame(200, $results[0]['http']);
            $this->assertSame('completed', $results[0]['status']);
            $this->assertSame($fixture['revision'] + 1, $results[0]['revision']);
            if (! $staleSave || $kind === 'mini') {
                $this->assertEquals($results[0], $results[1]);
            } else {
                $this->assertContains($results[1]['http'], $kind === 'try_out' && ! $crossDeadline ? [409] : [200, 409]);
                if ($results[1]['http'] === 200) {
                    $this->assertEquals($results[0], $results[1]);
                }
            }
            $model = $kind === 'try_out' ? TryOutAttempt::findOrFail($fixture['id']) : LearningAttempt::findOrFail($fixture['id']);
            $this->assertSame($fixture['answers'], $model->answers);
            $this->assertEquals($results[0]['result'], $model->result_snapshot);
            $this->assertSame($fixture['revision'] + 1, $model->revision);
            $this->assertSame($kind === 'try_out' ? 180 : 1, $model->result_snapshot[$kind === 'try_out' ? 'earned' : 'correct']);
            if ($kind === 'learning' || $kind === 'mini') {
                $this->assertSame(1, DB::table('activity_completions')->where('user_id', $this->student->id)->count());
            }
            if ($kind === 'mini') {
                $this->assertTrue($model->result_snapshot['passed']);
                $this->assertSame(1, DB::table('gamification_rewards')->where('user_id', $this->student->id)->where('reward_key', 'like', 'exercise:mini:%')->count());
            }
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

    public function test_studio_concurrent_save_and_delete_reject_stale_writes(): void
    {
        $fixture = $this->fixture('try_out', false);
        $service = app(TryOutService::class);
        $passage = \App\Models\TryOutPassage::create(['try_out_id' => $this->tryOut->id, 'title' => 'Race passage', 'body' => '<p>Original</p>']);
        $reading = $this->tryOut->questions()->where('session', 'reading')->firstOrFail();
        $reading->update(['passage_id' => $passage->id, 'reading_passage' => null]);
        $snapshot = app(TryOutAttemptService::class)->start($this->student, $this->tryOut->fresh());
        $original = $snapshot->grading_snapshot;
        foreach ([false, true] as $delete) {
            $body = ['revision' => $service->studioRevision($this->tryOut), 'settings' => ['status' => 'draft'],
                'passages' => [['id' => (string) $passage->id, 'title' => 'Race passage', 'body' => $delete ? '<p>Saved again</p>' : '<p>Saved</p>']],
                'questions' => $this->tryOut->questions()->orderBy('id')->get()->map(function ($q) use ($service) {
                    $content = $service->adminQuestion($q);
                    unset($content['id'], $content['try_out_id'], $content['audio_url_resolved_url']);
                    return ['id' => (string) $q->id, 'content' => $content];
                })->all(), 'deleted_question_ids' => [], 'deleted_passage_ids' => []];
            $other = $body;
            $other['passages'][0]['body'] = '<p>Other</p>';
            if ($delete) {
                $other['passages'] = [];
                $other['questions'] = array_values(array_filter($other['questions'], fn ($q) => $q['id'] !== (string) $reading->id));
                $other['deleted_question_ids'] = [$reading->id];
                $other['deleted_passage_ids'] = [$passage->id];
            }
            $names = ['studio_'.bin2hex(random_bytes(8)), 'studio_'.bin2hex(random_bytes(8))];
            $workers = [$this->worker($fixture + ['studio' => $body], 'studio', $names[0]), $this->worker($fixture + ['studio' => $other], 'studio', $names[1])];
            DB::beginTransaction();
            DB::table('try_outs')->where('id', $this->tryOut->id)->lockForUpdate()->first();
            try {
                foreach ($workers as $worker) $worker->start();
                $deadline = microtime(true) + 12;
                do {
                    DB::select('SELECT pg_stat_clear_snapshot()');
                    $blocked = DB::select("SELECT application_name FROM pg_stat_activity WHERE datname = current_database() AND application_name IN (?, ?) AND wait_event_type = 'Lock'", $names);
                    if (count($blocked) === 2) break;
                    usleep(20000);
                } while (microtime(true) < $deadline);
                $this->assertCount(2, $blocked);
                DB::commit();
                $codes = [];
                foreach ($workers as $worker) {
                    $this->assertSame(0, $worker->wait(), $worker->getErrorOutput());
                    $codes[] = json_decode($worker->getOutput(), true, 512, JSON_THROW_ON_ERROR)['http'];
                }
                sort($codes);
                $this->assertSame([200, 409], $codes);
                $this->assertSame($original, $snapshot->fresh()->grading_snapshot);
                $this->assertSame(0, DB::table('try_out_questions')->where('try_out_id', $this->tryOut->id)->whereNotNull('passage_id')->whereNotIn('passage_id', DB::table('try_out_passages')->select('id'))->count());
                $this->assertSame($this->tryOut->questions()->count(), $this->tryOut->questions()->distinct()->count('id'));
                if (! $delete) $passage->refresh();
            } finally {
                while (DB::transactionLevel() > 0) DB::rollBack();
                foreach ($workers as $worker) if ($worker->isRunning()) $worker->stop();
            }
        }
    }

    public function test_try_out_abandon_collides_with_stale_autosave(): void
    {
        $fixture = $this->fixture('try_out', false);
        $names = ['exit_'.bin2hex(random_bytes(8)), 'exit_'.bin2hex(random_bytes(8))];
        $workers = [$this->worker($fixture, 'abandon', $names[0]), $this->worker($fixture, 'save', $names[1])];
        DB::beginTransaction();
        DB::table('try_out_attempts')->where('id', $fixture['id'])->lockForUpdate()->first();
        try {
            foreach ($workers as $worker) $worker->start();
            $deadline = microtime(true) + 12;
            do {
                DB::select('SELECT pg_stat_clear_snapshot()');
                $blocked = DB::select("SELECT application_name FROM pg_stat_activity WHERE datname = current_database() AND application_name IN (?, ?) AND wait_event_type = 'Lock'", $names);
                if (count($blocked) === 2) break;
                usleep(20000);
            } while (microtime(true) < $deadline);
            $this->assertCount(2, $blocked);
            DB::commit();
            foreach ($workers as $worker) $this->assertSame(0, $worker->wait(), $worker->getErrorOutput());
            $this->assertSame(200, json_decode($workers[0]->getOutput(), true)['http']);
            $this->assertSame(409, json_decode($workers[1]->getOutput(), true)['http']);
            $attempt = TryOutAttempt::findOrFail($fixture['id']);
            $this->assertNotNull($attempt->abandoned_at);
            $this->assertSame($fixture['answers'], $attempt->answers);
            $this->assertSame($fixture['revision'] + 1, $attempt->revision);
            $this->assertNull($attempt->result_snapshot);
        } finally {
            while (DB::transactionLevel() > 0) DB::rollBack();
            foreach ($workers as $worker) if ($worker->isRunning()) $worker->stop();
        }
    }

    public function test_mini_expired_autosave_submit_collision(): void
    {
        $this->race('mini', true);
    }

    public function test_mini_autosave_submit_cross_deadline_while_waiting_for_lock(): void
    {
        $this->race('mini', true, true, true);
    }

    public function test_mini_live_double_submit(): void
    {
        $this->race('mini', false, false);
    }

    public function test_mini_expired_double_submit(): void
    {
        $this->race('mini', false);
    }

    public function test_try_out_manual_submit_expiry_read_collision_after_lock_wait(): void
    {
        $this->race('try_out', false, true, true);
        $this->assertSame(1, DB::table('gamification_rewards')->where('user_id', $this->student->id)->where('reward_key', 'like', 'tryout:%')->count());
    }

    public function test_try_out_late_autosave_submit_collision_after_lock_wait(): void
    {
        $this->race('try_out', true, true, true);
        $this->assertSame(1, DB::table('gamification_rewards')->where('user_id', $this->student->id)->where('reward_key', 'like', 'tryout:%')->count());
    }

    public function test_try_out_double_submit_manual_automatic_collision(): void
    {
        $this->race('try_out', false);
    }

    public function test_try_out_stale_autosave_concurrent_with_final_submit(): void
    {
        $this->race('try_out', true);
    }

    public function test_learning_double_submit_manual_automatic_collision(): void
    {
        $this->race('learning', false);
    }

    public function test_learning_stale_autosave_concurrent_with_final_submit(): void
    {
        $this->race('learning', true);
    }
}
