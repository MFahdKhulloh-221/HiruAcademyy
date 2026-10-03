<?php

namespace Tests\Feature;

use App\Models\AudioQuestion;
use App\Models\Chapter;
use App\Models\LearningAttempt;
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

    private function fixture(string $kind): array
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
            $content = app(TryOutService::class);
            $this->tryOut = $content->save(['program_id' => $program->id, 'title' => 'Race '.bin2hex(random_bytes(8))]);
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
        if (! DB::table('program_offers')->where('program_id', $program->id)->where('plan_code', 'lms')->exists()) {
            $this->createdOfferId = DB::table('program_offers')->insertGetId(['program_id' => $program->id, 'plan_code' => 'lms', 'duration_months' => 6, 'status' => 'inactive', 'created_at' => now(), 'updated_at' => now()]);
        }
        DB::table('access_grants')->insert(['user_id' => $this->student->id, 'program_id' => $program->id, 'plan_code' => 'lms', 'status' => 'active', 'starts_at' => now()->subDay()->toDateString(), 'ends_at' => now()->addDay()->toDateString(), 'created_at' => now(), 'updated_at' => now()]);
        $question = AudioQuestion::create(['chapter_id' => $this->chapter->id, 'question' => 'Race question', 'options' => $options, 'correct_option' => 'B', 'audio_url' => 'https://example.test/race.mp3', 'status' => 'published']);
        $service = app(LearningAttemptService::class);
        $attempt = $service->start($this->student, $program, $this->chapter, 'audio');
        $attempt = $service->save($this->student, $program, $this->chapter, $attempt, [$question->id => 'B'], 0);

        return ['kind' => $kind, 'table' => 'learning_attempts', 'id' => $attempt->id, 'parent' => $this->chapter->id, 'program' => $program->id, 'user' => $this->student->id, 'revision' => $attempt->revision, 'answers' => $attempt->answers];
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
    if ($f['kind'] === 'try_out') {
        $service = app(App\Services\TryOutAttemptService::class);
        $parent = App\Models\TryOut::findOrFail($f['parent']);
        $attempt = App\Models\TryOutAttempt::findOrFail($f['id']);
        $result = $save ? $service->save($user, $parent, $attempt, [], $f['revision'] - 1, false) : $service->submit($user, $parent, $attempt, $f['revision']);
    } else {
        $service = app(App\Services\LearningAttemptService::class);
        $program = App\Models\Program::findOrFail($f['program']);
        $parent = App\Models\Chapter::findOrFail($f['parent']);
        $attempt = App\Models\LearningAttempt::findOrFail($f['id']);
        $result = $save ? $service->save($user, $program, $parent, $attempt, [], $f['revision'] - 1) : $service->submit($user, $program, $parent, $attempt, $f['answers'], $f['revision']);
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

    private function race(string $kind, bool $staleSave): void
    {
        $fixture = $this->fixture($kind);
        $names = ['race_'.bin2hex(random_bytes(8)), 'race_'.bin2hex(random_bytes(8))];
        $workers = [$this->worker($fixture, 'submit', $names[0]), $this->worker($fixture, $staleSave ? 'save' : 'submit', $names[1])];
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
            DB::commit();
            $results = [];
            foreach ($workers as $worker) {
                $this->assertSame(0, $worker->wait(), $worker->getErrorOutput());
                $results[] = json_decode($worker->getOutput(), true, 512, JSON_THROW_ON_ERROR);
            }
            $this->assertSame(200, $results[0]['http']);
            $this->assertSame('completed', $results[0]['status']);
            $this->assertSame($fixture['revision'] + 1, $results[0]['revision']);
            if (! $staleSave) {
                $this->assertEquals($results[0], $results[1]);
            } else {
                $this->assertContains($results[1]['http'], $kind === 'try_out' ? [409] : [200, 409]);
                if ($results[1]['http'] === 200) {
                    $this->assertEquals($results[0], $results[1]);
                }
            }
            $model = $kind === 'try_out' ? TryOutAttempt::findOrFail($fixture['id']) : LearningAttempt::findOrFail($fixture['id']);
            $this->assertSame($fixture['answers'], $model->answers);
            $this->assertEquals($results[0]['result'], $model->result_snapshot);
            $this->assertSame($fixture['revision'] + 1, $model->revision);
            $this->assertSame($kind === 'try_out' ? 180 : 1, $model->result_snapshot[$kind === 'try_out' ? 'earned' : 'correct']);
            if ($kind === 'learning') {
                $this->assertSame(1, DB::table('activity_completions')->where('user_id', $this->student->id)->count());
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
