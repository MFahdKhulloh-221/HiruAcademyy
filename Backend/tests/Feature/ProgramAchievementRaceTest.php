<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;
use Tests\TestCase;

require_once dirname(__DIR__).'/support/program-achievement-worker.php';

final class ProgramAchievementRaceTest extends TestCase
{
    private array $fixtures = [];

    private array $workers = [];

    protected function setUp(): void
    {
        parent::setUp();
        r20AchievementGuard();
        $this->assertSame(0, DB::transactionLevel());
    }

    protected function tearDown(): void
    {
        try {
            foreach ($this->workers as $worker) {
                if ($worker->isRunning()) {
                    $worker->stop(0);
                }
            }
            r20AchievementGuard();
            foreach (array_reverse($this->fixtures) as $fixture) {
                r20AchievementOwner($fixture);
                $owned = DB::transaction(function () use ($fixture): array {
                    // Immutable achievement model intentionally bypassed only for this verified synthetic owner.
                    DB::table('program_achievement_settings')->where('id', $fixture['setting'])->where('program_id', $fixture['program'])->delete();
                    $achievements = DB::table('program_achievements')->where('user_id', $fixture['user'])->where('program_id', $fixture['program'])->get();
                    foreach ($achievements as $achievement) {
                        $this->assertSame($fixture['tag'], $achievement->program_code_snapshot);
                        DB::table('program_achievements')->where('id', $achievement->id)->where('user_id', $fixture['user'])->where('program_id', $fixture['program'])->delete();
                    }
                    $owned = [];
                    foreach (DB::table('activity_completions')->where('user_id', $fixture['user'])->get() as $completion) {
                        $this->assertSame($fixture['chapter'], (int) $completion->chapter_id);
                        $this->assertSame($fixture['video'], (int) $completion->resource_id);
                        $this->assertSame('video', $completion->type);
                        $owned['activity_completions'][] = $completion->id;
                        DB::table('activity_completions')->where('id', $completion->id)->where('user_id', $fixture['user'])
                            ->where('chapter_id', $fixture['chapter'])->where('type', 'video')->where('resource_id', $fixture['video'])->delete();
                    }
                    foreach (DB::table('gamification_rewards')->where('user_id', $fixture['user'])->get() as $reward) {
                        $this->assertContains($reward->reward_key, ['video:'.$fixture['video'], 'chapter:'.$fixture['chapter']]);
                        $owned['gamification_rewards'][] = $reward->id;
                        DB::table('gamification_rewards')->where('id', $reward->id)->where('user_id', $fixture['user'])
                            ->where('reward_key', $reward->reward_key)->delete();
                    }
                    foreach (DB::table('gamification_days')->where('user_id', $fixture['user'])->get() as $day) {
                        $owned['gamification_days'][] = $day->id;
                        DB::table('gamification_days')->where('id', $day->id)->where('user_id', $fixture['user'])
                            ->where('activity_on', $day->activity_on)->delete();
                    }
                    foreach ($owned as $table => $ids) {
                        $this->assertFalse(DB::table($table)->whereIn('id', $ids)->exists(), $table.' owned rows remain');
                    }
                    DB::table('access_grants')->where('id', $fixture['grant'])->where('user_id', $fixture['user'])->where('program_id', $fixture['program'])->delete();
                    DB::table('program_offers')->where('id', $fixture['offer'])->where('program_id', $fixture['program'])->delete();
                    $modules = DB::table('learning_modules')->where('chapter_id', $fixture['chapter'])->get();
                    foreach ($modules as $module) {
                        $this->assertSame($fixture['tag'], $module->title);
                        DB::table('learning_modules')->where('id', $module->id)->where('chapter_id', $fixture['chapter'])->where('title', $fixture['tag'])->delete();
                    }
                    $this->assertFalse(DB::table('learning_modules')->where('chapter_id', $fixture['chapter'])->exists());
                    DB::table('video_lessons')->where('id', $fixture['video'])->where('chapter_id', $fixture['chapter'])->delete();
                    DB::table('chapters')->where('id', $fixture['chapter'])->where('program_id', $fixture['program'])->delete();
                    DB::table('programs')->where('id', $fixture['program'])->where('code', $fixture['tag'])->delete();
                    DB::table('users')->where('id', $fixture['user'])->where('email', $fixture['tag'].'@example.invalid')->delete();

                    return $owned;
                });
                foreach ($owned as $table => $ids) {
                    $this->assertFalse(DB::table($table)->whereIn('id', $ids)->exists(), $table.' owned rows remain after commit');
                }
                foreach (['setting' => 'program_achievement_settings', 'completion' => 'activity_completions',
                    'grant' => 'access_grants', 'offer' => 'program_offers', 'video' => 'video_lessons',
                    'chapter' => 'chapters', 'program' => 'programs', 'user' => 'users'] as $key => $table) {
                    $this->assertFalse(DB::table($table)->where('id', $fixture[$key])->exists(), $table.' fixture remains');
                }
                $this->assertSame(0, DB::table('program_achievements')->where('user_id', $fixture['user'])->count());
            }
        } finally {
            parent::tearDown();
        }
    }

