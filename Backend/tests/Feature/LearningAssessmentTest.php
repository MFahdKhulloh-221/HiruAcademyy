<?php

namespace Tests\Feature;

use App\Models\AccessGrant;
use App\Models\ActivityCompletion;
use App\Models\AudioQuestion;
use App\Models\Chapter;
use App\Models\Flashcard;
use App\Models\LearningAttempt;
use App\Models\LearningModule;
use App\Models\MiniCheckpointQuestion;
use App\Models\Program;
use App\Models\ReadingPassage;
use App\Models\ReadingQuestion;
use App\Models\User;
use App\Models\VideoLesson;
use App\Services\LearningContentService;
use App\Services\LearningProgressService;
use Carbon\CarbonImmutable;
use Database\Seeders\ProgramOfferSeeder;
use Database\Seeders\ProgramSeeder;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class LearningAssessmentTest extends TestCase
{
    use DatabaseTransactions;

    private User $student;

    private Chapter $chapter;

    private string $base;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('hiru_academy_test', DB::connection()->getDatabaseName());
        $this->seed([ProgramSeeder::class, ProgramOfferSeeder::class]);
        $this->student = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $this->student->forceFill(['role' => 'student', 'account_status' => 'active'])->save();
        $this->chapter = Chapter::create(['program_id' => Program::where('code', 'n5')->firstOrFail()->id, 'chapter_number' => 1, 'title' => 'Fixture', 'status' => 'published']);
        $this->base = '/api/student/programs/'.$this->chapter->program_id.'/chapters/'.$this->chapter->id;
        $this->actingAs($this->student);
    }

    private function question(array $extra = []): array
    {
        return array_replace(['question' => 'Question', 'options' => ['A' => 'One', 'B' => 'Two', 'C' => 'Three', 'D' => 'Four'], 'correct_option' => 'B', 'explanation' => 'Private explanation', 'status' => 'published'], $extra);
    }

    private function audio(array $extra = []): AudioQuestion
    {
        return AudioQuestion::create($this->question(['chapter_id' => $this->chapter->id, 'audio_url' => 'fixture.mp3', ...$extra]));
    }

    private function start(string $kind): array
    {
        return $this->postJson($this->base.'/attempts', ['kind' => $kind, ...($kind === 'mini' ? ['session' => 1, 'part' => 1] : [])])->assertCreated()->json('data');
    }

    private function prerequisites(): void
    {
        $video = VideoLesson::create(['chapter_id' => $this->chapter->id, 'title' => 'Video', 'video_url' => 'fixture.mp4', 'status' => 'published']);
        $module = LearningModule::create(['chapter_id' => $this->chapter->id, 'title' => 'Module', 'file_url' => 'fixture.pdf', 'module_type' => 'general', 'status' => 'published']);
        Flashcard::create(['chapter_id' => $this->chapter->id, 'japanese' => '猫', 'reading' => 'ねこ', 'meaning' => 'Cat', 'status' => 'published']);
        foreach (['video' => $video->id, 'module' => $module->id] as $type => $id) {
            $this->postJson($this->base.'/completions', ['type' => $type, 'resource_id' => $id])->assertOk();
        }
        $this->postJson($this->base.'/completions', ['type' => 'flashcard'])->assertOk();
    }

    public function test_mini_groups_validation_snapshot_deadline_and_expiry_on_every_endpoint(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->prerequisites();
        foreach ([[], ['session' => 0, 'part' => 1], ['session' => 1, 'part' => 1.5]] as $selection) {
            $this->postJson($this->base.'/attempts', ['kind' => 'mini', ...$selection])->assertUnprocessable();
        }
        $question = MiniCheckpointQuestion::create($this->question(['chapter_id' => $this->chapter->id, 'session' => 1, 'part' => 1, 'duration_minutes' => 5]));
        $second = MiniCheckpointQuestion::create($this->question(['chapter_id' => $this->chapter->id, 'session' => 1, 'part' => 1, 'duration_minutes' => 5]));
        MiniCheckpointQuestion::create($this->question(['chapter_id' => $this->chapter->id, 'session' => 2, 'part' => 3, 'duration_minutes' => null]));
        MiniCheckpointQuestion::create($this->question(['chapter_id' => $this->chapter->id, 'session' => 9, 'part' => 9, 'status' => 'draft']));
        $groups = $this->getJson($this->base)->assertOk()->json('data.mini_checkpoints');
        $this->assertSame([
            ['session' => 1, 'part' => 1, 'duration_minutes' => 5, 'question_count' => 2, 'configuration_valid' => true],
            ['session' => 2, 'part' => 3, 'duration_minutes' => null, 'question_count' => 1, 'configuration_valid' => false],
        ], $groups);
        $this->postJson($this->base.'/attempts', ['kind' => 'mini', 'session' => 2, 'part' => 3])->assertUnprocessable()->assertJsonValidationErrors('duration_minutes');
        foreach (['show', 'save', 'submit', 'review'] as $endpoint) {
            $this->travelTo(CarbonImmutable::parse('2026-10-08T10:00:00+07:00'));
            $attempt = $this->start('mini');
            $this->assertCount(2, $attempt['questions']);
            $this->assertSame(5, $attempt['duration_minutes']);
            $this->assertSame('2026-10-08T03:00:00.000000Z', $attempt['started_at']);
            $this->assertSame('2026-10-08T03:05:00.000000Z', $attempt['expires_at']);
            $this->assertSame($attempt['started_at'], $attempt['server_now']);
            $url = $this->base.'/attempts/'.$attempt['id'];
            $this->putJson($url.'/answers', ['answers' => [$question->id => 'B'], 'revision' => 0])->assertOk()->assertJsonPath('data.expires_at', $attempt['expires_at']);
            $this->getJson($url.'/review')->assertForbidden();
            $question->update(['duration_minutes' => 20]);
            $second->update(['duration_minutes' => 20]);
            $this->travelTo(CarbonImmutable::parse('2026-10-08T03:05:00Z'));
            $late = ['answers' => [999999 => 'E'], 'revision' => 0];
            $response = match ($endpoint) {
                'show' => $this->getJson($url),
                'save' => $this->putJson($url.'/answers', $late),
                'submit' => $this->postJson($url.'/submit', $late),
                'review' => $this->getJson($url.'/review'),
            };
            $response->assertOk()->assertJsonPath('data.status', 'completed')->assertJsonPath('data.revision', 2)
                ->assertJsonPath('data.result.correct', 1)->assertJsonPath('data.result.unanswered', 1)
                ->assertJsonPath('data.result.passed', false)->assertJsonPath('data.expires_at', $attempt['expires_at']);
            if ($endpoint !== 'review') {
                $this->assertStringNotContainsString('correct_option', $response->getContent());
            }
            $this->postJson($url.'/submit', $late)->assertOk()->assertJsonPath('data.revision', 2);
            $question->update(['duration_minutes' => 5]);
            $second->update(['duration_minutes' => 5]);
        }
        $this->travelBack();
    }

    public function test_mini_admin_publishing_and_legacy_snapshots_fail_safe(): void
    {
        $this->prerequisites();
        $this->student->forceFill(['role' => 'admin'])->save();
        $payload = $this->question(['chapter_id' => $this->chapter->id, 'session' => 1, 'part' => 1]);
        $this->postJson('/api/admin/mini-checkpoint-questions', $payload)->assertUnprocessable()->assertJsonValidationErrors('duration_minutes');
        $draft = $this->postJson('/api/admin/mini-checkpoint-questions', [...$payload, 'status' => 'draft'])->assertCreated()->json('data.id');
        $this->patchJson('/api/admin/mini-checkpoint-questions/'.$draft, ['status' => 'published'])->assertUnprocessable();
        $this->patchJson('/api/admin/mini-checkpoint-questions/'.$draft, ['status' => 'published', 'duration_minutes' => 5])->assertOk();
        $this->postJson('/api/admin/mini-checkpoint-questions', [...$payload, 'duration_minutes' => 6])->assertUnprocessable();
        $this->student->forceFill(['role' => 'student'])->save();
        $attempt = $this->start('mini');
        $model = LearningAttempt::findOrFail($attempt['id']);
        $snapshot = $model->content_snapshot;
        $snapshot[0]['duration_minutes'] = null;
        DB::table('learning_attempts')->where('id', $model->id)->update(['content_snapshot' => json_encode($snapshot)]);
        $url = $this->base.'/attempts/'.$model->id;
        $this->getJson($url)->assertUnprocessable()->assertJsonValidationErrors('duration_minutes');
        $this->getJson($url.'/review')->assertUnprocessable();
        $this->putJson($url.'/answers', ['answers' => [], 'revision' => 0])->assertUnprocessable();
        $this->postJson($url.'/submit', ['answers' => [], 'revision' => 0])->assertUnprocessable();
        $this->assertSame('in_progress', $model->fresh()->status);
        foreach ([0, -1, '5'] as $invalid) {
            $snapshot[0]['duration_minutes'] = $invalid;
            DB::table('learning_attempts')->where('id', $model->id)->update(['content_snapshot' => json_encode($snapshot)]);
            $this->getJson($url)->assertUnprocessable()->assertJsonValidationErrors('duration_minutes');
        }
        $snapshot[0]['duration_minutes'] = 5;
        $snapshot[] = [...$snapshot[0], 'id' => 999999, 'duration_minutes' => 6];
        DB::table('learning_attempts')->where('id', $model->id)->update(['content_snapshot' => json_encode($snapshot)]);
        $this->getJson($url)->assertUnprocessable()->assertJsonValidationErrors('duration_minutes');
    }

    public function test_progress_requires_each_nonempty_published_type_and_individual_resources(): void
    {
        $this->getJson($this->base.'/progress')->assertOk()->assertJsonPath('data.mini_unlocked', false);
        $this->prerequisites();
        $module = LearningModule::create(['chapter_id' => $this->chapter->id, 'title' => 'Second', 'file_url' => 'fixture.pdf', 'module_type' => 'general', 'status' => 'published']);
        LearningModule::create(['chapter_id' => $this->chapter->id, 'title' => 'Draft', 'file_url' => 'fixture.pdf', 'module_type' => 'general', 'status' => 'draft']);
        $this->getJson($this->base.'/progress')->assertJsonPath('data.activities.video.total', 1)->assertJsonPath('data.activities.video.complete', true)->assertJsonPath('data.activities.module.total', 2)->assertJsonPath('data.activities.module.complete', false)->assertJsonPath('data.activities.audio.complete', false);
        $this->postJson($this->base.'/completions', ['type' => 'module', 'resource_id' => $module->id])->assertOk();
        $this->postJson($this->base.'/completions', ['type' => 'module', 'resource_id' => $module->id])->assertOk();
        $this->assertSame(2, ActivityCompletion::where('type', 'module')->count());
        $this->postJson($this->base.'/completions', ['type' => 'audio', 'resource_id' => 1])->assertUnprocessable();
        $this->postJson($this->base.'/completions', ['type' => 'reading', 'resource_id' => 1])->assertUnprocessable();
        $this->postJson($this->base.'/completions', ['type' => 'flashcard', 'known' => true])->assertUnprocessable();
        $card = Flashcard::create(['chapter_id' => $this->chapter->id, 'japanese' => '犬', 'reading' => 'いぬ', 'meaning' => 'Dog', 'status' => 'published']);
        $this->getJson($this->base.'/progress')->assertJsonPath('data.activities.flashcard.complete', false);
        $this->postJson($this->base.'/completions', ['type' => 'flashcard'])->assertJsonPath('data.activities.flashcard.complete', true);
        $this->assertDatabaseHas('activity_completions', ['type' => 'flashcard', 'resource_id' => $card->id]);
    }

    public function test_practice_snapshots_server_grading_review_and_new_reading_question_gate(): void
    {
        $this->prerequisites();
        $audio = $this->audio();
        $this->audio(['status' => 'draft']);
        $passage = ReadingPassage::create(['chapter_id' => $this->chapter->id, 'title' => 'Original passage', 'body' => 'Original body', 'status' => 'published']);
        $reading = ReadingQuestion::create($this->question(['reading_passage_id' => $passage->id]));
        ReadingQuestion::create($this->question(['reading_passage_id' => $passage->id, 'status' => 'draft']));
        $attempt = $this->start('reading');
        $id = $attempt['id'];
        $this->assertCount(1, $attempt['questions']);
        $this->assertStringNotContainsString('correct_option', json_encode($attempt));
        $this->assertStringNotContainsString('explanation', json_encode($attempt));
        $this->assertStringNotContainsString('grading_snapshot', json_encode(LearningAttempt::findOrFail($id)));
        $this->getJson($this->base.'/attempts/'.$id.'/review')->assertForbidden();
        $this->postJson($this->base.'/attempts/'.$id.'/submit', ['answers' => [], 'revision' => 0])->assertUnprocessable();
        $this->assertDatabaseMissing('activity_completions', ['type' => 'reading', 'resource_id' => $reading->id]);
        $reading->update(['correct_option' => 'A', 'explanation' => 'Changed', 'question' => 'Changed']);
        $passage->update(['body' => 'Changed']);
        $submit = ['answers' => [$reading->id => 'B'], 'revision' => 0];
        $this->postJson($this->base.'/attempts/'.$id.'/submit', [...$submit, 'score' => 100])->assertUnprocessable();
        $this->postJson($this->base.'/attempts/'.$id.'/submit', $submit)->assertOk()->assertJsonPath('data.result.correct', 1)->assertJsonPath('data.result.percentage', 100);
        $this->getJson($this->base.'/attempts/'.$id.'/review')->assertOk()->assertJsonPath('data.questions.0.correct_option', 'B')->assertJsonPath('data.questions.0.explanation', 'Private explanation')->assertJsonPath('data.questions.0.passage.body', 'Original body');
        $audioAttempt = $this->start('audio');
        $this->postJson($this->base.'/attempts/'.$audioAttempt['id'].'/submit', ['answers' => [$audio->id => 'A'], 'revision' => 0])->assertOk()->assertJsonPath('data.result.wrong', 1);
        $this->getJson($this->base.'/progress')->assertJsonPath('data.mini_unlocked', true);
        MiniCheckpointQuestion::create($this->question(['chapter_id' => $this->chapter->id, 'session' => 1, 'part' => 1, 'duration_minutes' => 5]));
        MiniCheckpointQuestion::create($this->question(['chapter_id' => $this->chapter->id, 'status' => 'draft']));
        $mini = $this->start('mini');
        $this->assertCount(1, $mini['questions']);
        $this->postJson($this->base.'/attempts/'.$mini['id'].'/submit', ['answers' => [], 'revision' => 0])->assertOk()->assertJsonPath('data.result.unanswered', 1);
        ReadingQuestion::create($this->question(['reading_passage_id' => $passage->id]));
        $this->getJson($this->base.'/progress')->assertJsonPath('data.mini_unlocked', false);
    }

    public function test_stale_save_double_submit_and_manual_auto_collision_are_idempotent(): void
    {
        $question = $this->audio();
        $attempt = $this->start('audio');
        $url = $this->base.'/attempts/'.$attempt['id'];
        $this->putJson($url.'/answers', ['answers' => [$question->id => 'A'], 'revision' => 0])->assertOk()->assertJsonPath('data.revision', 1);
        $this->putJson($url.'/answers', ['answers' => [$question->id => 'B'], 'revision' => 0])->assertConflict();
        $this->postJson($url.'/submit', ['answers' => [$question->id => 'B'], 'revision' => 0])->assertConflict();
        $this->travelTo(CarbonImmutable::parse('2026-10-04T22:45:00+07:00'));
        $first = $this->postJson($url.'/submit', ['answers' => [$question->id => 'B'], 'revision' => 1])->assertOk()->json('data');
        $second = $this->postJson($url.'/submit', ['answers' => [$question->id => 'A'], 'revision' => 1])->assertOk()->json('data');
        $this->assertEquals($first, $second);
        $this->assertSame('2026-10-04T15:45:00.000000Z', $first['submitted_at']);
        $this->assertSame($first['submitted_at'], $second['submitted_at']);
        $this->getJson($url)->assertOk()->assertJsonPath('data.submitted_at', $first['submitted_at']);
        $this->assertSame($first['submitted_at'], LearningAttempt::findOrFail($attempt['id'])->submitted_at->toISOString());
        $this->travelBack();
        $this->putJson($url.'/answers', ['answers' => [$question->id => 'A'], 'revision' => 0])->assertOk()->assertJsonPath('data.answers.'.$question->id, 'B');
        $this->assertSame(1, ActivityCompletion::where('type', 'audio')->count());
    }

    public function test_invalid_options_unknown_ids_and_foreign_resource_or_owner_are_rejected(): void
    {
        $question = $this->audio();
        $attempt = $this->start('audio');
        $url = $this->base.'/attempts/'.$attempt['id'];
        foreach ([[$question->id => 'E'], [$question->id => null], [999999 => 'A'], [$question->id => ['A']]] as $answers) {
            $this->postJson($url.'/submit', ['answers' => $answers, 'revision' => 0])->assertUnprocessable();
        }
        $otherChapter = Chapter::create(['program_id' => $this->chapter->program_id, 'chapter_number' => 2, 'title' => 'Other', 'status' => 'published']);
        $video = VideoLesson::create(['chapter_id' => $otherChapter->id, 'title' => 'Other', 'video_url' => 'fixture.mp4', 'status' => 'published']);
        $this->postJson($this->base.'/completions', ['type' => 'video', 'resource_id' => $video->id])->assertNotFound();
        $other = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $other->forceFill(['role' => 'student', 'account_status' => 'active'])->save();
        $this->actingAs($other)->getJson($url)->assertNotFound();
        $this->getJson($url.'/review')->assertNotFound();
        $this->postJson($url.'/submit', ['answers' => [$question->id => 'B'], 'revision' => 0])->assertNotFound();
    }

    public function test_mini_free_foundation_unanswered_unlimited_and_interview_excluded(): void
    {
        $this->chapter->update(['program_id' => Program::where('code', 'dasar')->firstOrFail()->id]);
        $this->base = '/api/student/programs/'.$this->chapter->program_id.'/chapters/'.$this->chapter->id;
        MiniCheckpointQuestion::create($this->question(['chapter_id' => $this->chapter->id, 'session' => 1, 'part' => 1, 'duration_minutes' => 5]));
        $this->postJson($this->base.'/attempts', ['kind' => 'mini', 'session' => 1, 'part' => 1])->assertForbidden();
        $this->prerequisites();
        $audio = $this->audio(['audio_url' => 'https://media.example.test/dasar.mp3']);
        $passage = ReadingPassage::create(['chapter_id' => $this->chapter->id, 'title' => 'Fixture', 'body' => 'Fixture', 'status' => 'published']);
        $reading = ReadingQuestion::create($this->question(['reading_passage_id' => $passage->id]));
        $this->getJson($this->base.'/progress')->assertJsonPath('data.mini_unlocked', false);
        foreach (['audio' => $audio, 'reading' => $reading] as $kind => $question) {
            $practice = $this->start($kind);
            $this->postJson($this->base.'/attempts/'.$practice['id'].'/submit', ['answers' => [$question->id => 'B'], 'revision' => 0])->assertOk();
        }
        $this->getJson($this->base.'/progress')->assertJsonPath('data.mini_unlocked', true);
        for ($i = 0; $i < 3; $i++) {
            $attempt = $this->start('mini');
            $this->postJson($this->base.'/attempts/'.$attempt['id'].'/submit', ['answers' => [], 'revision' => 0])->assertOk()->assertJsonPath('data.result.unanswered', 1)->assertJsonPath('data.result.total', 1)->assertJsonPath('data.result.percentage', 0);
        }
        $this->chapter->update(['program_id' => Program::where('code', 'interview')->firstOrFail()->id]);
        $interview = Program::where('code', 'interview')->firstOrFail();
        $this->assertSame([], app(LearningProgressService::class)->requiredTypes($interview));
        AccessGrant::create(['user_id' => $this->student->id, 'program_id' => $interview->id, 'plan_code' => 'lms', 'status' => 'active', 'starts_at' => now()->subDay(), 'ends_at' => now()->addDay()]);
        $this->base = '/api/student/programs/'.$interview->id.'/chapters/'.$this->chapter->id;
        $this->postJson($this->base.'/attempts', ['kind' => 'mini', 'session' => 1, 'part' => 1])->assertForbidden();
        $this->assertSame(['video', 'module', 'flashcard'], app(LearningProgressService::class)->requiredTypes(Program::where('code', 'ssw-food')->firstOrFail()));
    }

    public function test_ssw_mini_requires_standalone_access_and_three_activity_types(): void
    {
        $program = Program::where('code', 'ssw-food')->firstOrFail();
        $this->chapter->update(['program_id' => $program->id]);
        $this->base = '/api/student/programs/'.$program->id.'/chapters/'.$this->chapter->id;
        MiniCheckpointQuestion::create($this->question(['chapter_id' => $this->chapter->id, 'session' => 1, 'part' => 1, 'duration_minutes' => 5]));
        $this->getJson($this->base.'/progress')->assertForbidden();
        AccessGrant::create(['user_id' => $this->student->id, 'program_id' => $program->id, 'plan_code' => 'lms', 'status' => 'active', 'starts_at' => now()->subDay(), 'ends_at' => now()->addDay()]);
        $this->prerequisites();
        $this->getJson($this->base.'/progress')->assertJsonPath('data.mini_unlocked', true);
        $this->start('mini');
        $this->postJson($this->base.'/attempts', ['kind' => 'audio'])->assertNotFound();
    }

    public function test_runtime_access_rechecks_grants_publication_and_program_ownership(): void
    {
        $this->chapter->update(['chapter_number' => 2]);
        $program = $this->chapter->program;
        foreach ([['inactive', now()->subDay(), now()->addDay()], ['active', now()->subDays(3), now()->subDay()], ['active', now()->addDay(), now()->addDays(3)]] as [$status, $start, $end]) {
            $grant = AccessGrant::create(['user_id' => $this->student->id, 'program_id' => $program->id, 'plan_code' => 'lms', 'status' => $status, 'starts_at' => $start, 'ends_at' => $end]);
            $this->getJson($this->base.'/progress')->assertForbidden();
            $grant->delete();
        }
        $grant = AccessGrant::create(['user_id' => $this->student->id, 'program_id' => $program->id, 'plan_code' => 'lms', 'status' => 'active', 'starts_at' => now()->subDay(), 'ends_at' => now()->addDay()]);
        $question = $this->audio();
        $attempt = $this->start('audio');
        $grant->update(['status' => 'inactive']);
        $url = $this->base.'/attempts/'.$attempt['id'];
        $this->getJson($url)->assertForbidden();
        $this->putJson($url.'/answers', ['answers' => [], 'revision' => 0])->assertForbidden();
        $this->postJson($url.'/submit', ['answers' => [$question->id => 'B'], 'revision' => 0])->assertForbidden();
        $this->getJson($url.'/review')->assertForbidden();
        $grant->update(['status' => 'active']);
        $this->chapter->update(['status' => 'draft']);
        $this->getJson($url)->assertNotFound();
        $this->chapter->update(['status' => 'published']);
        $program->update(['status' => 'inactive']);
        $this->getJson($url)->assertNotFound();
        $program->update(['status' => 'active']);
        $foreignBase = '/api/student/programs/'.Program::where('code', 'n4')->firstOrFail()->id.'/chapters/'.$this->chapter->id;
        $this->getJson($foreignBase.'/progress')->assertNotFound();
    }

    public function test_middleware_blocks_admin_inactive_and_guest(): void
    {
        $this->student->forceFill(['role' => 'admin'])->save();
        $this->getJson($this->base.'/progress')->assertForbidden();
        $this->student->forceFill(['role' => 'student', 'account_status' => 'inactive'])->save();
        $this->getJson($this->base.'/progress')->assertUnauthorized();
        auth()->forgetGuards();
        $this->getJson($this->base.'/progress')->assertUnauthorized();
    }

    public function test_explicit_payload_allowlists_filter_untrusted_snapshot_keys(): void
    {
        $question = $this->audio();
        $attempt = $this->start('audio');
        $model = LearningAttempt::findOrFail($attempt['id']);
        $content = $model->content_snapshot;
        $content[0]['correct_option'] = 'B';
        $content[0]['explanation'] = 'Injected';
        $content[0]['grading_snapshot'] = ['secret' => true];
        $content[0]['options']['correct_option'] = 'B';
        DB::table('learning_attempts')->where('id', $model->id)->update(['content_snapshot' => json_encode($content)]);
        $payload = $this->getJson($this->base.'/attempts/'.$model->id)->assertOk()->json('data');
        $this->assertStringNotContainsString('correct_option', json_encode($payload));
        $this->assertStringNotContainsString('explanation', json_encode($payload));
        $this->assertStringNotContainsString('grading_snapshot', json_encode($payload));
        $this->postJson($this->base.'/attempts/'.$model->id.'/submit', ['answers' => [$question->id => 'B'], 'revision' => 0])->assertOk();
    }

    public function test_empty_or_draft_only_published_passage_blocks_reading_unlock(): void
    {
        $this->prerequisites();
        $audio = $this->audio();
        $audioAttempt = $this->start('audio');
        $this->postJson($this->base.'/attempts/'.$audioAttempt['id'].'/submit', ['answers' => [$audio->id => 'B'], 'revision' => 0])->assertOk();
        $passage = ReadingPassage::create(['chapter_id' => $this->chapter->id, 'title' => 'Complete', 'body' => 'Body', 'status' => 'published']);
        $question = ReadingQuestion::create($this->question(['reading_passage_id' => $passage->id]));
        $attempt = $this->start('reading');
        $this->postJson($this->base.'/attempts/'.$attempt['id'].'/submit', ['answers' => [$question->id => 'B'], 'revision' => 0])->assertOk();
        $this->getJson($this->base.'/progress')->assertJsonPath('data.mini_unlocked', true);
        $empty = ReadingPassage::create(['chapter_id' => $this->chapter->id, 'title' => 'Empty', 'body' => 'Body', 'status' => 'published']);
        $this->getJson($this->base.'/progress')->assertJsonPath('data.activities.reading.complete', false)->assertJsonPath('data.mini_unlocked', false);
        $this->postJson($this->base.'/attempts', ['kind' => 'mini', 'session' => 1, 'part' => 1])->assertForbidden();
        $draft = ReadingQuestion::create($this->question(['reading_passage_id' => $empty->id, 'status' => 'draft']));
        $this->getJson($this->base.'/progress')->assertJsonPath('data.activities.reading.complete', false);
        $empty->update(['status' => 'draft']);
        $this->getJson($this->base.'/progress')->assertJsonPath('data.mini_unlocked', true);
        $empty->update(['status' => 'published']);
        $draft->update(['status' => 'published']);
        $this->getJson($this->base.'/progress')->assertJsonPath('data.mini_unlocked', false);
        $attempt = $this->start('reading');
        $this->postJson($this->base.'/attempts/'.$attempt['id'].'/submit', ['answers' => [$question->id => 'B', $draft->id => 'B'], 'revision' => 0])->assertOk();
        $this->getJson($this->base.'/progress')->assertJsonPath('data.mini_unlocked', true);
    }

    public function test_submit_grades_snapshot_but_does_not_complete_moved_or_unpublished_resources(): void
    {
        $other = Chapter::create(['program_id' => $this->chapter->program_id, 'chapter_number' => 2, 'title' => 'Other', 'status' => 'published']);
        $service = app(LearningContentService::class);
        $audio = $this->audio();
        $draftAudio = $this->audio();
        $audioAttempt = $this->start('audio');
        $service->save('audio-questions', ['chapter_id' => $other->id, 'correct_option' => 'A'], $audio);
        $service->save('audio-questions', ['status' => 'draft'], $draftAudio);
        $this->postJson($this->base.'/attempts/'.$audioAttempt['id'].'/submit', ['answers' => [$audio->id => 'B', $draftAudio->id => 'B'], 'revision' => 0])->assertOk()->assertJsonPath('data.result.correct', 2);
        $this->assertSame(0, ActivityCompletion::where('type', 'audio')->count());
        $passage = ReadingPassage::create(['chapter_id' => $this->chapter->id, 'title' => 'Original', 'body' => 'Original body', 'status' => 'published']);
        $target = ReadingPassage::create(['chapter_id' => $other->id, 'title' => 'Target', 'body' => 'Target body', 'status' => 'published']);
        $movedQuestion = ReadingQuestion::create($this->question(['reading_passage_id' => $passage->id]));
        $draftQuestion = ReadingQuestion::create($this->question(['reading_passage_id' => $passage->id]));
        $readingAttempt = $this->start('reading');
        $service->save('reading-questions', ['reading_passage_id' => $target->id], $movedQuestion);
        $service->save('reading-questions', ['status' => 'draft'], $draftQuestion);
        $this->postJson($this->base.'/attempts/'.$readingAttempt['id'].'/submit', ['answers' => [$movedQuestion->id => 'B', $draftQuestion->id => 'B'], 'revision' => 0])->assertOk()->assertJsonPath('data.result.correct', 2);
        $this->assertSame(0, ActivityCompletion::where('type', 'reading')->count());
        $remaining = ReadingQuestion::create($this->question(['reading_passage_id' => $passage->id]));
        $attempt = $this->start('reading');
        $service->save('reading-passages', ['chapter_id' => $other->id], $passage);
        $this->postJson($this->base.'/attempts/'.$attempt['id'].'/submit', ['answers' => [$remaining->id => 'B'], 'revision' => 0])->assertOk()->assertJsonPath('data.result.correct', 1);
        $this->assertSame(0, ActivityCompletion::where('type', 'reading')->count());
        $this->getJson($this->base.'/attempts/'.$attempt['id'].'/review')->assertOk()->assertJsonPath('data.questions.0.passage.body', 'Original body');
        $service->save('reading-passages', ['chapter_id' => $this->chapter->id], $passage->fresh());
        $attempt = $this->start('reading');
        $service->save('reading-passages', ['status' => 'draft'], $passage->fresh());
        $this->postJson($this->base.'/attempts/'.$attempt['id'].'/submit', ['answers' => [$remaining->id => 'B'], 'revision' => 0])->assertOk();
        $this->assertSame(0, ActivityCompletion::where('type', 'reading')->count());
    }

    public function test_canonical_completion_survives_legitimate_move_without_duplicate(): void
    {
        $audio = $this->audio();
        $attempt = $this->start('audio');
        $this->postJson($this->base.'/attempts/'.$attempt['id'].'/submit', ['answers' => [$audio->id => 'B'], 'revision' => 0])->assertOk();
        $other = Chapter::create(['program_id' => $this->chapter->program_id, 'chapter_number' => 2, 'title' => 'Other', 'status' => 'published']);
        AccessGrant::create(['user_id' => $this->student->id, 'program_id' => $other->program_id, 'plan_code' => 'lms', 'status' => 'active', 'starts_at' => now()->subDay(), 'ends_at' => now()->addDay()]);
        app(LearningContentService::class)->save('audio-questions', ['chapter_id' => $other->id], $audio);
        $this->getJson($this->base.'/progress')->assertJsonPath('data.activities.audio.total', 0);
        $this->base = '/api/student/programs/'.$other->program_id.'/chapters/'.$other->id;
        $this->getJson($this->base.'/progress')->assertJsonPath('data.activities.audio.complete', true);
        $attempt = $this->start('audio');
        $this->postJson($this->base.'/attempts/'.$attempt['id'].'/submit', ['answers' => [$audio->id => 'B'], 'revision' => 0])->assertOk();
        $this->assertSame(1, ActivityCompletion::where('type', 'audio')->where('resource_id', $audio->id)->count());
        $this->assertDatabaseHas('activity_completions', ['type' => 'audio', 'resource_id' => $audio->id, 'chapter_id' => $other->id]);
    }

    public function test_admin_cannot_delete_chapter_with_retained_attempts(): void
    {
        $this->audio();
        $attempt = $this->start('audio');
        $this->student->forceFill(['role' => 'admin'])->save();
        $this->deleteJson('/api/admin/chapters/'.$this->chapter->id)->assertUnprocessable()->assertJsonValidationErrors('chapter');
        $this->assertDatabaseHas('learning_attempts', ['id' => $attempt['id']]);
        $this->assertDatabaseHas('chapters', ['id' => $this->chapter->id]);
    }

    public function test_completed_review_reports_selected_answers_and_each_question_status(): void
    {
        $this->chapter->update(['program_id' => Program::where('code', 'dasar')->firstOrFail()->id]);
        $this->base = '/api/student/programs/'.$this->chapter->program_id.'/chapters/'.$this->chapter->id;
        $this->prerequisites();
        $audio = $this->audio();
        $passage = ReadingPassage::create(['chapter_id' => $this->chapter->id, 'title' => 'Fixture', 'body' => 'Fixture', 'status' => 'published']);
        $reading = ReadingQuestion::create($this->question(['reading_passage_id' => $passage->id]));
        foreach (['audio' => $audio, 'reading' => $reading] as $kind => $question) {
            $practice = $this->start($kind);
            $this->postJson($this->base.'/attempts/'.$practice['id'].'/submit', ['answers' => [$question->id => 'B'], 'revision' => 0])->assertOk();
        }
        $correct = MiniCheckpointQuestion::create($this->question(['chapter_id' => $this->chapter->id, 'session' => 1, 'part' => 1, 'duration_minutes' => 5]));
        $wrong = MiniCheckpointQuestion::create($this->question(['chapter_id' => $this->chapter->id, 'session' => 1, 'part' => 1, 'duration_minutes' => 5]));
        $unanswered = MiniCheckpointQuestion::create($this->question(['chapter_id' => $this->chapter->id, 'session' => 1, 'part' => 1, 'duration_minutes' => 5]));
        $attempt = $this->start('mini');
        foreach ($attempt['questions'] as $question) {
            $this->assertArrayNotHasKey('selected_answer', $question);
            $this->assertArrayNotHasKey('status', $question);
        }
        $url = $this->base.'/attempts/'.$attempt['id'];
        $this->getJson($url.'/review')->assertForbidden();
        $this->postJson($url.'/submit', ['answers' => [$correct->id => 'B', $wrong->id => 'A'], 'revision' => 0])->assertOk();
        $correct->update(['correct_option' => 'A']);
        $questions = collect($this->getJson($url.'/review')->assertOk()->json('data.questions'))->keyBy('id');
        foreach ([[$correct->id, 'B', 'correct'], [$wrong->id, 'A', 'wrong'], [$unanswered->id, null, 'unanswered']] as [$id, $selected, $status]) {
            $this->assertSame($selected, $questions[$id]['selected_answer']);
            $this->assertSame($status, $questions[$id]['status']);
            $this->assertSame('B', $questions[$id]['correct_option']);
            $this->assertSame('Private explanation', $questions[$id]['explanation']);
        }
        foreach ($this->getJson($url)->assertOk()->json('data.questions') as $question) {
            $this->assertArrayNotHasKey('selected_answer', $question);
            $this->assertArrayNotHasKey('status', $question);
        }
    }

    public function test_completion_audit_timestamp_is_absolute_and_preserves_first_completion(): void
    {
        $video = VideoLesson::create(['chapter_id' => $this->chapter->id, 'title' => 'Video', 'video_url' => 'fixture.mp4', 'status' => 'published']);
        try {
            $this->travelTo(CarbonImmutable::parse('2026-10-04T22:45:00+07:00'));
            $this->postJson($this->base.'/completions', ['type' => 'video', 'resource_id' => $video->id])->assertOk();
            $completion = ActivityCompletion::where('user_id', $this->student->id)->where('type', 'video')->where('resource_id', $video->id)->sole();
            $this->assertSame('2026-10-04T15:45:00.000000Z', $completion->completed_at->toISOString());
            $this->travelTo(CarbonImmutable::parse('2026-10-05T01:45:00+07:00'));
            $this->postJson($this->base.'/completions', ['type' => 'video', 'resource_id' => $video->id])->assertOk();
            $this->assertSame('2026-10-04T15:45:00.000000Z', $completion->fresh()->completed_at->toISOString());
            $this->assertSame(1, ActivityCompletion::where('user_id', $this->student->id)->where('type', 'video')->where('resource_id', $video->id)->count());
        } finally {
            $this->travelBack();
        }
    }

    public function test_model_snapshots_are_hidden_and_immutable(): void
    {
        $this->audio();
        $attempt = LearningAttempt::findOrFail($this->start('audio')['id']);
        foreach (['content_snapshot', 'grading_snapshot', 'result_snapshot', 'answers'] as $key) {
            $this->assertArrayNotHasKey($key, $attempt->toArray());
        }
        $this->expectException(\LogicException::class);
        $attempt->update(['content_snapshot' => []]);
    }
}
