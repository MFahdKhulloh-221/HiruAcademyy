<?php

namespace Tests\Feature;

use App\Models\Chapter;
use App\Models\Program;
use App\Models\User;
use App\Services\LearningAttemptService;
use App\Services\LearningProgressService;
use App\Services\ProgramAchievementEligibility;
use App\Services\ProgramAchievementReconciliationService;
use App\Services\ProgramAchievementService;
use App\Support\DatabaseSafety;
use Illuminate\Contracts\Debug\ExceptionHandler;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ProgramAchievementCompletionTest extends TestCase
{
    private array $createdRows = [];

    private array $ownedUsers = [];

    private array $ownedPrograms = [];

    private array $reusedPrograms = [];

    public function createApplication()
    {
        if (getenv('HIRU_DISPOSABLE_TESTING') !== '1') {
            throw new \RuntimeException('Disposable testing opt-in required.');
        }
        $app = parent::createApplication();
        $this->assertSafeTarget();

        return $app;
    }

    private function assertSafeTarget(): void
    {
        $config = DB::connection()->getConfig();
        if (getenv('HIRU_DISPOSABLE_TESTING') !== '1'
            || ! app()->environment('testing') || app()->configurationIsCached()
            || ($config['host'] ?? null) !== '127.0.0.1'
            || (string) ($config['port'] ?? '') !== '55432'
            || ($config['username'] ?? null) !== 'hiru_test_runner'
            || ($config['database'] ?? null) !== 'hiru_academy_test'
            || getenv('HIRU_TEST_SCHEMA') !== 'hiru_backend_test_gamification_final_20261008'
            || DB::selectOne('SELECT current_schema() AS name')->name !== 'hiru_backend_test_gamification_final_20261008') {
            throw new \RuntimeException('Program achievement completion target rejected.');
        }
        DatabaseSafety::assertTarget(true);
    }

    protected function tearDown(): void
    {
        try {
            while (DB::transactionLevel() > 0) {
                DB::rollBack();
            }
            $this->assertSafeTarget();
            DB::transaction(function (): void {
                foreach ($this->ownedUsers as $id => $email) {
                    if (! str_ends_with($email, '@example.test') || ! Str::isUuid(substr($email, 0, -13))
                        || DB::table('users')->where('id', $id)->where('email', '!=', $email)->exists()) {
                        throw new \RuntimeException('Synthetic user cleanup ownership rejected.');
                    }
                }
                foreach ($this->ownedPrograms as $id => $slug) {
                    if (! str_starts_with($slug, 'c4a-') || ! Str::isUuid(substr($slug, 4))
                        || DB::table('programs')->where('id', $id)->where('slug', '!=', $slug)->exists()) {
                        throw new \RuntimeException('Synthetic program cleanup ownership rejected.');
                    }
                }
                foreach ($this->reusedPrograms as $id => $code) {
                    if (! in_array($code, ['n5', 'n4'], true)
                        || ! DB::table('programs')->where('id', $id)->where('code', $code)->exists()) {
                        throw new \RuntimeException('Reused program cleanup ownership rejected.');
                    }
                }
                $users = array_keys($this->ownedUsers);
                $awards = DB::table('program_achievements')->whereIn('user_id', $users);
                if ((clone $awards)->whereNotIn('program_id', array_merge(array_keys($this->ownedPrograms), array_keys($this->reusedPrograms)))->exists()) {
                    throw new \RuntimeException('Achievement cleanup program ownership rejected.');
                }
                // Service-created rows: capture exact IDs under verified synthetic owners first.
                foreach (['program_achievements', 'gamification_rewards', 'gamification_days', 'activity_completions', 'learning_attempts'] as $table) {
                    $ids = DB::table($table)->whereIn('user_id', $users)->pluck('id')->all();
                    DB::table($table)->whereIn('user_id', $users)->whereIn('id', $ids)->delete();
                    $this->assertSame(0, DB::table($table)->whereIn('id', $ids)->count());
                }
                foreach (array_reverse($this->createdRows) as [$table, $id]) {
                    DB::table($table)->where('id', $id)->delete();
                }
                foreach ($this->createdRows as [$table, $id]) {
                    $this->assertFalse(DB::table($table)->where('id', $id)->exists(), 'Synthetic fixture remains: '.$table.'#'.$id);
                }
            });
        } finally {
            parent::tearDown();
        }
    }

    public static function completionTypes(): array
    {
        return [['video'], ['module'], ['flashcard']];
    }

    #[DataProvider('completionTypes')]
    public function test_last_activity_awards_and_repeat_preserves_achievement_id(string $type): void
    {
        [$user, $program, $chapter] = $this->fixture($type === 'flashcard' ? 'foundation' : 'interview');
        $resource = $this->resource($chapter, $type);
        $this->complete($user, $program, $chapter, $type, $resource);
        $id = $this->awardId($user, $program);
        $this->assertNotNull($id);
        $this->complete($user, $program, $chapter, $type, $resource);
        $this->assertSame($id, $this->awardId($user, $program));
        $this->assertSame(1, DB::table('program_achievements')->where('user_id', $user->id)->count());
        $this->assertSame(1, DB::table('activity_completions')->where('user_id', $user->id)->count());
    }

    public function test_nonlast_activity_and_other_chapter_completion_do_not_award(): void
    {
        [$user, $program, $chapter] = $this->fixture();
        $video = $this->resource($chapter, 'video');
        $module = $this->resource($chapter, 'module');
        $other = $this->chapter($program);
        $otherVideo = $this->resource($other, 'video');
        $this->complete($user, $program, $chapter, 'video', $video);
        $this->assertNull($this->awardId($user, $program));
        $this->complete($user, $program, $other, 'video', $otherVideo);
        $this->assertNull($this->awardId($user, $program));
        $this->complete($user, $program, $chapter, 'module', $module);
        $this->assertNotNull($this->awardId($user, $program));
    }

    public function test_nested_completion_waits_for_root_commit(): void
    {
        [$user, $program, $chapter] = $this->fixture();
        $video = $this->resource($chapter, 'video');
        $this->assertSame(0, DB::transactionLevel());
        DB::beginTransaction();
        DB::beginTransaction();
        $this->complete($user, $program, $chapter, 'video', $video);
        $this->assertNull($this->awardId($user, $program));
        DB::commit();
        $this->assertSame(1, DB::transactionLevel());
        $this->assertNull($this->awardId($user, $program));
        DB::commit();
        $this->assertSame(0, DB::transactionLevel());
        $this->assertNotNull($this->awardId($user, $program));
    }

    public function test_outer_rollback_discards_completion_rewards_and_callback(): void
    {
        [$user, $program, $chapter] = $this->fixture();
        $video = $this->resource($chapter, 'video');
        DB::beginTransaction();
        $this->complete($user, $program, $chapter, 'video', $video);
        $this->assertNull($this->awardId($user, $program));
        DB::rollBack();
        foreach (['activity_completions', 'gamification_rewards', 'gamification_days'] as $table) {
            $this->assertSame(0, DB::table($table)->where('user_id', $user->id)->count());
        }
        // A later unrelated root commit must not revive the discarded callback.
        DB::transaction(fn () => app(LearningProgressService::class)->record($user, $chapter, 'video', $video));
        $this->assertNull($this->awardId($user, $program));
    }

    public static function callbackChanges(): array
    {
        return [['inactive_grant'], ['expired_grant'], ['disabled'], ['new_content'], ['inactive_program']];
    }

    #[DataProvider('callbackChanges')]
    public function test_callback_reevaluates_committed_content_settings_and_membership(string $change): void
    {
        [$user, $program, $chapter, $grant] = $this->fixture();
        $video = $this->resource($chapter, 'video');
        DB::beginTransaction();
        $this->complete($user, $program, $chapter, 'video', $video);
        $this->assertNull($this->awardId($user, $program));
        match ($change) {
            'inactive_grant' => DB::table('access_grants')->where('id', $grant)->update(['status' => 'inactive']),
            'expired_grant' => DB::table('access_grants')->where('id', $grant)->update(['starts_at' => now()->subDays(10)->toDateString(), 'ends_at' => now()->subDay()->toDateString()]),
            'disabled' => $this->insert('program_achievement_settings', ['program_id' => $program->id, 'automatic_enabled' => false]),
            'new_content' => $this->resource($chapter, 'module'),
            'inactive_program' => DB::table('programs')->where('id', $program->id)->update(['status' => 'inactive']),
        };
        DB::commit();
        $this->assertSame(1, DB::table('activity_completions')->where('user_id', $user->id)->count());
        $this->assertNull($this->awardId($user, $program));
    }

    public static function practices(): array
    {
        return [['audio'], ['reading']];
    }

    #[DataProvider('practices')]
    public function test_full_incorrect_practice_awards_and_completed_resubmit_reconciles(string $kind): void
    {
        [$user, $program, $chapter] = $this->fixture('jlpt');
        $question = $this->resource($chapter, $kind);
        $service = app(LearningAttemptService::class);
        $attempt = $service->start($user, $program, $chapter, $kind);
        // Keep first submission ineligible; completed resubmit must schedule reconciliation too.
        $setting = $this->insert('program_achievement_settings', ['program_id' => $program->id, 'automatic_enabled' => false]);
        $done = $service->submit($user, $program, $chapter, $attempt, [$question => 'B'], 0);
        $this->assertSame('completed', $done->status);
        $this->assertEquals(0, $done->result_snapshot['percentage']);
        $this->assertNull($this->awardId($user, $program));
        DB::table('program_achievement_settings')->where('id', $setting)->update(['automatic_enabled' => true]);
        $again = $service->submit($user, $program, $chapter, $done, [], 0);
        $this->assertSame($done->id, $again->id);
        $this->assertSame($done->answers, $again->answers);
        $id = $this->awardId($user, $program);
        $this->assertNotNull($id);
        $service->submit($user, $program, $chapter, $done, [], 0);
        $this->assertSame($id, $this->awardId($user, $program));
    }

    #[DataProvider('practices')]
    public function test_last_practice_submission_awards_after_root_commit(string $kind): void
    {
        [$user, $program, $chapter] = $this->fixture('jlpt');
        $question = $this->resource($chapter, $kind);
        $service = app(LearningAttemptService::class);
        $attempt = $service->start($user, $program, $chapter, $kind);
        DB::beginTransaction();
        $done = $service->submit($user, $program, $chapter, $attempt, [$question => 'B'], 0);
        $this->assertSame('completed', $done->status);
        $this->assertNull($this->awardId($user, $program));
        DB::commit();
        $this->assertNotNull($this->awardId($user, $program));
    }

    #[DataProvider('practices')]
    public function test_empty_timeout_and_completed_resubmit_never_award(string $kind): void
    {
        [$user, $program, $chapter] = $this->fixture('jlpt');
        $question = $this->resource($chapter, $kind);
        $service = app(LearningAttemptService::class);
        $attempt = $service->start($user, $program, $chapter, $kind);
        DB::table('learning_attempts')->where('id', $attempt->id)->update(['created_at' => now()->utc()->subMinutes(21)]);
        $done = $service->show($user, $program, $chapter, $attempt);
        $this->assertSame('completed', $done->status);
        $this->assertSame([], $done->answers);
        $this->assertSame(1, $done->result_snapshot['unanswered']);
        $this->assertNull($this->awardId($user, $program));
        $again = $service->submit($user, $program, $chapter, $done, [$question => 'A'], 0);
        $this->assertSame([], $again->answers);
        $this->assertNull($this->awardId($user, $program));
    }

    public function test_unsupported_published_content_remains_unresolved_after_real_completion(): void
    {
        [$user, $program, $chapter] = $this->fixture();
        $video = $this->resource($chapter, 'video');
        $this->resource($chapter, 'audio');
        $this->complete($user, $program, $chapter, 'video', $video);
        $this->assertSame('policy_unresolved', app(ProgramAchievementEligibility::class)->evaluate($user, $program)['reason']);
        $this->assertNull($this->awardId($user, $program));
    }

    public function test_free_preview_completion_never_infers_paid_learning_type(): void
    {
        $user = $this->student();
        $program = Program::where('code', 'n5')->first();
        if ($program === null) {
            $program = Program::forceCreate(['code' => 'n5', 'slug' => 'c4a-'.Str::uuid(), 'name' => 'Synthetic preview program', 'family' => 'jlpt', 'status' => 'active', 'sort_order' => 0]);
            $this->createdRows[] = ['programs', $program->id];
            $this->ownedPrograms[$program->id] = $program->slug;
        } else {
            $this->reusedPrograms[$program->id] = 'n5';
        }
        $chapter = Chapter::where('program_id', $program->id)->where('chapter_number', 1)->first();
        if ($chapter === null) {
            $chapter = $this->chapter($program, 1);
        }
        $this->assertSame('published', $chapter->status, 'Disposable preview chapter must be published.');
        $video = $this->resource($chapter, 'video');
        $this->complete($user, $program, $chapter, 'video', $video);
        $this->assertTrue(DB::table('activity_completions')->where('user_id', $user->id)->where('resource_id', $video)->where('type', 'video')->exists());
        $this->assertNull($this->awardId($user, $program));
    }

    public function test_callback_failure_reports_and_keeps_learning_committed_then_reconcile_is_idempotent(): void
    {
        [$user, $program, $chapter] = $this->fixture();
        $video = $this->resource($chapter, 'video');
        $failure = new \RuntimeException('Synthetic reconciliation failure');
        $issuer = \Mockery::mock(ProgramAchievementService::class);
        $issuer->shouldReceive('issue')->once()->andThrow($failure);
        $this->app->instance(ProgramAchievementService::class, $issuer);
        $handler = \Mockery::mock(ExceptionHandler::class);
        $handler->shouldReceive('report')->once()->with($failure);
        $this->app->instance(ExceptionHandler::class, $handler);
        $this->complete($user, $program, $chapter, 'video', $video);
        $this->assertSame(0, DB::transactionLevel());
        $this->assertSame(1, DB::table('activity_completions')->where('user_id', $user->id)->count());
        $this->assertNull($this->awardId($user, $program));
        $this->app->forgetInstance(ProgramAchievementService::class);
        $this->app->forgetInstance(ProgramAchievementReconciliationService::class);
        $reconciliation = app(ProgramAchievementReconciliationService::class);
        $reconciliation->reconcile($user->id, $program->id);
        $id = $this->awardId($user, $program);
        $this->assertNotNull($id);
        $reconciliation->reconcile($user->id, $program->id);
        $this->assertSame($id, $this->awardId($user, $program));
    }

    public function test_batch_continues_after_failure_and_real_issuer_processes_next_pair(): void
    {
        [$first, $program, $chapter] = $this->fixture();
        [$second, $otherProgram, $otherChapter] = $this->fixture();
        foreach ([[$first, $chapter], [$second, $otherChapter]] as [$user, $ownedChapter]) {
            $video = $this->resource($ownedChapter, 'video');
            DB::transaction(fn () => app(LearningProgressService::class)->record($user, $ownedChapter, 'video', $video));
        }
        $realIssuer = app(ProgramAchievementService::class);
        $failure = new \RuntimeException('Synthetic first batch item failure');
        $issuer = \Mockery::mock(ProgramAchievementService::class);
        $issuer->shouldReceive('issue')->once()->withArgs(fn ($user, $item) => $user->id === $first->id && $item->id === $program->id)->andThrow($failure);
        $issuer->shouldReceive('issue')->once()->withArgs(fn ($user, $item) => $user->id === $second->id && $item->id === $otherProgram->id)
            ->andReturnUsing(fn ($user, $item) => $realIssuer->issue($user, $item));
        $this->app->instance(ProgramAchievementService::class, $issuer);
        $handler = \Mockery::mock(ExceptionHandler::class);
        $handler->shouldReceive('report')->once()->with($failure);
        $this->app->instance(ExceptionHandler::class, $handler);
        $results = app(ProgramAchievementReconciliationService::class)->batch([
            ['user_id' => $first->id, 'program_id' => $program->id],
            ['user_id' => $second->id, 'program_id' => $otherProgram->id],
        ]);
        $this->assertSame(['reconciliation_failed', 'issued'], array_column($results, 'reason'));
        $this->assertNull($this->awardId($first, $program));
        $this->assertNotNull($this->awardId($second, $otherProgram));
    }

    public function test_batch_validates_entire_boundary_before_any_issuance_and_accepts_limit(): void
    {
        [$user, $program, $chapter] = $this->fixture();
        $video = $this->resource($chapter, 'video');
        DB::transaction(fn () => app(LearningProgressService::class)->record($user, $chapter, 'video', $video));
        $pair = ['user_id' => $user->id, 'program_id' => $program->id];
        $service = app(ProgramAchievementReconciliationService::class);
        foreach ([array_fill(0, 101, $pair), [$pair, ['user_id' => 0, 'program_id' => $program->id]], [$pair, ['user_id' => (string) $user->id, 'program_id' => $program->id]], [$pair, null]] as $invalid) {
            try {
                $service->batch($invalid);
                $this->fail('Invalid batch accepted.');
            } catch (\InvalidArgumentException) {
                $this->assertNull($this->awardId($user, $program));
            }
        }
        $this->assertSame([], $service->batch([]));
        $results = $service->batch(array_fill(0, 100, $pair));
        $this->assertCount(100, $results);
        $this->assertSame('issued', $results[0]['reason']);
        $this->assertSame(array_fill(0, 99, 'existing'), array_column(array_slice($results, 1), 'reason'));
        $this->assertNotNull($this->awardId($user, $program));
        $missing = (int) DB::table('users')->max('id') + 100000;
        $this->assertSame('not_found', $service->reconcile($missing, $program->id)['reason']);
    }

    private function fixture(string $family = 'interview'): array
    {
        $user = $this->student();
        $program = Program::forceCreate(['code' => 'c4a-'.Str::uuid(), 'slug' => 'c4a-'.Str::uuid(), 'name' => 'Synthetic completion program', 'family' => $family, 'status' => 'active', 'sort_order' => 0]);
        $this->createdRows[] = ['programs', $program->id];
        $this->ownedPrograms[$program->id] = $program->slug;
        $this->insert('program_offers', ['program_id' => $program->id, 'plan_code' => 'lms', 'duration_months' => 1, 'status' => 'active']);
        $grant = $this->insert('access_grants', ['user_id' => $user->id, 'program_id' => $program->id, 'plan_code' => 'lms', 'status' => 'active', 'starts_at' => now()->toDateString(), 'ends_at' => now()->addDays(10)->toDateString()]);

        return [$user, $program, $this->chapter($program), $grant];
    }

    private function student(): User
    {
        $user = User::forceCreate(['name' => 'Synthetic completion student', 'email' => Str::uuid().'@example.test', 'whatsapp' => '+628'.random_int(1000000000, 9999999999), 'password' => 'synthetic-password-only', 'role' => 'student', 'account_status' => 'active']);
        $this->createdRows[] = ['users', $user->id];
        $this->ownedUsers[$user->id] = $user->email;

        return $user;
    }

    private function chapter(Program $program, ?int $number = null): Chapter
    {
        $id = $this->insert('chapters', ['program_id' => $program->id, 'chapter_number' => $number ?? (int) DB::table('chapters')->where('program_id', $program->id)->max('chapter_number') + 1, 'title' => 'Synthetic completion chapter', 'status' => 'published']);

        return Chapter::findOrFail($id);
    }

    private function resource(Chapter $chapter, string $type): int
    {
        $base = ['chapter_id' => $chapter->id, 'status' => 'published'];
        $question = ['question' => 'Synthetic practice question', 'options' => json_encode(['A' => 'One', 'B' => 'Two', 'C' => 'Three', 'D' => 'Four']), 'correct_option' => 'A', 'explanation' => 'Synthetic explanation', 'status' => 'published'];

        return match ($type) {
            'video' => $this->insert('video_lessons', $base + ['title' => 'Synthetic video', 'video_url' => 'https://example.test/video']),
            'module' => $this->insert('learning_modules', $base + ['title' => 'Synthetic module', 'file_url' => 'https://example.test/module.pdf', 'module_type' => 'general']),
            'flashcard' => $this->insert('flashcards', $base + ['japanese' => '猫', 'reading' => 'ねこ', 'meaning' => 'Cat']),
            'audio' => $this->insert('audio_questions', $base + $question + ['audio_url' => 'https://example.test/audio.mp3']),
            'reading' => $this->insert('reading_questions', $question + ['reading_passage_id' => $this->insert('reading_passages', $base + ['title' => 'Synthetic passage', 'body' => 'Synthetic text'])]),
        };
    }

    private function complete(User $user, Program $program, Chapter $chapter, string $type, int $id): void
    {
        app(LearningProgressService::class)->complete($user, $program, $chapter, $type, $type === 'flashcard' ? null : $id);
    }

    private function awardId(User $user, Program $program): ?int
    {
        $ids = DB::table('program_achievements')->where('user_id', $user->id)->where('program_id', $program->id)->pluck('id');
        $this->assertLessThanOrEqual(1, $ids->count());

        return $ids->first();
    }

    private function insert(string $table, array $attributes): int
    {
        $id = DB::table($table)->insertGetId($attributes + ['created_at' => now(), 'updated_at' => now()]);
        $this->createdRows[] = [$table, $id];

        return $id;
    }
}