    private function fixture(): array
    {
        r20AchievementGuard();
        $fixture = DB::transaction(function (): array {
            $tag = 'r20race-'.Str::uuid();
            $user = User::create(array_replace(array_diff_key(User::factory()->raw(), ['status' => true]), [
                'name' => $tag, 'email' => $tag.'@example.invalid', 'role' => 'student', 'account_status' => 'active',
            ]))->id;
            $program = DB::table('programs')->insertGetId(['code' => $tag, 'slug' => $tag, 'name' => $tag,
                'family' => 'interview', 'status' => 'active', 'sort_order' => 0]);
            $chapter = DB::table('chapters')->insertGetId(['program_id' => $program, 'chapter_number' => 1,
                'title' => $tag, 'status' => 'published']);
            $video = DB::table('video_lessons')->insertGetId(['chapter_id' => $chapter, 'title' => $tag,
                'video_url' => 'https://example.invalid/'.$tag, 'status' => 'published']);
            $offer = DB::table('program_offers')->insertGetId(['program_id' => $program, 'plan_code' => 'lms',
                'duration_months' => 1, 'status' => 'active']);
            $grant = DB::table('access_grants')->insertGetId(['user_id' => $user, 'program_id' => $program,
                'plan_code' => 'lms', 'starts_at' => now()->subDay()->toDateString(),
                'ends_at' => now()->addDay()->toDateString(), 'status' => 'active']);
            $completion = DB::table('activity_completions')->insertGetId(['user_id' => $user, 'chapter_id' => $chapter,
                'type' => 'video', 'resource_id' => $video, 'completed_at' => now('UTC')]);
            $setting = DB::table('program_achievement_settings')->insertGetId(['program_id' => $program, 'automatic_enabled' => true]);

            return compact('tag', 'user', 'program', 'chapter', 'video', 'offer', 'grant', 'completion', 'setting');
        });
        $this->fixtures[] = $fixture;
        r20AchievementOwner($fixture);

        return $fixture;
    }

    private function worker(array $fixture, string $operation): Process
    {
        $name = 'r20race-'.bin2hex(random_bytes(12));
        // DB credentials inherited from approved runtime; never serialized into arguments or output.
        $worker = new Process([PHP_BINARY, base_path('tests/support/program-achievement-worker.php')], base_path(), [
            'APP_ENV' => 'testing', 'APP_CONFIG_CACHE' => base_path('bootstrap/cache/r20-nonexistent.php'),
            'R20_FIXTURE' => json_encode($fixture, JSON_THROW_ON_ERROR), 'R20_NAME' => $name, 'R20_OP' => $operation,
        ], null, 20);
        $worker->start();
        $this->workers[] = $worker;
        $this->assertTrue($worker->waitUntil(fn () => str_contains($worker->getOutput(), '"event":"connected"')), $worker->getErrorOutput());

        return $worker;
    }

    private function events(Process $worker): array
    {
        return array_map(fn ($line) => json_decode($line, true, flags: JSON_THROW_ON_ERROR), array_filter(explode("\n", trim($worker->getOutput()))));
    }

    private function locked(Process $worker): void
    {
        $this->assertTrue(str_contains($worker->getOutput(), '"event":"locked"')
            || $worker->waitUntil(fn () => str_contains($worker->getOutput(), '"event":"locked"')), $worker->getErrorOutput());
        $pid = $this->events($worker)[0]['pid'];
        $deadline = microtime(true) + 1;
        do {
            $row = $this->observe($pid);
            if ($row->wait_event_type === 'Timeout' && $row->wait_event === 'PgSleep') {
                return;
            }
            $worker->checkTimeout();
        } while ($worker->isRunning() && microtime(true) < $deadline);
        $this->fail('Holder did not enter server-side PgSleep.');
    }

