<?php

namespace Tests\Feature;

use App\Models\AccessGrant;
use App\Models\ActivityCompletion;
use App\Models\AudioQuestion;
use App\Models\Chapter;
use App\Models\Flashcard;
use App\Models\LearningAttempt;
use App\Models\Program;
use App\Models\TryOut;
use App\Models\TryOutAttempt;
use App\Models\User;
use App\Models\VideoLesson;
use App\Services\GamificationService;
use App\Services\LearningAttemptService;
use App\Services\LearningProgressService;
use App\Services\TryOutAttemptService;
use Carbon\CarbonImmutable;
use Database\Seeders\ProgramOfferSeeder;
use Database\Seeders\ProgramSeeder;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class GamificationTest extends TestCase
{
    use DatabaseTransactions;

    private User $student;

    private Chapter $chapter;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([ProgramSeeder::class, ProgramOfferSeeder::class]);
        CarbonImmutable::setTestNow('2026-10-08T17:10:00Z');
        $this->student = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $this->student->forceFill(['created_at' => CarbonImmutable::parse('2026-10-05 00:00:00', 'Asia/Jakarta')])->save();
        $this->chapter = Chapter::create(['program_id' => Program::where('code', 'n5')->firstOrFail()->id, 'chapter_number' => 1, 'title' => 'Fixture', 'status' => 'published']);
        $this->actingAs($this->student);
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    private function reward(string $key, int $xp): void
    {
        DB::transaction(fn () => app(GamificationService::class)->award($this->student, $key, $xp));
    }

    public function test_daily_cap_dedup_bonus_and_week_retention(): void
    {
        $this->reward('module:1', 10);
        $this->reward('module:1', 10);
        $this->reward('exercise:audio:1:2026-10-09', 20);
        $this->reward('chapter:1', 30);
        $this->reward('tryout:1:2026-10-09', 20);
        $this->assertSame(50, (int) DB::table('gamification_days')->sum('xp'));
        $this->assertSame(4, DB::table('gamification_rewards')->count());
        $this->assertDatabaseHas('gamification_rewards', ['reward_key' => 'chapter:1', 'xp' => 20]);
        $this->assertDatabaseHas('gamification_rewards', ['reward_key' => 'tryout:1:2026-10-09', 'xp' => 0]);
        $this->getJson('/api/student/gamification')->assertOk()->assertJsonPath('data.weekly_xp', 50)->assertJsonPath('data.streak_days', 0);
        CarbonImmutable::setTestNow('2026-10-11T17:00:00Z');
        $this->getJson('/api/student/gamification')->assertJsonPath('data.weekly_xp', 0);
        $this->reward('module:1', 10);
        $this->reward('chapter:1', 30);
        $this->assertSame(50, (int) DB::table('gamification_rewards')->sum('xp'));
        $this->reward('exercise:audio:1:2026-10-12', 20);
        $this->getJson('/api/student/gamification')->assertJsonPath('data.weekly_xp', 20);
        $this->getJson('/api/student/leaderboard')->assertJsonPath('data.week_start', '2026-10-12T00:00:00+07:00')->assertJsonPath('data.week_end', '2026-10-19T00:00:00+07:00');
    }

    public function test_historical_attempt_days_jakarta_streak_challenge_and_shared_endpoints(): void
    {
        for ($i = 0; $i < 5; $i++) {
            LearningAttempt::create(['user_id' => $this->student->id, 'chapter_id' => $this->chapter->id, 'kind' => 'mini', 'status' => 'completed', 'content_snapshot' => [['id' => 1]], 'grading_snapshot' => [1 => ['correct_option' => 'A']], 'result_snapshot' => ['correct' => 1, 'total' => 1], 'answers' => [1 => 'A'], 'revision' => 0, 'submitted_at' => CarbonImmutable::parse('2026-10-04T17:05:00Z')->addDays($i)]);
        }
        LearningAttempt::create(['user_id' => $this->student->id, 'chapter_id' => $this->chapter->id, 'kind' => 'mini', 'status' => 'completed', 'content_snapshot' => [['id' => 1]], 'grading_snapshot' => [1 => ['correct_option' => 'A']], 'result_snapshot' => ['correct' => 1, 'total' => 1], 'answers' => [], 'revision' => 0, 'submitted_at' => '2026-10-09T17:05:00Z']);
        $this->getJson('/api/student/gamification')->assertJsonPath('data.streak_days', 5)->assertJsonPath('data.weekly_xp', 0)->assertJsonPath('data.challenge.active_days', 5)->assertJsonPath('data.challenge.starts_on', '2026-10-05')->assertJsonPath('data.challenge.ends_on', '2026-10-11')->assertJsonPath('data.challenge.badge', 'Pemula Konsisten');
        $this->getJson('/api/student/progress')->assertOk()->assertJsonPath('data.streak_days', 5);
        $this->getJson('/api/student/flashcards')->assertOk()->assertJsonPath('data.metrics.streak_days', 5);
        CarbonImmutable::setTestNow('2026-10-09T17:10:00Z');
        $this->getJson('/api/student/gamification')->assertJsonPath('data.streak_days', 5);
        CarbonImmutable::setTestNow('2026-10-10T17:10:00Z');
        $this->getJson('/api/student/gamification')->assertJsonPath('data.streak_days', 0);
        CarbonImmutable::setTestNow('2026-11-01T17:10:00Z');
        $this->getJson('/api/student/gamification')->assertJsonPath('data.challenge.status', 'achieved');
    }

    public function test_completion_hooks_deck_not_per_card_canonical_bonus_and_duplicates(): void
    {
        $progress = app(LearningProgressService::class);
        $video = VideoLesson::create(['chapter_id' => $this->chapter->id, 'title' => 'Video', 'video_url' => 'fixture.mp4', 'status' => 'published']);
        for ($i = 0; $i < 3; $i++) {
            Flashcard::create(['chapter_id' => $this->chapter->id, 'japanese' => '猫', 'reading' => 'ねこ', 'meaning' => 'Cat', 'status' => 'published']);
        }
        $progress->complete($this->student, $this->chapter->program, $this->chapter, 'flashcard', null);
        $this->assertSame(10, (int) DB::table('gamification_rewards')->sum('xp'));
        $this->assertDatabaseMissing('gamification_rewards', ['reward_key' => 'chapter:'.$this->chapter->id]);
        $progress->complete($this->student, $this->chapter->program, $this->chapter, 'video', $video->id);
        $this->assertSame(50, (int) DB::table('gamification_rewards')->sum('xp'));
        CarbonImmutable::setTestNow('2026-10-09T17:10:00Z');
        $progress->complete($this->student, $this->chapter->program, $this->chapter, 'flashcard', null);
        $progress->complete($this->student, $this->chapter->program, $this->chapter, 'video', $video->id);
        $this->assertSame(3, DB::table('gamification_rewards')->count());
        $this->assertSame(1, app(GamificationService::class)->streak($this->student));
    }

    public function test_mini_submission_empty_exclusion_daily_dedup_fresh_activity_at_cap(): void
    {
        $service = app(LearningAttemptService::class);
        $make = fn () => LearningAttempt::create(['user_id' => $this->student->id, 'chapter_id' => $this->chapter->id, 'kind' => 'mini', 'status' => 'in_progress', 'content_snapshot' => [['id' => 1, 'session' => 1, 'part' => 1, 'duration_minutes' => 5]], 'grading_snapshot' => [1 => ['correct_option' => 'A']], 'answers' => [], 'revision' => 0]);
        $service->submit($this->student, $this->chapter->program, $this->chapter, $make(), [], 0);
        $this->assertSame(0, app(GamificationService::class)->streak($this->student));
        $attempt = $make();
        $service->submit($this->student, $this->chapter->program, $this->chapter, $attempt, [1 => 'A'], 0);
        $service->submit($this->student, $this->chapter->program, $this->chapter, $attempt, [1 => 'A'], 0);
        $service->submit($this->student, $this->chapter->program, $this->chapter, $make(), [1 => 'A'], 0);
        $this->assertSame(20, (int) DB::table('gamification_rewards')->sum('xp'));
        CarbonImmutable::setTestNow('2026-10-09T17:10:00Z');
        $this->reward('chapter:99', 30);
        $this->reward('exercise:audio:99:2026-10-10', 20);
        $service->submit($this->student, $this->chapter->program, $this->chapter, $make(), [1 => 'A'], 0);
        $this->assertSame(2, app(GamificationService::class)->streak($this->student));
        $this->assertDatabaseHas('gamification_rewards', ['reward_key' => 'exercise:mini:'.$this->chapter->id.':2026-10-10', 'xp' => 0]);
    }

    public function test_leaderboard_cohorts_precedence_privacy_top_twenty_and_self(): void
    {
        $others = [];
        for ($i = 0; $i < 22; $i++) {
            $other = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
            $others[] = $other;
            DB::transaction(fn () => app(GamificationService::class)->award($other, 'module:1', 10));
        }
        $inactive = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        DB::transaction(fn () => app(GamificationService::class)->award($inactive, 'chapter:1', 30));
        $inactive->forceFill(['account_status' => 'inactive'])->save();
        $this->student->forceFill(['name' => 'private@example.test', 'avatar' => 'javascript:alert(1)'])->save();
        $grant = ['program_id' => $this->chapter->program_id, 'starts_at' => '2026-10-08', 'ends_at' => '2026-10-09', 'status' => 'active'];
        AccessGrant::create($grant + ['user_id' => $this->student->id, 'plan_code' => 'lms']);
        AccessGrant::create($grant + ['user_id' => $this->student->id, 'plan_code' => 'sensei']);
        AccessGrant::create($grant + ['user_id' => $others[0]->id, 'plan_code' => 'lms']);
        AccessGrant::create(array_replace($grant, ['user_id' => $others[1]->id, 'plan_code' => 'sensei', 'ends_at' => '2026-10-08']));
        $response = $this->getJson('/api/student/leaderboard?scope=all')->assertOk()->assertJsonCount(21, 'data.entries')->assertJsonPath('data.self.rank', 23)->assertJsonPath('data.self.category', 'sensei')->assertJsonPath('data.self.name', 'Student '.$this->student->id)->assertJsonPath('data.self.avatar_url', null);
        $this->assertSame($others[0]->id, $response->json('data.entries.0.user_id'));
        $this->assertStringNotContainsString('email', $response->getContent());
        $this->assertStringNotContainsString('whatsapp', $response->getContent());
        $this->getJson('/api/student/leaderboard?scope=lms')->assertJsonCount(1, 'data.entries')->assertJsonPath('data.self', null);
        $this->getJson('/api/student/leaderboard?scope=sensei')->assertJsonCount(1, 'data.entries')->assertJsonPath('data.self.rank', 1);
        $this->getJson('/api/student/leaderboard?scope=bad')->assertUnprocessable();
        $this->student->forceFill(['created_at' => '2026-09-01T17:00:00Z'])->save();
        $this->getJson('/api/student/gamification')->assertJsonPath('data.challenge.status', 'expired');
    }

    public function test_tryout_submission_reward_and_empty_attempt_exclusion(): void
    {
        $parent = TryOut::create(['program_id' => $this->chapter->program_id, 'title' => 'Fixture', 'status' => 'published']);
        $make = fn ($answers) => TryOutAttempt::create(['user_id' => $this->student->id, 'try_out_id' => $parent->id, 'status' => 'in_progress', 'content_snapshot' => [['id' => 1, 'session' => 'vocabulary_kanji']], 'grading_snapshot' => ['questions' => [1 => ['correct_option' => 'A', 'point_value' => 45]], 'total_passing_score' => null], 'answers' => $answers, 'completed_sessions' => [], 'current_session' => 0, 'revision' => 0, 'started_at' => now()]);
        $service = app(TryOutAttemptService::class);
        $service->submit($this->student, $parent, $make([]), 0);
        $this->assertSame(0, app(GamificationService::class)->streak($this->student));
        $attempt = $make([1 => 'A']);
        $service->submit($this->student, $parent, $attempt, 0);
        $service->submit($this->student, $parent, $attempt, 0);
        $service->submit($this->student, $parent, $make([1 => 'A']), 0);
        $this->assertSame(20, (int) DB::table('gamification_rewards')->sum('xp'));
        $this->assertSame(1, app(GamificationService::class)->streak($this->student));
    }

    public function test_moved_or_unpublished_audio_attempts_do_not_award_xp(): void
    {
        $otherChapter = Chapter::create(['program_id' => $this->chapter->program_id, 'chapter_number' => 2, 'title' => 'Other', 'status' => 'published']);
        $service = app(LearningAttemptService::class);
        foreach (['moved', 'unpublished'] as $change) {
            $question = AudioQuestion::create(['chapter_id' => $this->chapter->id, 'question' => 'Question', 'options' => ['A' => 'One', 'B' => 'Two', 'C' => 'Three', 'D' => 'Four'], 'correct_option' => 'A', 'audio_url' => 'fixture.mp3', 'status' => 'published']);
            $attempt = $service->start($this->student, $this->chapter->program, $this->chapter, 'audio');
            $question->update($change === 'moved' ? ['chapter_id' => $otherChapter->id] : ['status' => 'draft']);
            $submitted = $service->submit($this->student, $this->chapter->program, $this->chapter, $attempt, [$question->id => 'A'], 0);
            $this->assertSame('completed', $submitted->status);
            $this->assertDatabaseMissing('activity_completions', ['user_id' => $this->student->id, 'type' => 'audio', 'resource_id' => $question->id]);
        }
        $this->assertSame(0, DB::table('gamification_rewards')->count());
        $this->assertSame(1, app(GamificationService::class)->streak($this->student));
    }

    public function test_historical_completion_counts_without_retroactive_xp(): void
    {
        ActivityCompletion::create(['user_id' => $this->student->id, 'chapter_id' => $this->chapter->id, 'type' => 'video', 'resource_id' => 999, 'completed_at' => CarbonImmutable::parse('2026-10-08 00:01:00', 'Asia/Jakarta')]);
        $this->getJson('/api/student/gamification')->assertJsonPath('data.streak_days', 1)->assertJsonPath('data.weekly_xp', 0)->assertJsonPath('data.challenge.active_days', 1);
    }
}
