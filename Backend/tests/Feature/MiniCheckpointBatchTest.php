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
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class MiniCheckpointBatchTest extends TestCase
{
    use DatabaseTransactions;

    private Chapter $chapter;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $program = Program::firstOrCreate(['code' => 'n5'], [
            'slug' => 'n5', 'name' => 'N5', 'family' => 'jlpt', 'status' => 'active',
            'cumulative_rank' => 1, 'sort_order' => 0,
        ]);
        $chapterNumber = (int) Chapter::where('program_id', $program->id)->max('chapter_number') + 1;
        $this->chapter = Chapter::create([
            'program_id' => $program->id, 'chapter_number' => $chapterNumber, 'title' => 'Mini batch fixture',
            'status' => 'published', 'mini_checkpoint_duration_minutes' => 5, 'mini_checkpoint_passing_score' => 70,
        ]);
        $this->admin = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $this->admin->forceFill(['role' => 'admin', 'account_status' => 'active'])->save();
        $this->actingAs($this->admin);
    }

    private function fields(array $overrides = []): array
    {
        return array_replace([
            'question' => 'Question', 'options' => ['A' => 'One', 'B' => 'Two', 'C' => 'Three', 'D' => 'Four'],
            'correct_option' => 'B', 'explanation' => 'Private explanation', 'category' => 'reading',
            'instruction' => 'Read this', 'image_url' => null, 'image_alt' => null, 'image_position' => 'before',
            'audio_url' => null, 'passage' => ['id' => 'shared', 'title' => 'Title', 'body' => 'Body'],
            'sort_order' => 0, 'status' => 'draft',
        ], $overrides);
    }

    private function question(array $overrides = []): MiniCheckpointQuestion
    {
        return MiniCheckpointQuestion::create([
            ...$this->fields($overrides), 'chapter_id' => $this->chapter->id,
            'session' => 1, 'part' => 1, 'duration_minutes' => 5, 'passing_score' => 70,
        ])->fresh();
    }

    private function snapshot(): array
    {
        return $this->chapter->miniCheckpointQuestions()->get()->map->only(['id', 'updated_at'])->all();
    }

    public function test_full_fields_drafts_publication_client_ids_and_same_second_conflicts(): void
    {
        $this->freezeTime();
        $draft = $this->question();
        $published = $this->question(['status' => 'published']);
        $snapshot = $this->snapshot();
        $fields = $this->fields([
            'question' => 'Edited question', 'options' => ['A' => 'Alpha', 'B' => 'Beta', 'C' => 'Gamma', 'D' => 'Delta'],
            'correct_option' => 'D', 'explanation' => 'Edited explanation', 'instruction' => 'Edited instruction',
            'image_url' => 'https://media.example.test/image.png', 'image_alt' => 'Example image',
            'image_position' => 'after', 'audio_url' => 'https://media.example.test/audio.mp3',
            'passage' => ['id' => 'shared', 'title' => 'Edited title', 'body' => 'Edited body'], 'sort_order' => 4,
        ]);
        $questions = [
            ['id' => $draft->id, 'client_id' => 'draft', ...$fields],
            ['id' => $published->id, 'client_id' => 'published', ...$fields, 'status' => 'published'],
            ['client_id' => 'new', ...$this->fields(['sort_order' => 8])],
        ];
        $response = $this->postJson('/api/admin/mini-checkpoint-questions/batch', [
            'chapter_id' => $this->chapter->id, 'expected_questions' => $snapshot, 'questions' => $questions,
        ])->assertOk()->assertJsonCount(3, 'data');
        foreach ($questions as $index => $question) {
            foreach ($question as $field => $value) {
                $response->assertJsonPath("data.{$index}.{$field}", $value);
            }
            $stored = MiniCheckpointQuestion::findOrFail($response->json("data.{$index}.id"));
            foreach (array_diff_key($question, ['id' => true, 'client_id' => true]) as $field => $value) {
                $this->assertSame($value, $stored->{$field});
            }
        }
        $this->assertNotSame($snapshot, $this->snapshot());
        $before = $this->chapter->miniCheckpointQuestions()->get()->toArray();
        $this->postJson('/api/admin/mini-checkpoint-questions/batch', [
            'chapter_id' => $this->chapter->id, 'expected_questions' => $snapshot, 'questions' => [],
        ])->assertConflict();
        $this->assertSame($before, $this->chapter->miniCheckpointQuestions()->get()->toArray());

        // Stage published rows without editing them; their token must never go backwards.
        $snapshot = $this->snapshot();
        $this->postJson('/api/admin/mini-checkpoint-questions/batch', [
            'chapter_id' => $this->chapter->id, 'expected_questions' => $snapshot,
            'questions' => array_map(fn ($row) => ['id' => $row['id'], 'client_id' => 'keep-'.$row['id']], $snapshot),
        ])->assertOk();
        $this->assertSame('draft', $draft->fresh()->status);
        $this->assertSame('published', $published->fresh()->status);
        $this->postJson('/api/admin/mini-checkpoint-questions/batch', [
            'chapter_id' => $this->chapter->id, 'expected_questions' => $snapshot, 'questions' => [],
        ])->assertConflict();
        $snapshot = $this->snapshot();
        $this->postJson('/api/admin/mini-checkpoint-questions/batch', [
            'chapter_id' => $this->chapter->id, 'expected_questions' => $snapshot, 'questions' => [],
        ])->assertOk()->assertJsonCount(0, 'data');
        $this->postJson('/api/admin/mini-checkpoint-questions/batch', [
            'chapter_id' => $this->chapter->id, 'expected_questions' => $snapshot, 'questions' => [],
        ])->assertConflict();
    }

    public function test_chapter_readiness_reports_both_missing_settings_and_published_question_errors(): void
    {
        $this->chapter->update(['mini_checkpoint_duration_minutes' => null, 'mini_checkpoint_passing_score' => null]);
        $errors = $this->getJson('/api/admin/chapters/'.$this->chapter->id)->assertOk()
            ->json('data.mini_checkpoint_readiness_errors');
        $this->assertArrayHasKey('duration_minutes', $errors);
        $this->assertArrayHasKey('passing_score', $errors);
        $this->assertArrayHasKey('questions', $errors);
        $question = $this->question(['category' => 'audio', 'status' => 'published']);
        $this->getJson('/api/admin/chapters/'.$this->chapter->id)->assertOk()
            ->assertJsonStructure(['data' => ['mini_checkpoint_readiness_errors' => [
                'duration_minutes', 'passing_score', 'questions.'.$question->id.'.audio_url',
            ]]]);
    }

    public function test_final_publication_failure_rolls_back_every_field_deletion_and_creation(): void
    {
        $first = $this->question(['status' => 'published']);
        $second = $this->question(['status' => 'published']);
        $this->question(['status' => 'draft']);
        $before = $this->chapter->miniCheckpointQuestions()->get()->toArray();
        $this->postJson('/api/admin/mini-checkpoint-questions/batch', [
            'chapter_id' => $this->chapter->id, 'expected_questions' => $this->snapshot(),
            'questions' => [
                ['id' => $first->id, 'client_id' => 'first', ...$this->fields([
                    'question' => 'Changed', 'correct_option' => 'C', 'explanation' => 'Changed',
                    'instruction' => 'Changed', 'image_position' => 'after', 'sort_order' => 6,
                    'passage' => ['id' => 'shared', 'title' => 'Different', 'body' => 'Different'], 'status' => 'published',
                ])],
                ['id' => $second->id, 'client_id' => 'second', 'status' => 'published'],
                ['client_id' => 'new', ...$this->fields()],
            ],
        ])->assertUnprocessable();
        $this->assertSame($before, $this->chapter->miniCheckpointQuestions()->get()->toArray());
    }

    public function test_retry_uses_current_published_order_while_old_attempt_retains_snapshots(): void
    {
        $student = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $student->forceFill(['role' => 'student', 'account_status' => 'active'])->save();
        AccessGrant::create([
            'user_id' => $student->id, 'program_id' => $this->chapter->program_id, 'plan_code' => 'sensei',
            'status' => 'active', 'starts_at' => now()->subDay(), 'ends_at' => now()->addDay(),
        ]);
        $video = VideoLesson::create(['chapter_id' => $this->chapter->id, 'title' => 'Video', 'status' => 'published']);
        $module = LearningModule::create(['chapter_id' => $this->chapter->id, 'title' => 'Module', 'module_type' => 'general', 'status' => 'published']);
        $flashcard = Flashcard::create(['chapter_id' => $this->chapter->id, 'japanese' => '猫', 'reading' => 'ねこ', 'meaning' => 'Cat', 'status' => 'published']);
        $audio = AudioQuestion::create(['chapter_id' => $this->chapter->id, 'question' => 'Audio', 'options' => $this->fields()['options'], 'correct_option' => 'B', 'status' => 'published']);
        $passage = ReadingPassage::create(['chapter_id' => $this->chapter->id, 'title' => 'Reading', 'body' => 'Body', 'status' => 'published']);
        $reading = ReadingQuestion::create(['reading_passage_id' => $passage->id, 'question' => 'Reading', 'options' => $this->fields()['options'], 'correct_option' => 'B', 'status' => 'published']);
        foreach (['video' => $video, 'module' => $module, 'flashcard' => $flashcard, 'audio' => $audio, 'reading' => $reading] as $type => $resource) {
            ActivityCompletion::create(['user_id' => $student->id, 'chapter_id' => $this->chapter->id, 'type' => $type, 'resource_id' => $resource->id, 'completed_at' => now()]);
        }
        $first = $this->question(['status' => 'published', 'sort_order' => 5]);
        $second = $this->question(['status' => 'published', 'sort_order' => 1]);
        $draft = $this->question();
        $base = '/api/student/programs/'.$this->chapter->program_id.'/chapters/'.$this->chapter->id;
        $this->actingAs($student);
        $old = $this->postJson($base.'/attempts', ['kind' => 'mini', 'session' => 1, 'part' => 1])->assertCreated()->json('data');
        $this->assertSame([$second->id, $first->id], array_column($old['questions'], 'id'));
        $attempt = LearningAttempt::findOrFail($old['id']);
        $content = $attempt->content_snapshot;
        $grading = $attempt->grading_snapshot;
        $this->actingAs($this->admin)->postJson('/api/admin/mini-checkpoint-questions/batch', [
            'chapter_id' => $this->chapter->id, 'expected_questions' => $this->snapshot(),
            'questions' => [
                ['id' => $first->id, 'client_id' => 'first', 'question' => 'Current question', 'correct_option' => 'D', 'sort_order' => 0, 'status' => 'published'],
                ['id' => $second->id, 'client_id' => 'second', 'status' => 'draft'],
                ['id' => $draft->id, 'client_id' => 'draft', 'status' => 'draft'],
                ['client_id' => 'new', ...$this->fields(['status' => 'published', 'sort_order' => 2])],
            ],
        ])->assertOk();
        $this->actingAs($student);
        $retry = $this->postJson($base.'/attempts', ['kind' => 'mini', 'session' => 1, 'part' => 1])->assertCreated()->json('data');
        $this->assertNotSame($old['id'], $retry['id']);
        $this->assertCount(2, $retry['questions']);
        $this->assertSame($first->id, $retry['questions'][0]['id']);
        $this->assertSame('Current question', $retry['questions'][0]['question']);
        $this->assertNotContains($second->id, array_column($retry['questions'], 'id'));
        $this->assertNotContains($draft->id, array_column($retry['questions'], 'id'));
        $this->assertSame($content, $attempt->fresh()->content_snapshot);
        $this->assertSame($grading, $attempt->fresh()->grading_snapshot);
        $this->chapter->update(['mini_checkpoint_duration_minutes' => null, 'mini_checkpoint_passing_score' => null]);
        $this->getJson($base.'/attempts/'.$old['id'])->assertOk()->assertJsonPath('data.questions', $old['questions'])
            ->assertJsonPath('data.expires_at', $old['expires_at']);
        $this->postJson($base.'/attempts', ['kind' => 'mini', 'session' => 1, 'part' => 1])->assertUnprocessable();
        $this->postJson($base.'/attempts/'.$old['id'].'/submit', [
            'answers' => [$first->id => 'B', $second->id => 'B'], 'revision' => 0,
        ])->assertOk()->assertJsonPath('data.result.correct', 2)->assertJsonPath('data.result.passing_score', 70);
        $review = $this->getJson($base.'/attempts/'.$old['id'].'/review')->assertOk()->json('data.questions');
        foreach ($review as $index => $question) {
            foreach ($old['questions'][$index] as $field => $value) {
                $this->assertSame($value, $question[$field]);
            }
            $this->assertSame($grading[$question['id']]['correct_option'], $question['correct_option']);
            $this->assertSame($grading[$question['id']]['explanation'], $question['explanation']);
        }
        $this->chapter->update(['mini_checkpoint_duration_minutes' => 5, 'mini_checkpoint_passing_score' => 70]);
        $afterCompletion = $this->postJson($base.'/attempts', [
            'kind' => 'mini', 'session' => 1, 'part' => 1,
        ])->assertCreated()->assertJsonPath('data.status', 'in_progress')->json('data');
        $this->assertNotSame($old['id'], $afterCompletion['id']);
        $this->assertNotSame($retry['id'], $afterCompletion['id']);
        $this->assertSame($retry['questions'], $afterCompletion['questions']);
        $this->assertSame($content, $attempt->fresh()->content_snapshot);
        $this->assertSame($grading, $attempt->fresh()->grading_snapshot);
        foreach ($afterCompletion['questions'] as $question) {
            $this->assertArrayNotHasKey('correct_option', $question);
            $this->assertArrayNotHasKey('explanation', $question);
        }
    }
}