    private function observe(int $pid): object
    {
        DB::select('SELECT pg_stat_clear_snapshot()');
        $row = DB::selectOne('SELECT pid, application_name, state, wait_event_type, wait_event, pg_blocking_pids(pid)::text AS blockers FROM pg_stat_activity WHERE pid = ?', [$pid]);
        $this->assertNotNull($row);
        $this->assertStringStartsWith('r20race-', $row->application_name);

        return $row;
    }

    private function blocked(Process $waiting, Process $holder): void
    {
        $pid = $this->events($waiting)[0]['pid'];
        $holderPid = $this->events($holder)[0]['pid'];
        $this->assertNotSame($pid, $holderPid);
        $deadline = microtime(true) + 2;
        do {
            $row = $this->observe($pid);
            if ($row->wait_event_type === 'Lock' && in_array($holderPid, array_map('intval', explode(',', trim($row->blockers, '{}'))), true)) {
                fwrite(STDERR, json_encode(['barrier' => 'blocked', 'waiting' => $row, 'holder' => $this->observe($holderPid)], JSON_THROW_ON_ERROR)."\n");

                return;
            }
            $waiting->checkTimeout();
        } while ($waiting->isRunning() && microtime(true) < $deadline);
        $this->fail('Expected PostgreSQL Lock wait with exact blocking backend PID.');
    }

    private function workerResult(Process $worker): array
    {
        $this->assertSame(0, $worker->wait(), $worker->getErrorOutput());
        $events = $this->events($worker);
        $result = end($events);
        fwrite(STDERR, json_encode(['worker' => $events], JSON_THROW_ON_ERROR)."\n");
        $this->assertSame('result', $result['event']);
        $this->assertSame(0, $result['transaction_level']);

        return $result;
    }

    private function assertAchievementCount(array $fixture, int $expected): void
    {
        $this->assertSame($expected, DB::table('program_achievements')->where('user_id', $fixture['user'])->where('program_id', $fixture['program'])->count());
    }

    private function removeFinalCompletion(array $fixture): void
    {
        r20AchievementOwner($fixture);
        $this->assertSame(1, DB::table('activity_completions')->where('id', $fixture['completion'])
            ->where('user_id', $fixture['user'])->where('chapter_id', $fixture['chapter'])
            ->where('type', 'video')->where('resource_id', $fixture['video'])->delete());
    }

    public function test_two_final_completions_overlap_and_reconcile_one_achievement_without_duplicate_xp(): void
    {
        $fixture = $this->fixture();
        $this->removeFinalCompletion($fixture);
        $first = $this->worker($fixture, 'complete-holder');
        $this->locked($first);
        $second = $this->worker($fixture, 'complete');
        $this->blocked($second, $first);
        $a = $this->workerResult($first);
        $b = $this->workerResult($second);
        $this->assertSame('complete-holder', $a['reason']);
        $this->assertSame('complete', $b['reason']);
        foreach ([$a, $b] as $result) {
            $this->assertSame($fixture['chapter'], $result['progress']['chapter_id']);
            $this->assertTrue($result['progress']['activities']['video']['complete']);
            $this->assertSame([$fixture['video']], $result['progress']['activities']['video']['completed_ids']);
        }
        $deferred = array_values(array_filter($this->events($first), fn ($event) => $event['event'] === 'deferred'));
        $this->assertCount(1, $deferred);
        $this->assertSame(1, $deferred[0]['transaction_level']);
        $this->assertSame(0, $deferred[0]['rows']);
        $callbacks = array_values(array_filter($this->events($first), fn ($event) => $event['event'] === 'after_commit'));
        $this->assertCount(1, $callbacks);
        $this->assertSame(0, $callbacks[0]['transaction_level']);
        $completions = DB::table('activity_completions')->where('user_id', $fixture['user'])->get();
        $this->assertCount(1, $completions);
        $completion = $completions->first();
        $this->assertNotSame($fixture['completion'], (int) $completion->id);
        $this->assertSame($fixture['chapter'], (int) $completion->chapter_id);
        $this->assertSame('video', $completion->type);
        $this->assertSame($fixture['video'], (int) $completion->resource_id);
        $this->assertAchievementCount($fixture, 1);
        $snapshot = json_decode(DB::table('program_achievements')->where('user_id', $fixture['user'])
            ->where('program_id', $fixture['program'])->value('completion_evidence_snapshot'), true, flags: JSON_THROW_ON_ERROR);
        $this->assertSame((int) $completion->id, $snapshot['chapters'][0]['tasks'][0]['completion_id']);
        $rewards = DB::table('gamification_rewards')->where('user_id', $fixture['user'])->get();
        $this->assertCount(2, $rewards);
        $this->assertSame(10, (int) $rewards->firstWhere('reward_key', 'video:'.$fixture['video'])?->xp);
        $this->assertSame(30, (int) $rewards->firstWhere('reward_key', 'chapter:'.$fixture['chapter'])?->xp);
        $days = DB::table('gamification_days')->where('user_id', $fixture['user'])->get();
        $this->assertCount(1, $days);
        $this->assertSame(40, (int) $days->first()->xp);
        $this->assertSame(40, (int) $rewards->sum('xp'));
    }

