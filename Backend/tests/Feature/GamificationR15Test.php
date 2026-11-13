<?php

namespace Tests\Feature;

use App\Models\Chapter;
use App\Models\CheckpointAttempt;
use App\Models\CheckpointPackage;
use App\Models\LearningAttempt;
use App\Models\Program;
use App\Models\User;
use App\Models\VideoLesson;
use App\Services\GamificationService;
use App\Services\LearningProgressService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class GamificationR15Test extends TestCase
{
    use DatabaseTransactions;

    private User $student;

    private Chapter $chapter;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertMatchesRegularExpression('/^hiru_backend_test_[a-z0-9_]+$/D', (string) getenv('HIRU_TEST_SCHEMA'));
        CarbonImmutable::setTestNow('2026-10-08T17:10:00Z');
        $this->student = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $code = 'r15-'.Str::lower(Str::random(8));
        $program = Program::create(['code' => $code, 'slug' => $code, 'name' => 'R15 fixture', 'family' => 'foundation', 'status' => 'active', 'sort_order' => 0]);
        $this->chapter = Chapter::create(['program_id' => $program->id, 'chapter_number' => 1, 'title' => 'R15 fixture', 'status' => 'published']);
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    private function reward(string $key, int $points): void
    {
        DB::transaction(fn () => app(GamificationService::class)->award($this->student, $key, $points));
    }

    public function test_record_duplicate_reward_and_uncapped_daily_xp(): void
    {
        $video = VideoLesson::create(['chapter_id' => $this->chapter->id, 'title' => 'R15 video', 'video_url' => 'r15.mp4', 'status' => 'published']);
        $progress = app(LearningProgressService::class);
        $this->assertTrue($progress->record($this->student, $this->chapter, 'video', $video->id));
        $this->reward('video:'.$video->id, 10);
        $this->assertSame(10, (int) DB::table('gamification_rewards')->where('user_id', $this->student->id)->sum('xp'));
        $this->assertFalse($progress->record($this->student, $this->chapter, 'video', $video->id));
        $this->reward('video:'.$video->id, 10);
        $this->assertSame(1, DB::table('activity_completions')->where('user_id', $this->student->id)->count());
        $this->assertSame(1, DB::table('gamification_rewards')->where('user_id', $this->student->id)->count());
        $this->assertSame(10, (int) DB::table('gamification_rewards')->where('user_id', $this->student->id)->sum('xp'));

        $this->reward('exercise:audio:'.$this->chapter->id, 20);
        $this->reward('chapter:'.$this->chapter->id, 30);
        $this->reward('r15:extra', 20);
        $this->assertSame(80, (int) DB::table('gamification_days')->where('user_id', $this->student->id)->sum('xp'));
        $this->assertSame(80, (int) DB::table('gamification_rewards')->where('user_id', $this->student->id)->sum('xp'));
        $this->assertDatabaseHas('gamification_rewards', ['user_id' => $this->student->id, 'reward_key' => 'chapter:'.$this->chapter->id, 'xp' => 30]);
        $this->assertDatabaseHas('gamification_rewards', ['user_id' => $this->student->id, 'reward_key' => 'r15:extra', 'xp' => 20]);

        CarbonImmutable::setTestNow('2026-10-09T17:10:00Z');
        $this->reward('video:'.$video->id, 10);
        $this->reward('r15:next-day', 20);
        $this->assertDatabaseHas('gamification_days', ['user_id' => $this->student->id, 'activity_on' => '2026-10-10', 'xp' => 20]);
        $this->assertSame(5, DB::table('gamification_rewards')->where('user_id', $this->student->id)->count());
    }

    public function test_record_streak_uses_jakarta_days_not_same_day_count(): void
    {
        $progress = app(LearningProgressService::class);
        $gamification = app(GamificationService::class);
        $this->assertSame(0, $gamification->streak($this->student));
        $videos = [];
        for ($i = 0; $i < 3; $i++) {
            $chapter = Chapter::create(['program_id' => $this->chapter->program_id, 'chapter_number' => $i + 2, 'title' => 'R15 fixture', 'status' => 'published']);
            $videos[] = VideoLesson::create(['chapter_id' => $chapter->id, 'title' => 'R15 video', 'video_url' => 'r15.mp4', 'status' => 'published']);
        }
        foreach (array_slice($videos, 0, 2) as $video) {
            $progress->record($this->student, $video->chapter, 'video', $video->id);
        }
        $this->assertSame(1, $gamification->streak($this->student));
        CarbonImmutable::setTestNow('2026-10-09T16:59:00Z');
        $this->assertSame(1, $gamification->streak($this->student));
        CarbonImmutable::setTestNow('2026-10-09T17:01:00Z');
        $this->assertSame(1, $gamification->streak($this->student));
        $progress->record($this->student, $videos[2]->chapter, 'video', $videos[2]->id);
        $this->assertSame(2, $gamification->streak($this->student));
        CarbonImmutable::setTestNow('2026-10-10T17:01:00Z');
        $this->assertSame(2, $gamification->streak($this->student));
        CarbonImmutable::setTestNow('2026-10-11T17:01:00Z');
        $this->assertSame(0, $gamification->streak($this->student));
    }

    public function test_modern_checkpoint_completion_extends_streak_without_awarding_xp(): void
    {
        $package = CheckpointPackage::create(['program_id' => $this->chapter->program_id, 'title' => 'R15 checkpoint', 'access_type' => 'free', 'status' => 'published', 'duration_minutes' => 30, 'total_passing_score' => 1, 'max_score' => 1]);
        $base = ['user_id' => $this->student->id, 'checkpoint_package_id' => $package->id, 'content_snapshot' => [['id' => 1]], 'grading_snapshot' => ['max_score' => 1], 'answers' => [1 => 'A'], 'started_at' => now()->utc(), 'expires_at' => now()->utc()->addMinutes(30)];
        $video = VideoLesson::create(['chapter_id' => $this->chapter->id, 'title' => 'R15 video', 'video_url' => 'r15.mp4', 'status' => 'published']);
        app(LearningProgressService::class)->record($this->student, $this->chapter, 'video', $video->id);
        $this->reward('video:'.$video->id, 10);
        $before = DB::table('gamification_rewards')->where('user_id', $this->student->id)->get()->map(fn ($row) => (array) $row)->all();
        CheckpointAttempt::create($base + ['status' => 'completed', 'completed_at' => now()->utc()]);
        $service = app(GamificationService::class);
        $this->assertSame(1, $service->streak($this->student));
        CarbonImmutable::setTestNow('2026-10-09T17:01:00Z');
        CheckpointAttempt::create(array_replace($base, ['status' => 'in_progress', 'started_at' => now()->utc(), 'expires_at' => now()->utc()->addMinutes(30)]));
        $this->assertSame(1, $service->streak($this->student));
        CheckpointAttempt::create(array_replace($base, ['status' => 'completed', 'answers' => [], 'completed_at' => now()->utc()]));
        CheckpointAttempt::create(array_replace($base, ['status' => 'completed', 'abandoned_at' => now()->utc(), 'completed_at' => now()->utc()]));
        CheckpointAttempt::create(array_replace($base, ['status' => 'completed', 'completed_at' => null]));
        $this->assertSame(1, $service->streak($this->student));
        CheckpointAttempt::create(array_replace($base, ['status' => 'completed', 'completed_at' => now()->utc()]));
        $this->assertSame(2, $service->streak($this->student));
        $this->assertSame(2, $service->streak($this->student));
        $this->assertSame($before, DB::table('gamification_rewards')->where('user_id', $this->student->id)->get()->map(fn ($row) => (array) $row)->all());
        CarbonImmutable::setTestNow('2026-10-11T17:01:00Z');
        $this->assertSame(0, $service->streak($this->student));
        $this->assertSame($before, DB::table('gamification_rewards')->where('user_id', $this->student->id)->get()->map(fn ($row) => (array) $row)->all());
        $this->assertSame(1, DB::table('activity_completions')->where('user_id', $this->student->id)->count());
    }

    public function test_empty_and_unsubmitted_attempts_do_not_count_as_activity(): void
    {
        $attributes = ['user_id' => $this->student->id, 'chapter_id' => $this->chapter->id, 'kind' => 'audio', 'content_snapshot' => [['id' => 1]], 'grading_snapshot' => [1 => ['correct_option' => 'A']], 'revision' => 0];
        LearningAttempt::create($attributes + ['status' => 'completed', 'answers' => [], 'submitted_at' => now()->utc(), 'result_snapshot' => ['correct' => 0, 'total' => 1]]);
        LearningAttempt::create($attributes + ['status' => 'in_progress', 'answers' => [1 => 'A']]);
        $gamification = app(GamificationService::class);
        $this->assertSame([], $gamification->activityDays([$this->student->id]));
        $this->assertSame(0, $gamification->streak($this->student));
        $this->assertSame(0, DB::table('gamification_rewards')->where('user_id', $this->student->id)->count());
        LearningAttempt::create($attributes + ['status' => 'completed', 'answers' => [1 => 'A'], 'submitted_at' => now()->utc(), 'result_snapshot' => ['correct' => 0, 'total' => 1]]);
        $this->assertSame(1, $gamification->streak($this->student));
        $this->assertSame(0, DB::table('gamification_rewards')->where('user_id', $this->student->id)->count());
    }
}
