<?php

use App\Models\Chapter;
use App\Models\Program;
use App\Models\User;
use App\Services\LearningProgressService;
use App\Services\ProgramAchievementEligibility;
use App\Services\ProgramAchievementLearningType;
use App\Services\ProgramAchievementService;
use App\Services\ProgramAchievementSettings;
use App\Support\DatabaseSafety;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

function r20AchievementGuard(): void
{
    $config = DB::connection()->getConfig();
    if (getenv('HIRU_DISPOSABLE_TESTING') !== '1' || ! app()->environment('testing')
        || app()->configurationIsCached() || ($config['database'] ?? '') !== 'hiru_academy_test'
        || ($config['username'] ?? '') !== 'hiru_test_runner' || (string) ($config['port'] ?? '') !== '55432') {
        throw new RuntimeException('R20 requires guarded disposable test runtime.');
    }
    DatabaseSafety::assertTarget(true);
    $schema = 'hiru_backend_test_gamification_final_20261008';
    $identity = DB::selectOne("SELECT inet_server_port() AS port, session_user AS role,
        current_schema() AS schema, current_setting('search_path') AS search_path,
        (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass_rls");
    if (getenv('HIRU_TEST_SCHEMA') !== $schema || $identity->schema !== $schema || $identity->search_path !== $schema
        || $identity->bypass_rls || (int) $identity->port !== 55432 || $identity->role !== 'hiru_test_runner') {
        throw new RuntimeException('R20 server identity rejected.');
    }
    DB::statement("SET statement_timeout = '8s'");
    DB::statement("SET lock_timeout = '3s'");
}

function r20AchievementOwner(array $fixture): void
{
    if (! preg_match('/^r20race-[0-9a-f-]{36}$/D', $fixture['tag'] ?? '')
        || ! DB::table('users')->where('id', $fixture['user'])->where('email', $fixture['tag'].'@example.invalid')->exists()
        || ! DB::table('programs')->where('id', $fixture['program'])->where('code', $fixture['tag'])->exists()
        || ! DB::table('chapters')->where('id', $fixture['chapter'])->where('program_id', $fixture['program'])->exists()
        || ! DB::table('video_lessons')->where('id', $fixture['video'])->where('chapter_id', $fixture['chapter'])->exists()
        || ! DB::table('access_grants')->where('id', $fixture['grant'])->where('user_id', $fixture['user'])->where('program_id', $fixture['program'])->exists()
        || ! DB::table('program_offers')->where('id', $fixture['offer'])->where('program_id', $fixture['program'])->exists()
        || ! DB::table('program_achievement_settings')->where('id', $fixture['setting'])->where('program_id', $fixture['program'])->exists()) {
        throw new RuntimeException('R20 fixture ownership rejected.');
    }
    $completion = DB::table('activity_completions')->where('id', $fixture['completion'])->first();
    if ($completion && ((int) $completion->user_id !== $fixture['user'] || (int) $completion->chapter_id !== $fixture['chapter']
        || (int) $completion->resource_id !== $fixture['video'] || $completion->type !== 'video')) {
        throw new RuntimeException('R20 completion ownership rejected.');
    }
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') !== __FILE__) {
    return;
}

require dirname(__DIR__, 2).'/vendor/autoload.php';
$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

try {
    r20AchievementGuard();
    $fixture = json_decode(getenv('R20_FIXTURE'), true, flags: JSON_THROW_ON_ERROR);
    r20AchievementOwner($fixture);
    $name = getenv('R20_NAME');
    if (! preg_match('/^r20race-[0-9a-f]+$/D', $name)) {
        throw new RuntimeException('R20 application name rejected.');
    }
    DB::select('SELECT set_config(?, ?, false)', ['application_name', $name]);
    $started = microtime(true);
    $emit = static function (string $event, array $data = []) use ($started): void {
        echo json_encode(['event' => $event, 'pid' => DB::selectOne('SELECT pg_backend_pid() AS pid')->pid,
            'elapsed' => microtime(true) - $started] + $data, JSON_THROW_ON_ERROR)."\n";
        flush();
    };
    $emit('connected');
    $operation = getenv('R20_OP');
    if (in_array($operation, ['complete-holder', 'complete', 'complete-rollback'], true)) {
        if ($operation !== 'complete') {
            DB::beginTransaction();
            User::whereKey($fixture['user'])->lockForUpdate()->firstOrFail();
            if ($operation === 'complete-holder') {
                $emit('locked');
                DB::select('SELECT pg_sleep(3)');
            }
        }
        $progress = app(LearningProgressService::class)->complete(
            User::findOrFail($fixture['user']), Program::findOrFail($fixture['program']),
            Chapter::findOrFail($fixture['chapter']), 'video', $fixture['video']
        );
        if ($operation !== 'complete') {
            $emit('deferred', ['transaction_level' => DB::transactionLevel(),
                'rows' => DB::table('program_achievements')->where('user_id', $fixture['user'])->where('program_id', $fixture['program'])->count()]);
            DB::afterCommit(fn () => $emit('after_commit', ['transaction_level' => DB::transactionLevel()]));
            $operation === 'complete-rollback' ? DB::rollBack() : DB::commit();
        }
        $emit('result', ['reason' => $operation, 'progress' => $progress, 'transaction_level' => DB::transactionLevel()]);
    } elseif (in_array($operation, ['delete', 'disable', 'publish', 'mutate', 'add-module', 'revoke', 'unique-holder'], true)) {
        DB::transaction(function () use ($fixture, $operation, $emit): void {
            r20AchievementOwner($fixture);
            if (in_array($operation, ['disable', 'mutate'], true)) {
                DB::table('program_achievement_settings')->where('id', $fixture['setting'])->where('program_id', $fixture['program'])->update(['automatic_enabled' => false]);
            }
            if (in_array($operation, ['delete', 'mutate'], true)) {
                DB::table('activity_completions')->where('id', $fixture['completion'])->where('user_id', $fixture['user'])->where('chapter_id', $fixture['chapter'])->delete();
            }
            if ($operation === 'revoke') {
                DB::table('access_grants')->where('id', $fixture['grant'])->where('user_id', $fixture['user'])
                    ->where('program_id', $fixture['program'])->update(['status' => 'inactive']);
            }
            if ($operation === 'publish') {
                DB::table('video_lessons')->where('id', $fixture['video'])->where('chapter_id', $fixture['chapter'])->update(['status' => 'draft']);
            }
            if (in_array($operation, ['mutate', 'add-module'], true)) {
                DB::table('learning_modules')->insert(['chapter_id' => $fixture['chapter'], 'title' => $fixture['tag'],
                    'module_type' => 'general', 'status' => 'published']);
            }
            if ($operation === 'unique-holder') {
                // Raw insert confined to verified synthetic pair; rollback removes competing row.
                DB::table('program_achievements')->insert(['user_id' => $fixture['user'], 'program_id' => $fixture['program'],
                    'student_name_snapshot' => $fixture['tag'], 'program_name_snapshot' => $fixture['tag'],
                    'program_code_snapshot' => $fixture['tag'], 'learning_type_snapshot' => 'lms',
                    'presentation_snapshot' => json_encode(['title' => $fixture['tag']], JSON_THROW_ON_ERROR),
                    'completion_evidence_snapshot' => json_encode(['user_id' => $fixture['user']], JSON_THROW_ON_ERROR),
                    'issued_at' => now('UTC')]);
                $emit('locked');
                DB::select('SELECT pg_sleep(7)');
                DB::table('program_achievements')->where('user_id', $fixture['user'])->where('program_id', $fixture['program'])
                    ->where('program_code_snapshot', $fixture['tag'])->delete();
            }
        });
        $emit('result', ['reason' => $operation, 'id' => null, 'transaction_level' => DB::transactionLevel()]);
    } else {
        $evaluator = new class(app(LearningProgressService::class), $operation, $emit, $fixture) extends ProgramAchievementEligibility
        {
            public function __construct($progress, private string $operation, private Closure $emit, private array $fixture)
            {
                parent::__construct($progress);
            }

            private int $attempts = 0;

            public function evaluate(User $user, Program $program): array
            {
                $this->attempts++;
                ($this->emit)('evaluate', ['attempt' => $this->attempts, 'transaction_level' => DB::transactionLevel(),
                    'isolation' => DB::selectOne('SHOW transaction_isolation')->transaction_isolation]);
                if (in_array($this->operation, ['inject40001', 'exhaust40001'], true)
                    && ($this->attempts === 1 || $this->operation === 'exhaust40001')) {
                    $state = '40001';
                    DB::unprepared("DO $$ BEGIN RAISE EXCEPTION 'synthetic retry probe' USING ERRCODE = '$state'; END $$");
                }
                if ($this->operation === 'timeout') {
                    // Harness unique collision before normal evaluation exposes real 55P03 to service handler.
                    try {
                        DB::table('program_achievements')->insert(['user_id' => $user->id, 'program_id' => $program->id,
                            'student_name_snapshot' => $this->fixture['tag'], 'program_name_snapshot' => $this->fixture['tag'],
                            'program_code_snapshot' => $this->fixture['tag'], 'learning_type_snapshot' => 'lms',
                            'presentation_snapshot' => '{"probe":true}', 'completion_evidence_snapshot' => '{"probe":true}',
                            'issued_at' => now('UTC')]);
                    } catch (QueryException $exception) {
                        echo json_encode(['event' => 'collision', 'sqlstate' => $exception->errorInfo[0],
                            'attempt' => $this->attempts], JSON_THROW_ON_ERROR)."\n";
                        flush();
                        throw $exception;
                    }
                    throw new RuntimeException('Expected competing synthetic unique insert to remain uncommitted.');
                }
                if (in_array($this->operation, ['deadlockA', 'deadlockB'], true) && $this->attempts === 1) {
                    // Harness-only advisory collision, not a claim of a natural issuance deadlock.
                    $a = min($this->fixture['user'], $this->fixture['peer_user']);
                    $b = max($this->fixture['user'], $this->fixture['peer_user']);
                    [$first, $second] = $this->operation === 'deadlockA' ? [$a, $b] : [$b, $a];
                    DB::select('SELECT pg_advisory_xact_lock(20261110, ?)', [$first]);
                    ($this->emit)('advisory_locked', ['key' => $first]);
                    $deadline = microtime(true) + 4;
                    do {
                        $peer = DB::selectOne("SELECT pid FROM pg_locks WHERE locktype = 'advisory'
                            AND classid = 20261110 AND objid = ? AND granted AND pid <> pg_backend_pid()", [$second]);
                        if ($peer !== null) {
                            break;
                        }
                        DB::select('SELECT pg_sleep(0.01)');
                    } while (microtime(true) < $deadline);
                    if ($peer === null) {
                        throw new RuntimeException('Advisory deadlock peer barrier expired.');
                    }
                    ($this->emit)('advisory_peer', ['peer_pid' => $peer->pid, 'next_key' => $second]);
                    try {
                        DB::select('SELECT pg_advisory_xact_lock(20261110, ?)', [$second]);
                    } catch (QueryException $exception) {
                        // Do not query aborted transaction while recording actual PostgreSQL SQLSTATE.
                        echo json_encode(['event' => 'collision', 'sqlstate' => $exception->errorInfo[0],
                            'attempt' => $this->attempts], JSON_THROW_ON_ERROR)."\n";
                        flush();
                        throw $exception;
                    }
                }
                if ($this->operation === 'holder') {
                    ($this->emit)('locked');
                    DB::select('SELECT pg_sleep(3)');
                }

                return parent::evaluate($user, $program);
            }
        };
        $service = new ProgramAchievementService(app(ProgramAchievementSettings::class), $evaluator, app(ProgramAchievementLearningType::class));
        if (in_array($operation, ['aftercommit', 'rollback'], true)) {
            DB::beginTransaction();
            DB::table('activity_completions')->insert(['id' => $fixture['completion'], 'user_id' => $fixture['user'],
                'chapter_id' => $fixture['chapter'], 'type' => 'video', 'resource_id' => $fixture['video'], 'completed_at' => now('UTC')]);
            $deferred = $service->issue(User::findOrFail($fixture['user']), Program::findOrFail($fixture['program']));
            $emit('deferred', ['reason' => $deferred['reason'], 'id' => $deferred['achievement']?->id,
                'rows' => DB::table('program_achievements')->where('user_id', $fixture['user'])->where('program_id', $fixture['program'])->count()]);
            DB::afterCommit(fn () => $emit('after_commit', ['transaction_level' => DB::transactionLevel()]));
            $operation === 'rollback' ? DB::rollBack() : DB::commit();
            $row = DB::table('program_achievements')->where('user_id', $fixture['user'])->where('program_id', $fixture['program'])->first();
            $emit('result', ['reason' => $operation, 'id' => $row?->id, 'transaction_level' => DB::transactionLevel()]);
        } else {
            $result = $service->issue(User::findOrFail($fixture['user']), Program::findOrFail($fixture['program']));
            $emit('result', ['reason' => $result['reason'], 'id' => $result['achievement']?->id, 'transaction_level' => DB::transactionLevel()]);
        }
    }
} catch (QueryException $exception) {
    fwrite(STDERR, get_class($exception).': '.$exception->getMessage()."\n");
    exit(1);
} catch (Throwable $exception) {
    fwrite(STDERR, get_class($exception).': '.$exception->getMessage()."\n");
    exit(1);
}