    public function test_real_completion_outer_rollback_discards_evidence_rewards_and_reconciliation(): void
    {
        $fixture = $this->fixture();
        $this->removeFinalCompletion($fixture);
        $worker = $this->worker($fixture, 'complete-rollback');
        $result = $this->workerResult($worker);
        $this->assertTrue($result['progress']['activities']['video']['complete']);
        $deferred = array_values(array_filter($this->events($worker), fn ($event) => $event['event'] === 'deferred'));
        $this->assertCount(1, $deferred);
        $this->assertSame(1, $deferred[0]['transaction_level']);
        $this->assertSame(0, $deferred[0]['rows']);
        $this->assertEmpty(array_filter($this->events($worker), fn ($event) => $event['event'] === 'after_commit'));
        $this->assertAchievementCount($fixture, 0);
        foreach (['activity_completions', 'gamification_rewards', 'gamification_days'] as $table) {
            $this->assertFalse(DB::table($table)->where('user_id', $fixture['user'])->exists());
        }
    }

    public function test_same_owner_issuers_overlap_and_return_one_immutable_achievement(): void
    {
        $fixture = $this->fixture();
        $first = $this->worker($fixture, 'holder');
        $this->locked($first);
        $second = $this->worker($fixture, 'issue');
        $b = $this->workerResult($second);
        $this->assertOverlappingSleep($first, $b);
        $a = $this->workerResult($first);
        $this->assertSame('existing', $a['reason']);
        $this->assertSame('issued', $b['reason']);
        $this->assertNotNull($a['id']);
        $this->assertSame($a['id'], $b['id']);
        $this->assertAchievementCount($fixture, 1);
    }

    private function assertOverlappingSleep(Process $holder, array $completed): void
    {
        $pid = $this->events($holder)[0]['pid'];
        $this->assertNotSame($pid, $completed['pid']);
        $row = $this->observe($pid);
        $this->assertSame('PgSleep', $row->wait_event);
        $this->assertSame('{}', $row->blockers);
        fwrite(STDERR, json_encode(['barrier' => 'holderPgSleep', 'holder' => $row, 'completed' => $completed,
            'former_blocked_baseline_seconds' => 2.630], JSON_THROW_ON_ERROR)."\n");
    }

    public function test_different_owners_issue_while_snapshots_overlap(): void
    {
        $one = $this->fixture();
        $two = $this->fixture();
        $first = $this->worker($one, 'holder');
        $this->locked($first);
        $second = $this->worker($two, 'issue');
        $b = $this->workerResult($second);
        $this->assertOverlappingSleep($first, $b);
        $a = $this->workerResult($first);
        $this->assertSame('issued', $a['reason']);
        $this->assertSame('issued', $b['reason']);
        $this->assertNotSame($a['id'], $b['id']);
        $this->assertNotSame($a['pid'], $b['pid']);
        $this->assertAchievementCount($one, 1);
        $this->assertAchievementCount($two, 1);
    }

