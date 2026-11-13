<?php

namespace Tests\Feature;

use App\Models\Program;
use App\Models\User;
use App\Services\ProgramAchievementEligibility;
use App\Services\ProgramAchievementLearningType;
use App\Services\ProgramAchievementService;
use App\Services\ProgramAchievementSettings;
use App\Support\DatabaseSafety;
use Illuminate\Contracts\Debug\ExceptionHandler;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class ProgramAchievementIntegrationTest extends TestCase
{
    private array $createdRows = [];

    private array $ownedUsers = [];

    private array $ownedPrograms = [];

    private array $reusedPrograms = [];

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
                    if (! str_starts_with($slug, 'r20-') || ! Str::isUuid(substr($slug, 4))
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
                $achievements = DB::table('program_achievements')->whereIn('user_id', array_keys($this->ownedUsers));
                if ((clone $achievements)->whereNotIn('program_id', array_merge(array_keys($this->ownedPrograms), array_keys($this->reusedPrograms)))->exists()) {
                    throw new \RuntimeException('Achievement cleanup program ownership rejected.');
                }
                $achievements->delete();
                foreach (array_reverse($this->createdRows) as [$table, $id]) {
                    DB::table($table)->where('id', $id)->delete();
                }
                foreach ($this->createdRows as [$table, $id]) {
                    $this->assertFalse(DB::table($table)->where('id', $id)->exists(), 'Synthetic fixture remains: '.$table.'#'.$id);
                }
                $this->assertSame(0, DB::table('program_achievements')->whereIn('user_id', array_keys($this->ownedUsers))->count());
            });
        } finally {
            parent::tearDown();
        }
    }

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
            throw new \RuntimeException('Program achievement integration target rejected.');
        }
        DatabaseSafety::assertTarget(true);
    }

    public function test_settings_default_independence_unique_key_and_foreign_key(): void
    {
        $first = $this->program();
        $second = $this->program();
        $settings = app(ProgramAchievementSettings::class);
        $this->assertTrue($settings->resolve($first)['automatic_enabled']);
        $this->assertSame(1, $settings->resolve($first)['presentation_version']);
        $this->insert('program_achievement_settings', ['program_id' => $first->id, 'automatic_enabled' => false]);
        $this->assertFalse($settings->resolve($first)['automatic_enabled']);
        $this->assertTrue($settings->resolve($second)['automatic_enabled']);
        $this->constraint('23505', fn () => $this->insert('program_achievement_settings', ['program_id' => $first->id]));
        $missing = (int) DB::table('programs')->max('id') + 100000;
        $this->constraint('23503', fn () => $this->insert('program_achievement_settings', ['program_id' => $missing]));
        $user = $this->student();
        $this->assertSame('disabled', app(ProgramAchievementService::class)->issue($user, $first)['reason']);
        $this->assertSame(0, DB::table('program_achievements')->where('user_id', $user->id)->count());
    }

    public function test_empty_program_and_published_empty_chapter_never_qualify(): void
    {
        $user = $this->student();
        $program = $this->program();
        $this->assertReason('empty_program', $user, $program);
        $chapter = $this->chapter($program, 'draft');
        $this->assertReason('empty_program', $user, $program);
        DB::table('chapters')->where('id', $chapter)->update(['status' => 'published']);
        $this->assertReason('empty_chapter', $user, $program);
        $program->forceFill(['status' => 'inactive'])->save();
        $this->assertReason('inactive_program', $user, $program->fresh());
    }

    public function test_unsupported_published_activity_keeps_policy_unresolved(): void
    {
        $user = $this->student();
        $program = $this->program();
        $chapter = $this->chapter($program);
        $this->insert('audio_questions', [
            'chapter_id' => $chapter, 'audio_url' => 'https://example.test/audio.mp3',
            'question' => 'Unsupported interview audio',
            'options' => json_encode(['A' => 'one', 'B' => 'two', 'C' => 'three', 'D' => 'four']),
            'correct_option' => 'A', 'status' => 'published',
        ]);
        $this->assertReason('policy_unresolved', $user, $program);
    }

    public function test_completion_requires_exact_user_chapter_type_resource_and_current_published_content(): void
    {
        $user = $this->student();
        $other = $this->student();
        $program = $this->program();
        $chapter = $this->chapter($program);
        $otherChapter = $this->chapter($this->program());
        $video = $this->video($chapter);
        $completion = $this->completion($other, $chapter, 'video', $video);
        $this->assertReason('incomplete', $user, $program);
        DB::table('activity_completions')->where('id', $completion)->update(['user_id' => $user->id, 'chapter_id' => $otherChapter]);
        $this->assertReason('incomplete', $user, $program);
        DB::table('activity_completions')->where('id', $completion)->update(['chapter_id' => $chapter, 'type' => 'module']);
        $this->assertReason('incomplete', $user, $program);
        $draft = $this->video($otherChapter, 'draft');
        DB::table('activity_completions')->where('id', $completion)->update(['type' => 'video', 'resource_id' => $draft]);
        $this->assertReason('incomplete', $user, $program);
        DB::table('activity_completions')->where('id', $completion)->update(['resource_id' => $video]);
        $this->assertReason('eligible', $user, $program);
        DB::table('video_lessons')->where('id', $video)->delete();
        $replacement = $this->video($chapter);
        $this->assertReason('incomplete', $user, $program);
        $this->completion($user, $chapter, 'video', $replacement);
        $this->assertReason('eligible', $user, $program);
        DB::table('video_lessons')->where('chapter_id', $chapter)->update(['status' => 'draft']);
        $this->assertReason('empty_chapter', $user, $program);
    }

    public function test_completed_practice_requires_full_answers_not_correct_answers(): void
    {
        $user = $this->student();
        $program = $this->program(null, 'jlpt');
        $chapter = $this->chapter($program);
        $this->completion($user, $chapter, 'video', $this->video($chapter));
        $module = $this->insert('learning_modules', [
            'chapter_id' => $chapter, 'title' => 'Synthetic module', 'file_url' => 'https://example.test/module.pdf',
            'module_type' => 'general', 'status' => 'published',
        ]);
        $this->completion($user, $chapter, 'module', $module);
        $flashcard = $this->insert('flashcards', [
            'chapter_id' => $chapter, 'japanese' => '猫', 'reading' => 'ねこ', 'meaning' => 'cat', 'status' => 'published',
        ]);
        $options = ['A' => 'one', 'B' => 'two', 'C' => 'three', 'D' => 'four'];
        $audio = $this->insert('audio_questions', [
            'chapter_id' => $chapter, 'audio_url' => 'https://example.test/audio.mp3',
            'question' => 'Synthetic audio', 'options' => json_encode($options), 'correct_option' => 'A', 'status' => 'published',
        ]);
        $passage = $this->insert('reading_passages', ['chapter_id' => $chapter, 'title' => 'Synthetic passage', 'body' => 'Text', 'status' => 'published']);
        $reading = $this->insert('reading_questions', [
            'reading_passage_id' => $passage, 'question' => 'Synthetic reading',
            'options' => json_encode($options), 'correct_option' => 'A', 'status' => 'published',
        ]);
        foreach (['audio' => $audio, 'reading' => $reading] as $kind => $id) {
            $this->completion($user, $chapter, $kind, $id);
        }
        $this->assertReason('incomplete', $user, $program);
        $attempts = [];
        foreach (['audio' => $audio, 'reading' => $reading] as $kind => $id) {
            $attempts[] = $this->insert('learning_attempts', [
                'user_id' => $user->id, 'chapter_id' => $chapter, 'kind' => $kind, 'status' => 'completed',
                'content_snapshot' => json_encode([['id' => $id, 'options' => $options]]),
                'grading_snapshot' => json_encode([$id => ['correct_option' => 'A']]),
                'answers' => '{}', 'result_snapshot' => json_encode(['score' => 0]), 'submitted_at' => now(),
            ]);
        }
        $this->assertReason('incomplete', $user, $program);
        foreach (array_combine($attempts, [$audio, $reading]) as $attempt => $resource) {
            DB::table('learning_attempts')->where('id', $attempt)->update(['answers' => json_encode([$resource => 'B'])]);
        }
        $this->assertReason('incomplete', $user, $program);
        $this->completion($user, $chapter, 'flashcard', $flashcard);
        $this->assertReason('eligible', $user, $program);
        $evidence = app(ProgramAchievementEligibility::class)->evaluate($user, $program)['evidence'];
        $this->assertCount(5, $evidence['chapters'][0]['tasks']);
        $this->assertEqualsCanonicalizing(['video', 'module', 'flashcard', 'audio', 'reading'], array_column($evidence['chapters'][0]['tasks'], 'type'));
        foreach ($evidence['chapters'][0]['tasks'] as $task) {
            if (in_array($task['type'], ['audio', 'reading'], true)) {
                $this->assertArrayHasKey('attempt_id', $task);
            }
            $this->assertArrayNotHasKey('answers', $task);
            $this->assertArrayNotHasKey('grading_snapshot', $task);
        }
        DB::table('learning_attempts')->where('id', $attempts[0])->update(['status' => 'in_progress', 'submitted_at' => null, 'result_snapshot' => null]);
        $this->assertReason('incomplete', $user, $program);
        DB::table('learning_attempts')->where('id', $attempts[0])->update(['status' => 'completed', 'submitted_at' => now(), 'result_snapshot' => '{}']);
        $this->assertReason('eligible', $user, $program);
        $this->insert('reading_passages', ['chapter_id' => $chapter, 'title' => 'Empty published passage', 'body' => 'Text', 'status' => 'published']);
        $this->assertReason('invalid_content', $user, $program);
    }

    public function test_issuance_is_idempotent_snapshots_survive_changes_and_collection_is_owner_only(): void
    {
        $user = $this->student();
        $other = $this->student();
        $program = $this->program();
        $chapter = $this->chapter($program);
        $this->completion($user, $chapter, 'video', $this->video($chapter));
        $grant = $this->grant($user, $program);
        $this->insert('program_achievement_settings', [
            'program_id' => $program->id, 'automatic_enabled' => true,
            'title' => 'Original title', 'description' => 'Original description',
            'background_image' => null, 'presentation_version' => 1,
        ]);
        $service = app(ProgramAchievementService::class);
        $issued = $service->issue($user, $program);
        $this->assertSame('issued', $issued['reason']);
        $achievement = $issued['achievement'];
        $this->assertSame($user->name, $achievement->student_name_snapshot);
        $this->assertSame($program->name, $achievement->program_name_snapshot);
        $this->assertSame($program->code, $achievement->program_code_snapshot);
        $this->assertSame('lms', $achievement->learning_type_snapshot);
        $this->assertSame($grant, $achievement->completion_evidence_snapshot['source_grant_id']);
        $checkEvidence = function (array $evidence) use (&$checkEvidence): void {
            foreach ($evidence as $key => $value) {
                $this->assertNotContains($key, ['answers', 'grading_snapshot', 'password', 'token', 'whatsapp', 'email', 'credentials']);
                if (is_array($value)) {
                    $checkEvidence($value);
                }
            }
        };
        $checkEvidence($achievement->completion_evidence_snapshot);
        $this->assertSame('Original title', $achievement->presentation_snapshot['title']);
        $snapshot = $achievement->fresh()->getRawOriginal();
        $user->update(['name' => 'Changed student']);
        DB::table('programs')->where('id', $program->id)->update(['name' => 'Changed program']);
        DB::table('access_grants')->where('id', $grant)->update(['starts_at' => now()->subDays(10)->toDateString(), 'ends_at' => now()->subDay()->toDateString()]);
        DB::table('program_achievement_settings')->where('program_id', $program->id)->update([
            'automatic_enabled' => false, 'title' => 'Changed title', 'description' => 'Changed description',
            'background_image' => 'changed.png', 'presentation_version' => 2,
        ]);
        $again = $service->issue($user->fresh(), $program->fresh());
        $this->assertSame('existing', $again['reason']);
        $this->assertSame($achievement->id, $again['achievement']->id);
        $this->assertSame($snapshot, $again['achievement']->getRawOriginal());
        $this->assertSame([$achievement->id], $service->collection($user)->modelKeys());
        $this->assertCount(0, $service->collection($other));
        $this->assertSame(1, DB::table('program_achievements')->where('user_id', $user->id)->where('program_id', $program->id)->count());
        unset($snapshot['id']);
        $this->constraint('23505', fn () => DB::table('program_achievements')->insert($snapshot));
        $invalid = array_replace($snapshot, ['user_id' => $other->id, 'learning_type_snapshot' => 'invalid']);
        $this->constraint('23514', fn () => DB::table('program_achievements')->insert($invalid));
        foreach (['presentation_snapshot', 'completion_evidence_snapshot'] as $column) {
            $invalid = array_replace($snapshot, ['user_id' => $other->id, $column => '[]']);
            $this->constraint('23514', fn () => DB::table('program_achievements')->insert($invalid));
        }
        $restrictedUser = $this->student();
        $restrictedProgram = $this->program();
        $this->insert('program_achievements', array_replace($snapshot, [
            'user_id' => $restrictedUser->id, 'program_id' => $restrictedProgram->id,
        ]));
        $this->constraint('23503', fn () => DB::table('users')->where('id', $restrictedUser->id)->delete());
        $this->constraint('23503', fn () => DB::table('programs')->where('id', $restrictedProgram->id)->delete());
    }

    public function test_background_media_reference_blocks_issuance_without_award(): void
    {
        $user = $this->student();
        $program = $this->program();
        $chapter = $this->chapter($program);
        $this->completion($user, $chapter, 'video', $this->video($chapter));
        $this->grant($user, $program);
        $this->insert('program_achievement_settings', [
            'program_id' => $program->id, 'automatic_enabled' => true,
            'background_image' => 'https://example.test/r20.png',
        ]);
        $result = app(ProgramAchievementService::class)->issue($user, $program);
        $this->assertSame('media_reference_unresolved', $result['reason']);
        $this->assertNull($result['achievement']);
        $this->assertSame(0, DB::table('program_achievements')->where('user_id', $user->id)->count());
    }

    public function test_membership_uses_valid_independent_grants_cumulative_levels_and_never_infers_free(): void
    {
        $user = $this->student();
        $other = $this->student();
        $n5 = $this->program('n5', 'jlpt');
        $n4 = $this->program('n4', 'jlpt');
        $unrelated = $this->program();
        $resolver = app(ProgramAchievementLearningType::class);
        $this->assertNull($resolver->resolve($user, $n5)['learning_type']);
        $this->grant($other, $n4, 'sensei');
        $this->grant($user, $n4, 'sensei', ['starts_at' => now()->subDays(10)->toDateString(), 'ends_at' => now()->subDay()->toDateString()]);
        $this->grant($user, $n4, 'sensei', ['starts_at' => now()->addDay()->toDateString(), 'ends_at' => now()->addDays(10)->toDateString()]);
        $this->grant($user, $n4, 'sensei', ['status' => 'inactive']);
        $this->grant($user, $unrelated);
        $this->assertNull($resolver->resolve($user, $n5)['learning_type']);
        $lms = $this->grant($user, $n4);
        $this->assertSame(['learning_type' => 'lms', 'grant_id' => $lms, 'reason' => 'resolved'], $resolver->resolve($user, $n5));
        $this->assertSame('lms', $resolver->resolve($user, $n4)['learning_type']);
        $sensei = $this->grant($user, $n4, 'sensei');
        $this->assertSame(['learning_type' => 'sensei', 'grant_id' => $sensei, 'reason' => 'resolved'], $resolver->resolve($user, $n5));
        DB::table('access_grants')->where('id', $sensei)->update(['status' => 'inactive']);
        $this->assertSame($lms, $resolver->resolve($user, $n5)['grant_id']);
        $free = $this->student();
        $chapter = $this->chapter($unrelated);
        $this->completion($free, $chapter, 'video', $this->video($chapter));
        $this->assertReason('eligible', $free, $unrelated);
        $result = app(ProgramAchievementService::class)->issue($free, $unrelated);
        $this->assertSame('learning_type_unresolved', $result['reason']);
        $this->assertNull($result['achievement']);
        $this->assertCount(0, app(ProgramAchievementService::class)->collection($free));
    }

    public function test_nested_issuance_waits_for_outer_commit_and_uses_committed_completion(): void
    {
        $user = $this->student();
        $program = $this->program();
        $chapter = $this->chapter($program);
        $video = $this->video($chapter);
        $this->grant($user, $program);
        $this->assertSame(0, DB::transactionLevel());

        DB::beginTransaction();
        $completion = $this->completion($user, $chapter, 'video', $video);
        $result = app(ProgramAchievementService::class)->issue($user, $program);
        $this->assertSame('deferred_until_commit', $result['reason']);
        $this->assertNull($result['achievement']);
        $this->assertSame(1, DB::transactionLevel());
        $this->assertSame(0, DB::table('program_achievements')->where('user_id', $user->id)->count());
        DB::commit();

        $this->assertSame(0, DB::transactionLevel());
        $this->assertTrue(DB::table('activity_completions')->where('id', $completion)->exists());
        $achievements = app(ProgramAchievementService::class)->collection($user);
        $this->assertCount(1, $achievements);
        $this->assertSame($program->id, $achievements->sole()->program_id);
        $this->assertSame('existing', app(ProgramAchievementService::class)->issue($user, $program)['reason']);
        $this->assertSame(0, DB::transactionLevel());
    }

    public function test_outer_rollback_discards_deferred_issuance_callback(): void
    {
        $user = $this->student();
        $program = $this->program();
        $chapter = $this->chapter($program);
        $video = $this->video($chapter);
        $this->grant($user, $program);
        $this->assertSame(0, DB::transactionLevel());

        DB::beginTransaction();
        $completion = $this->completion($user, $chapter, 'video', $video);
        $result = app(ProgramAchievementService::class)->issue($user, $program);
        $this->assertSame('deferred_until_commit', $result['reason']);
        $this->assertNull($result['achievement']);
        $this->assertSame(1, DB::transactionLevel());
        $this->assertSame(0, DB::table('program_achievements')->where('user_id', $user->id)->count());
        DB::rollBack();

        $this->assertSame(0, DB::transactionLevel());
        $this->assertFalse(DB::table('activity_completions')->where('id', $completion)->exists());
        // Make eligible, then commit: a leaked rollback callback would now create an award.
        DB::transaction(fn () => $this->completion($user, $chapter, 'video', $video));
        $this->assertSame(0, DB::transactionLevel());
        $this->assertSame(0, DB::table('program_achievements')->where('user_id', $user->id)->count());
    }

    public function test_callback_failure_reports_without_rolling_back_learning_completion(): void
    {
        $user = $this->student();
        $program = $this->program();
        $chapter = $this->chapter($program);
        $video = $this->video($chapter);
        $this->grant($user, $program);
        $failure = new \RuntimeException('Synthetic eligibility failure');
        $eligibility = \Mockery::mock(ProgramAchievementEligibility::class);
        $eligibility->shouldReceive('evaluate')->once()->andThrow($failure);
        $this->app->instance(ProgramAchievementEligibility::class, $eligibility);
        $handler = \Mockery::mock(ExceptionHandler::class);
        $handler->shouldReceive('report')->once()->with($failure);
        $this->app->instance(ExceptionHandler::class, $handler);

        DB::beginTransaction();
        $completion = $this->completion($user, $chapter, 'video', $video);
        $result = app(ProgramAchievementService::class)->issue($user, $program);
        $this->assertSame('deferred_until_commit', $result['reason']);
        DB::commit();

        $this->assertSame(0, DB::transactionLevel());
        $this->assertTrue(DB::table('activity_completions')->where('id', $completion)->exists());
        $this->assertSame(0, DB::table('program_achievements')->where('user_id', $user->id)->count());
    }

    private function student(): User
    {
        $user = User::forceCreate([
            'name' => 'Synthetic student', 'email' => Str::uuid().'@example.test',
            'whatsapp' => '+628'.random_int(1000000000, 9999999999),
            'password' => 'synthetic-password-only', 'role' => 'student', 'account_status' => 'active',
        ]);
        $this->createdRows[] = ['users', $user->id];
        $this->ownedUsers[$user->id] = $user->email;

        return $user;
    }

    private function program(?string $code = null, string $family = 'interview'): Program
    {
        if ($code !== null && ($existing = Program::where('code', $code)->first())) {
            if (! in_array($code, ['n5', 'n4'], true)) {
                throw new \RuntimeException('Reused program fixture rejected.');
            }
            $this->reusedPrograms[$existing->id] = $code;

            return $existing;
        }
        $code ??= 'r20-'.Str::uuid();
        $program = Program::forceCreate(['code' => $code, 'slug' => 'r20-'.Str::uuid(), 'name' => 'Synthetic program', 'family' => $family, 'status' => 'active', 'sort_order' => 0]);
        $this->createdRows[] = ['programs', $program->id];
        $this->ownedPrograms[$program->id] = $program->slug;

        return $program;
    }

    private function chapter(Program $program, string $status = 'published'): int
    {
        return $this->insert('chapters', [
            'program_id' => $program->id, 'chapter_number' => (int) DB::table('chapters')->where('program_id', $program->id)->max('chapter_number') + 1,
            'title' => 'Synthetic chapter', 'status' => $status,
        ]);
    }

    private function video(int $chapter, string $status = 'published'): int
    {
        return $this->insert('video_lessons', ['chapter_id' => $chapter, 'title' => 'Synthetic video', 'video_url' => 'https://example.test/video', 'status' => $status]);
    }

    private function completion(User $user, int $chapter, string $type, int $resource): int
    {
        $id = DB::table('activity_completions')->insertGetId(['user_id' => $user->id, 'chapter_id' => $chapter, 'type' => $type, 'resource_id' => $resource, 'completed_at' => now()]);
        $this->createdRows[] = ['activity_completions', $id];

        return $id;
    }

    private function grant(User $user, Program $program, string $plan = 'lms', array $overrides = []): int
    {
        if (! DB::table('program_offers')->where('program_id', $program->id)->where('plan_code', $plan)->exists()) {
            $this->insert('program_offers', ['program_id' => $program->id, 'plan_code' => $plan, 'duration_months' => 1, 'status' => 'active']);
        }

        return $this->insert('access_grants', array_replace([
            'user_id' => $user->id, 'program_id' => $program->id, 'plan_code' => $plan,
            'starts_at' => now()->toDateString(), 'ends_at' => now()->addDays(10)->toDateString(), 'status' => 'active',
        ], $overrides));
    }

    private function insert(string $table, array $attributes): int
    {
        $id = DB::table($table)->insertGetId($attributes + ['created_at' => now(), 'updated_at' => now()]);
        $this->createdRows[] = [$table, $id];

        return $id;
    }

    private function assertReason(string $reason, User $user, Program $program): void
    {
        $result = app(ProgramAchievementEligibility::class)->evaluate($user, $program);
        $this->assertSame($reason, $result['reason']);
        $this->assertSame($reason === 'eligible', $result['eligible']);
    }

    private function constraint(string $sqlState, callable $write): void
    {
        try {
            DB::transaction($write);
            $this->fail('Expected PostgreSQL constraint violation '.$sqlState);
        } catch (QueryException $exception) {
            $this->assertSame($sqlState, $exception->errorInfo[0]);
        }
        $this->assertSame(1, (int) DB::selectOne('SELECT 1 AS healthy')->healthy);
    }
}
