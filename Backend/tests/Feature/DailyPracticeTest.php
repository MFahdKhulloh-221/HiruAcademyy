<?php

namespace Tests\Feature;

use App\Models\DailyPractice;
use App\Models\DailyPracticeAttempt;
use App\Models\DailyPracticePassage;
use App\Models\Program;
use App\Models\User;
use App\Services\AdminDailyPracticeReportService;
use App\Services\DailyPracticeAttemptService;
use App\Services\DailyPracticeService;
use App\Services\MediaService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Tests\TestCase;

class DailyPracticeTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('testing', app()->environment());
        $this->assertSame('hiru_academy_test', DB::connection()->getDatabaseName());
        $this->assertSame('hiru_backend_test_gamification_final_20261008', DB::selectOne('SELECT current_schema() AS name')->name);
        if (! Schema::hasTable('daily_practices')) {
            (require database_path('migrations/2026_11_13_000001_create_daily_practices_tables.php'))->up();
        }
        Program::firstOrCreate(['code' => 'n5'], ['slug' => 'n5', 'name' => 'N5', 'family' => 'jlpt', 'status' => 'active', 'sort_order' => 1]);
        $reports = \Mockery::mock(AdminDailyPracticeReportService::class)->makePartial();
        $reports->shouldReceive('readSnapshot')->andReturnUsing(fn ($read) => $read());
        $this->app->instance(AdminDailyPracticeReportService::class, $reports);
        $this->travelTo(now()->startOfDay()->addHours(5));
    }

    private function user(string $role = 'student'): User
    {
        $user = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $user->forceFill(['role' => $role, 'account_status' => 'active'])->save();

        return $user;
    }

    private function practice(): DailyPractice
    {
        $content = app(DailyPracticeService::class);
        $p = $content->save(['title' => 'Daily', 'category' => 'grammar', 'target_level' => 'n5', 'starts_at' => now()->subHour()->toISOString(), 'ends_at' => now()->addHour()->toISOString()]);
        $content->saveStudio($p, ['revision' => $content->studioRevision($p), 'settings' => ['status' => 'published'], 'passages' => [], 'questions' => [['id' => 'new', 'content' => ['session' => 'grammar', 'question' => '<p>Question<script>alert(1)</script></p>', 'options' => ['A' => 'One', 'B' => 'Two', 'C' => 'Three', 'D' => 'Four'], 'correct_option' => 'B', 'explanation' => 'Secret explanation', 'point_value' => 1.25, 'status' => 'published']]], 'deleted_question_ids' => [], 'deleted_passage_ids' => []]);

        return $p->fresh();
    }

    public function test_free_student_window_single_attempt_stale_revision_scoring_review_and_ownership(): void
    {
        $user = $this->user();
        $p = $this->practice();
        $base = '/api/student/daily-practices/'.$p->id;
        $this->actingAs($user)->getJson($base)->assertOk()->assertJsonPath('data.status', 'open')->assertJsonPath('data.attempt', null);
        $first = $this->postJson($base.'/attempt')->assertOk()->assertJsonPath('data.expires_at', $p->ends_at->toISOString())->json('data');
        $this->postJson($base.'/attempt')->assertOk()->assertJsonPath('data.id', $first['id']);
        $this->assertArrayNotHasKey('correct_option', $first['questions'][0]);
        $this->assertArrayNotHasKey('grading_snapshot', $first);
        $id = $first['questions'][0]['id'];
        $this->putJson($base.'/answers', ['answers' => [$id => 'B'], 'revision' => 0])->assertOk()->assertJsonPath('data.revision', 1);
        $this->putJson($base.'/answers', ['answers' => [$id => 'A'], 'revision' => 0])->assertStatus(409);
        $this->putJson($base.'/answers', ['answers' => [9999999 => 'A'], 'revision' => 1])->assertUnprocessable();
        $this->postJson($base.'/submit', ['revision' => 0])->assertStatus(409);
        $done = $this->postJson($base.'/submit', ['revision' => 1])->assertOk()->assertJsonPath('data.result.earned', 1.25)->assertJsonPath('data.result.max', 1.25)->assertJsonPath('data.result.overall_pass', null)->json('data');
        $this->postJson($base.'/submit', ['revision' => 0])->assertOk()->assertJsonPath('data.revision', $done['revision']);
        $this->getJson($base.'/review')->assertForbidden();
        $this->actingAs($this->user())->getJson($base.'/attempt')->assertNotFound();
        $this->travelTo($p->ends_at);
        $this->actingAs($user)->getJson($base.'/review')->assertOk()->assertJsonPath('data.questions.0.correct_option', 'B');
        $this->assertSame(1, DailyPracticeAttempt::where('daily_practice_id', $p->id)->count());
    }

    public function test_deadline_ignores_late_answers_command_and_lazy_expiry_reports_and_immutable_content(): void
    {
        $p = $this->practice();
        $user = $this->user();
        $base = '/api/student/daily-practices/'.$p->id;
        $first = $this->actingAs($user)->postJson($base.'/attempt')->assertOk()->json('data');
        $this->travelTo($p->ends_at);
        $this->putJson($base.'/answers', ['answers' => [$first['questions'][0]['id'] => 'B'], 'revision' => 0])->assertOk()->assertJsonPath('data.status', 'completed')->assertJsonPath('data.result.earned', 0);
        $this->actingAs($this->user())->postJson($base.'/attempt')->assertForbidden();
        $admin = $this->user('admin');
        $adminBase = '/api/admin/daily-practices/'.$p->id;
        $this->actingAs($admin)->patchJson($adminBase, ['title' => 'changed'])->assertStatus(409);
        $this->deleteJson($adminBase)->assertStatus(409);
        $this->putJson($adminBase.'/studio', [])->assertStatus(409);
        $this->getJson($adminBase.'/reports')->assertOk()->assertJsonPath('data.summary.responses', 1)->assertJsonPath('data.try_out.level', 'n5');
        $this->getJson($adminBase.'/reports/participants')->assertOk()->assertJsonPath('meta.total', 1);
        $this->getJson($adminBase.'/reports/attempts/'.$first['id'])->assertOk()->assertJsonPath('data.questions.0.correct_option', 'B');
        $other = $this->practice();
        $this->getJson('/api/admin/daily-practices/'.$other->id.'/reports/attempts/'.$first['id'])->assertNotFound();
        $this->getJson($adminBase)->assertOk()->assertJsonPath('data.locked', true);
        $this->actingAs($user)->getJson($adminBase)->assertForbidden();
    }

    public function test_refresh_at_exact_deadline_finalizes_without_extending_window(): void
    {
        $p = $this->practice();
        $base = '/api/student/daily-practices/'.$p->id;
        $first = $this->actingAs($this->user())->postJson($base.'/attempt')->assertOk()->json('data');
        $this->travelTo($p->ends_at->subSecond());
        $this->getJson($base.'/attempt')->assertOk()->assertJsonPath('data.status', 'in_progress')->assertJsonPath('data.expires_at', $first['expires_at']);
        $this->travelTo($p->ends_at);
        $this->getJson($base.'/attempt')->assertOk()->assertJsonPath('data.status', 'completed')->assertJsonPath('data.result.unanswered', 1)->assertJsonPath('data.revision', 1);
        $this->getJson($base.'/attempt')->assertOk()->assertJsonPath('data.revision', 1);
        $this->postJson($base.'/submit')->assertOk()->assertJsonPath('data.revision', 1);
    }

    public function test_scheduled_finalization_scores_only_started_attempts(): void
    {
        $p = $this->practice();
        $this->actingAs($this->user())->postJson('/api/student/daily-practices/'.$p->id.'/attempt')->assertOk();
        $this->travelTo($p->ends_at);
        $this->artisan('daily-practices:finalize')->expectsOutput('Finalized: 1')->assertSuccessful();
        $this->artisan('daily-practices:finalize')->expectsOutput('Finalized: 0')->assertSuccessful();
        $this->assertSame(1, DailyPracticeAttempt::where('daily_practice_id', $p->id)->where('status', 'completed')->count());
    }

    public function test_catalog_wib_dates_overlaps_future_and_target_level_labels(): void
    {
        $content = app(DailyPracticeService::class);
        Program::firstOrCreate(['code' => 'n4'], ['slug' => 'n4', 'name' => 'N4', 'family' => 'jlpt', 'status' => 'active', 'sort_order' => 2]);
        $user = $this->user();
        $day = now('Asia/Jakarta')->toDateString();
        $ids = [];
        foreach (DailyPracticeService::CATEGORIES as $category => $session) {
            $p = $content->save(['title' => $category, 'category' => $category, 'target_level' => 'n4', 'starts_at' => now()->subHour()->toISOString(), 'ends_at' => now()->addHour()->toISOString()]);
            $content->saveQuestion($p, ['session' => $session, 'question' => 'Question', 'options' => ['A' => 'One', 'B' => 'Two', 'C' => 'Three', 'D' => 'Four'], 'correct_option' => 'B', 'point_value' => 1, 'status' => 'published', 'audio_url' => $category === 'audio' ? 'https://example.test/audio.mp3' : null]);
            $p = $content->save(['status' => 'published'], $p);
            $ids[] = $p->id;
            $this->actingAs($user)->postJson('/api/student/daily-practices/'.$p->id.'/attempt')->assertOk();
        }
        $listed = $this->getJson('/api/student/daily-practices')->assertOk()->json('data');
        $this->assertEmpty(array_diff($ids, array_column($listed, 'id')));
        $this->assertEmpty($this->getJson('/api/student/daily-practices?date='.now('Asia/Jakarta')->subDay()->toDateString())->assertOk()->json('data'));
        $this->getJson('/api/student/daily-practices?date=not-a-date')->assertUnprocessable();
        $future = $this->practice();
        $future = $content->save(['starts_at' => now()->addHours(2)->toISOString(), 'ends_at' => now()->addHours(3)->toISOString()], $future);
        $this->getJson('/api/student/daily-practices/'.$future->id)->assertOk()->assertJsonPath('data.status', 'upcoming');
        $this->postJson('/api/student/daily-practices/'.$future->id.'/attempt')->assertForbidden();
        $this->assertSame($day, $future->starts_at->setTimezone('Asia/Jakarta')->toDateString());
    }

    public function test_shared_passage_blocks_snapshot_and_foreign_ownership(): void
    {
        config(['media.disk' => 'public']);
        Storage::fake('public');
        $image = 'media/image/22222222-2222-4222-8222-222222222222.png';
        Storage::disk('public')->put($image, 'image');
        $p = $this->practice();
        $content = app(DailyPracticeService::class);
        $blocks = [['type' => 'text', 'text' => '<p>Passage</p>'], ['type' => 'image', 'image' => $image, 'image_alt' => 'Diagram']];
        $q = $p->questions()->first();
        $content->saveStudio($p, ['revision' => $content->studioRevision($p), 'settings' => ['title' => 'Daily'], 'passages' => [['id' => 'group', 'title' => 'Group', 'body' => 'Fallback', 'blocks' => $blocks]], 'questions' => [['id' => (string) $q->id, 'content' => ['passage_id' => 'group']]], 'deleted_question_ids' => [], 'deleted_passage_ids' => []]);
        $foreign = $this->practice();
        $passage = DailyPracticePassage::where('daily_practice_id', $p->id)->firstOrFail();
        try {
            $content->saveQuestion($foreign, ['passage_id' => $passage->id], $foreign->questions()->first());
            $this->fail('Foreign passage must be rejected.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('passage_id', $e->errors());
        }
        $base = '/api/student/daily-practices/'.$p->id;
        $user = $this->user();
        $this->actingAs($user)->postJson($base.'/attempt')->assertOk()->assertJsonPath('data.questions.0.passage.blocks.1.image_alt', 'Diagram');
        $this->postJson($base.'/submit')->assertOk();
        $this->travelTo($p->ends_at);
        $this->getJson($base.'/review')->assertOk()->assertJsonPath('data.questions.0.passage.blocks.0.text', '<p>Passage</p>')->assertJsonPath('data.questions.0.correct_option', 'B');
    }

    public function test_media_retained_in_daily_content_blocks_and_attempt_snapshots(): void
    {
        if (! Schema::hasColumn('testimonials', 'video_thumbnail')) {
            (require database_path('migrations/2026_10_13_000001_add_testimonial_types_and_channels.php'))->up();
        }
        $path = 'media/image/11111111-1111-4111-8111-111111111111.png';
        $p = $this->practice();
        $question = $p->questions()->first();
        $question->forceFill(['image' => $path, 'image_alt' => 'Image'])->save();
        foreach (['question', 'blocks', 'grading', 'content'] as $location) {
            if ($location !== 'question') {
                DB::table('daily_practice_questions')->where('id', $question->id)->update(['image' => null]);
            }
            if ($location === 'blocks') {
                $passage = DailyPracticePassage::create(['daily_practice_id' => $p->id, 'title' => 'Passage', 'body' => 'Body', 'blocks' => [['type' => 'image', 'image' => $path, 'image_alt' => 'Image']]]);
            } elseif ($location === 'grading' || $location === 'content') {
                isset($passage) && $passage->delete();
                $attempt = DailyPracticeAttempt::where('daily_practice_id', $p->id)->first();
                if (! $attempt) {
                    $attempt = app(DailyPracticeAttemptService::class)->start($this->user(), $p);
                }
                DB::table('daily_practice_attempts')->where('id', $attempt->id)->update(['grading_snapshot' => json_encode($location === 'grading' ? ['image' => $path] : []), 'content_snapshot' => json_encode($location === 'content' ? [['image' => $path]] : [])]);
            }
            try {
                app(MediaService::class)->delete($path);
                $this->fail('Referenced media must not be deleted: '.$location);
            } catch (HttpExceptionInterface $e) {
                $this->assertSame(409, $e->getStatusCode(), $location);
            }
        }
    }

    public function test_validation_atomic_studio_sanitization_and_foreign_passage(): void
    {
        $admin = $this->user('admin');
        $this->actingAs($admin)->postJson('/api/admin/daily-practices', ['title' => 'bad', 'category' => 'grammar', 'target_level' => 'n5', 'starts_at' => '2026-11-13T23:00:00+07:00', 'ends_at' => '2026-11-14T01:00:00+07:00'])->assertUnprocessable();
        $p = $this->practice();
        $this->assertStringNotContainsString('<script', $p->questions()->first()->question);
        $content = app(DailyPracticeService::class);
        $revision = $content->studioRevision($p);
        $this->putJson('/api/admin/daily-practices/'.$p->id.'/studio', ['revision' => $revision, 'settings' => ['title' => 'must roll back'], 'passages' => [], 'questions' => [['id' => 'new', 'content' => ['passage_id' => 9999]]], 'deleted_question_ids' => [], 'deleted_passage_ids' => []])->assertUnprocessable();
        $this->assertSame('Daily', $p->fresh()->title);
        $this->assertSame($revision, $content->studioRevision($p));
        $this->putJson('/api/admin/daily-practices/'.$p->id.'/studio', ['revision' => str_repeat('0', 64), 'settings' => ['title' => 'stale'], 'passages' => [], 'questions' => [], 'deleted_question_ids' => [], 'deleted_passage_ids' => []])->assertStatus(409);
    }
}