    public function test_mutations_commit_during_old_coherent_snapshot_then_fresh_issuance_rejects(): void
    {
        foreach (['delete' => 'incomplete', 'disable' => 'disabled', 'publish' => 'empty_chapter', 'mutate' => 'disabled', 'add-module' => 'incomplete', 'revoke' => 'learning_type_unresolved'] as $operation => $reason) {
            $fixture = $this->fixture();
            $first = $this->worker($fixture, 'holder');
            $this->locked($first);
            $writer = $this->worker($fixture, $operation);
            $written = $this->workerResult($writer);
            $this->assertSame($operation, $written['reason']);
            $this->assertOverlappingSleep($first, $written);
            $issued = $this->workerResult($first);
            $this->assertSame('issued', $issued['reason']);
            $snapshot = json_decode(DB::table('program_achievements')->where('id', $issued['id'])->value('completion_evidence_snapshot'), true, flags: JSON_THROW_ON_ERROR);
            $this->assertSame($fixture['grant'], $snapshot['source_grant_id']);
            $this->assertCount(1, $snapshot['chapters']);
            $this->assertSame($fixture['chapter'], $snapshot['chapters'][0]['chapter_id']);
            $tasks = $snapshot['chapters'][0]['tasks'];
            $this->assertCount(1, $tasks);
            $this->assertSame('video', $tasks[0]['type']);
            $this->assertSame($fixture['video'], $tasks[0]['resource_id']);
            $this->assertSame($fixture['completion'], $tasks[0]['completion_id']);
            $this->assertNotEmpty($tasks[0]['completed_at']);
            if ($operation === 'mutate') {
                $this->assertFalse(DB::table('activity_completions')->where('id', $fixture['completion'])->exists());
                $this->assertFalse((bool) DB::table('program_achievement_settings')->where('id', $fixture['setting'])->value('automatic_enabled'));
                $this->assertSame(1, DB::table('learning_modules')->where('chapter_id', $fixture['chapter'])
                    ->where('title', $fixture['tag'])->where('status', 'published')->count());
            }
            $this->assertAchievementCount($fixture, 1);
            // Only remove exact synthetic achievement: existing snapshots intentionally bypass reevaluation.
            r20AchievementOwner($fixture);
            $this->assertSame(1, DB::table('program_achievements')->where('id', $issued['id'])
                ->where('user_id', $fixture['user'])->where('program_id', $fixture['program'])
                ->where('program_code_snapshot', $fixture['tag'])->delete());
            $rejected = $this->workerResult($this->worker($fixture, 'issue'));
            $this->assertSame($reason, $rejected['reason']);
            $this->assertNull($rejected['id']);
            $this->assertAchievementCount($fixture, 0);
        }
    }

    public function test_unrelated_program_evidence_writer_completes_without_global_blockers(): void
    {
        $one = $this->fixture();
        $two = $this->fixture();
        $holder = $this->worker($one, 'holder');
        $this->locked($holder);
        $writer = $this->worker($two, 'delete');
        $result = $this->workerResult($writer);
        $this->assertSame('delete', $result['reason']);
        $this->assertOverlappingSleep($holder, $result);
        $this->assertSame('issued', $this->workerResult($holder)['reason']);
        $this->assertAchievementCount($one, 1);
        $this->assertAchievementCount($two, 0);
    }

    public function test_partial_evidence_before_snapshot_never_issues(): void
    {
        $fixture = $this->fixture();
        $this->workerResult($this->worker($fixture, 'add-module'));
        $this->assertTrue(DB::table('activity_completions')->where('id', $fixture['completion'])->where('user_id', $fixture['user'])->exists());
        $result = $this->workerResult($this->worker($fixture, 'issue'));
        $this->assertSame('incomplete', $result['reason']);
        $this->assertNull($result['id']);
        $this->assertAchievementCount($fixture, 0);
    }

    public function test_nested_issue_defers_until_commit_and_rollback_discards_callback(): void
    {
        foreach (['aftercommit', 'rollback'] as $operation) {
            $fixture = $this->fixture();
            DB::table('activity_completions')->where('id', $fixture['completion'])->where('user_id', $fixture['user'])->delete();
            $worker = $this->worker($fixture, $operation);
            $result = $this->workerResult($worker);
            $events = $this->events($worker);
            $deferred = array_values(array_filter($events, fn ($event) => $event['event'] === 'deferred'));
            $this->assertCount(1, $deferred);
            $this->assertSame('deferred_until_commit', $deferred[0]['reason']);
            $this->assertNull($deferred[0]['id']);
            $this->assertSame(0, $deferred[0]['rows']);
            $callbacks = array_values(array_filter($events, fn ($event) => $event['event'] === 'after_commit'));
            $this->assertCount($operation === 'aftercommit' ? 1 : 0, $callbacks);
            if ($callbacks !== []) {
                $this->assertSame(0, $callbacks[0]['transaction_level']);
            }
            $evaluations = array_values(array_filter($events, fn ($event) => $event['event'] === 'evaluate'));
            $this->assertCount($operation === 'aftercommit' ? 1 : 0, $evaluations);
            if ($operation === 'aftercommit') {
                $this->assertNotNull($result['id']);
                $this->assertSame('serializable', $evaluations[0]['isolation']);
                $this->assertSame(1, $evaluations[0]['transaction_level']);
            } else {
                $this->assertNull($result['id']);
            }
            $this->assertAchievementCount($fixture, $operation === 'aftercommit' ? 1 : 0);
        }
    }

    public function test_serialization_injection_retries_and_exhaustion_returns_safe_conflict(): void
    {
        foreach (['inject40001' => 2, 'exhaust40001' => 3] as $operation => $attempts) {
            $fixture = $this->fixture();
            $worker = $this->worker($fixture, $operation);
            $result = $this->workerResult($worker);
            $evaluations = array_values(array_filter($this->events($worker), fn ($event) => $event['event'] === 'evaluate'));
            $this->assertCount($attempts, $evaluations);
            $this->assertSame($operation === 'exhaust40001' ? 'issuance_conflict' : 'issued', $result['reason']);
            $this->assertAchievementCount($fixture, $operation === 'exhaust40001' ? 0 : 1);
            if ($operation === 'exhaust40001') {
                $this->assertNull($result['id']);
            }
        }
    }

    public function test_real_advisory_induced_deadlock_retries_within_three_attempts(): void
    {
        $one = $this->fixture();
        $two = $this->fixture();
        $a = $this->worker($one + ['peer_user' => $two['user']], 'deadlockA');
        $b = $this->worker($two + ['peer_user' => $one['user']], 'deadlockB');
        $this->blocked($a, $b);
        $this->blocked($b, $a);
        $ar = $this->workerResult($a);
        $br = $this->workerResult($b);
        $this->assertNotSame($ar['pid'], $br['pid']);
        $collisions = [];
        foreach ([$a, $b] as $worker) {
            $events = $this->events($worker);
            $evaluations = array_values(array_filter($events, fn ($event) => $event['event'] === 'evaluate'));
            $this->assertLessThanOrEqual(3, count($evaluations));
            $this->assertNotEmpty(array_filter($events, fn ($event) => $event['event'] === 'advisory_peer'));
            $collisions = array_merge($collisions, array_values(array_filter($events, fn ($event) => $event['event'] === 'collision')));
        }
        $this->assertCount(1, $collisions);
        $this->assertSame('40P01', $collisions[0]['sqlstate']);
        $this->assertSame('issued', $ar['reason']);
        $this->assertSame('issued', $br['reason']);
        $this->assertAchievementCount($one, 1);
        $this->assertAchievementCount($two, 1);
    }

    public function test_uncommitted_same_pair_insert_causes_bounded_unique_wait_conflict(): void
    {
        $fixture = $this->fixture();
        $writer = $this->worker($fixture, 'unique-holder');
        $this->locked($writer);
        $issuer = $this->worker($fixture, 'timeout');
        $this->blocked($issuer, $writer);
        $result = $this->workerResult($issuer);
        $this->assertSame('issuance_conflict', $result['reason']);
        $collisions = array_values(array_filter($this->events($issuer), fn ($event) => $event['event'] === 'collision'));
        $this->assertCount(1, $collisions);
        $this->assertSame('55P03', $collisions[0]['sqlstate']);
        $this->assertNull($result['id']);
        $this->assertSame('PgSleep', $this->observe($this->events($writer)[0]['pid'])->wait_event);
        $this->assertAchievementCount($fixture, 0);
        $this->assertSame('unique-holder', $this->workerResult($writer)['reason']);
        $this->assertAchievementCount($fixture, 0);
    }
}
