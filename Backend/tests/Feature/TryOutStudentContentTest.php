<?php

namespace Tests\Feature;

use App\Models\TryOut;
use App\Models\TryOutAttempt;
use App\Models\User;
use App\Services\CheckpointPackageService;
use App\Services\TryOutAttemptService;
use App\Services\TryOutService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpKernel\Exception\HttpException;

// Run with --filter test_student_content_ to exclude inherited Batch B grammar tests.
class TryOutStudentContentTest extends TryOutGrammarPassageTest
{
    protected function setUp(): void
    {
        parent::setUp();
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('role');
            $table->string('account_status');
        });
        Schema::create('gamification_days', function (Blueprint $table) {
            $table->id();
            $table->integer('user_id');
            $table->date('activity_on');
            $table->integer('xp');
            $table->unique(['user_id', 'activity_on']);
        });
        Schema::create('gamification_rewards', function (Blueprint $table) {
            $table->id();
            $table->integer('user_id');
            $table->string('reward_key')->unique();
            $table->date('activity_on');
            $table->integer('xp');
            $table->timestamp('created_at');
        });
        DB::table('users')->insert([
            ['id' => 1, 'role' => 'student', 'account_status' => 'active'],
            ['id' => 2, 'role' => 'student', 'account_status' => 'active'],
        ]);
        $this->actingAs(User::findOrFail(1));
    }

    private function fixture(bool $images = false): TryOut
    {
        if ($images) {
            foreach (['try_out_questions', 'try_out_passages'] as $name) {
                Schema::table($name, function (Blueprint $table) {
                    $table->text('image')->nullable();
                    $table->text('image_alt')->nullable();
                    $table->string('image_position')->nullable();
                });
            }
        }
        $service = app(TryOutService::class);
        $parent = TryOut::create(['program_id' => 1, 'title' => 'Student content', 'duration_minutes' => 10]);
        $media = $images ? ['image' => 'https://example.test/original.png', 'image_alt' => 'Original diagram', 'image_position' => 'after'] : [];
        $questions = [];
        foreach (['grammar', 'grammar', 'grammar', 'grammar', 'vocabulary_kanji', 'reading', 'audio'] as $index => $session) {
            $content = [
                'session' => $session, 'question' => 'Original question '.$index,
                'options' => ['A' => 'One', 'B' => 'Two', 'C' => 'Three', 'D' => 'Four'],
                'correct_option' => 'A', 'explanation' => 'Original explanation', 'point_value' => 1,
                'status' => 'published', 'sort_order' => $index,
            ] + $media;
            if ($index < 3) {
                $content['passage_id'] = $index < 2 ? 'group-one' : 'group-two';
            }
            if ($session === 'reading') {
                $content['reading_passage'] = 'Original inline reading';
            }
            if ($session === 'audio') {
                $content['audio_url'] = 'https://example.test/original.mp3';
            }
            $questions[] = ['id' => 'new-'.$index, 'content' => $content];
        }
        $service->saveStudio($parent, [
            'revision' => $service->studioRevision($parent),
            'settings' => ['title' => $parent->title, 'max_score' => 7, 'status' => 'published'],
            'passages' => [
                ['id' => 'group-one', 'title' => 'First group', 'body' => '<p>Original first body</p>'] + $media,
                ['id' => 'group-two', 'title' => 'Second group', 'body' => '<p>Original second body</p>'] + $media,
            ],
            'questions' => $questions, 'deleted_question_ids' => [], 'deleted_passage_ids' => [],
        ]);

        return $parent->fresh();
    }

    private function startAttempt(TryOut $parent): array
    {
        return $this->postJson('/api/student/try-outs/'.$parent->id.'/attempts', [])
            ->assertCreated()->json('data');
    }

    private function assertSafe(array $questions): void
    {
        foreach ($questions as $question) {
            foreach (['correct_option', 'explanation', 'point_value', 'grading_snapshot', 'secret'] as $key) {
                $this->assertArrayNotHasKey($key, $question);
                if (isset($question['passage'])) {
                    $this->assertArrayNotHasKey($key, $question['passage']);
                }
            }
            $this->assertSame(['A', 'B', 'C', 'D'], array_keys($question['options']));
        }
    }

    public function test_student_content_groups_snapshot_and_active_whitelists_without_image_schema(): void
    {
        $parent = $this->fixture();
        $data = $this->startAttempt($parent);
        $grammar = array_values(array_filter($data['questions'], fn ($q) => $q['session'] === 'grammar'));
        $this->assertCount(4, $grammar);
        $this->assertSame($grammar[0]['passage'], $grammar[1]['passage']);
        $this->assertNotSame($grammar[0]['passage']['id'], $grammar[2]['passage']['id']);
        $this->assertSame('<p>Original second body</p>', $grammar[2]['passage']['body']);
        $this->assertArrayNotHasKey('passage', $grammar[3]);
        $this->assertArrayNotHasKey('image', $grammar[0]);
        $this->assertArrayNotHasKey('image', $grammar[0]['passage']);
        $attempt = TryOutAttempt::findOrFail($data['id']);
        $original = $attempt->getAttributes();
        $parent->questions()->update(['question' => 'Admin changed question', 'correct_option' => 'B', 'explanation' => 'Admin changed explanation']);
        DB::table('try_out_passages')->update(['body' => 'Admin changed body']);
        $this->assertSame($original, $attempt->fresh()->getAttributes());
        $this->assertSame($data['questions'], app(TryOutAttemptService::class)->payload($attempt->fresh())['questions']);
        $grading = $attempt->grading_snapshot;
        foreach ($grading['passages'] as &$passage) {
            $passage += ['correct_option' => 'D', 'explanation' => 'Secret', 'secret' => 'Secret'];
        }
        unset($passage);
        $attempt->grading_snapshot = $grading;
        $snapshot = $attempt->content_snapshot;
        foreach ($snapshot as &$question) {
            $question += ['correct_option' => 'D', 'explanation' => 'Secret', 'secret' => 'Secret'];
            $question['options']['secret'] = 'Secret';
        }
        unset($question);
        $attempt->content_snapshot = $snapshot;
        $this->assertSafe(app(TryOutAttemptService::class)->payload($attempt)['questions']);
        $this->getJson('/api/student/try-outs/'.$parent->id.'/attempts/'.$attempt->id.'/review')->assertForbidden();
        try {
            app(TryOutAttemptService::class)->payload($attempt, true);
            $this->fail('Active review misuse must be rejected.');
        } catch (HttpException $error) {
            $this->assertSame(403, $error->getStatusCode());
        }
        $this->assertFalse(app(TryOutService::class)->builderCapabilities()['images']);
        $this->assertFalse(app(CheckpointPackageService::class)->builderCapabilities()['images']);
    }

    public function test_student_content_images_historical_review_owner_and_submit_replay(): void
    {
        $parent = $this->fixture(true);
        $data = $this->startAttempt($parent);
        $base = '/api/student/try-outs/'.$parent->id.'/attempts/'.$data['id'];
        $grammar = array_values(array_filter($data['questions'], fn ($q) => $q['session'] === 'grammar'));
        foreach ([$grammar[0], $grammar[0]['passage']] as $item) {
            $this->assertSame('https://example.test/original.png', $item['image']);
            $this->assertSame($item['image'], $item['image_resolved_url']);
            $this->assertSame('Original diagram', $item['image_alt']);
            $this->assertSame('after', $item['image_position']);
        }
        $this->assertSafe($data['questions']);
        $answers = [$grammar[0]['id'] => 'A', $grammar[1]['id'] => 'B'];
        $this->putJson($base.'/answers', ['answers' => $answers, 'revision' => 0])->assertOk();
        $parent->questions()->update(['question' => 'Edited', 'correct_option' => 'B', 'explanation' => 'Edited', 'image' => null]);
        DB::table('try_out_passages')->update(['body' => 'Edited', 'image' => null]);
        $submitted = $this->postJson($base.'/submit', ['revision' => 1])->assertOk()->json('data');
        $this->assertSame(1, $submitted['result']['correct']);
        $this->assertSame(1, $submitted['result']['wrong']);
        $this->assertSame(5, $submitted['result']['unanswered']);
        $this->assertSafe($submitted['questions']);
        $review = $this->getJson($base.'/review')->assertOk()->json('data');
        $this->assertEquals($answers, $review['answers']);
        $this->assertSame($data['questions'][0]['question'], $review['questions'][0]['question']);
        foreach ($review['questions'] as $index => $question) {
            $this->assertSame($data['questions'][$index], array_intersect_key($question, $data['questions'][$index]));
            $this->assertSame('A', $question['correct_option']);
            $this->assertSame('Original explanation', $question['explanation']);
            $this->assertSame(1, $question['point_value']);
        }
        $reviewGrammar = array_values(array_filter($review['questions'], fn ($q) => $q['session'] === 'grammar'));
        $this->assertSame($grammar[0]['passage'], $reviewGrammar[0]['passage']);
        $this->assertSame($grammar[0]['image'], $reviewGrammar[0]['image']);
        $incorrect = $this->getJson($base.'/review?incorrect_only=1')->assertOk()->json('data.questions');
        $this->assertCount(6, $incorrect);
        $this->assertNotContains($grammar[0]['id'], array_column($incorrect, 'id'));
        $attempt = TryOutAttempt::findOrFail($data['id']);
        $before = $attempt->getAttributes();
        $this->postJson($base.'/submit', ['revision' => 0])->assertOk()->assertJsonPath('data.revision', $submitted['revision']);
        $this->assertSame($before, $attempt->fresh()->getAttributes());
        $this->assertSame(1, DB::table('gamification_rewards')->count());
        $this->actingAs(User::findOrFail(2));
        foreach ([$base, $base.'/review'] as $url) {
            $this->getJson($url)->assertNotFound();
        }
        $this->postJson($base.'/submit', ['revision' => 0])->assertNotFound();
        $this->assertFalse(app(CheckpointPackageService::class)->builderCapabilities()['images']);
    }

    public function test_student_content_timer_refresh_stale_autosave_and_expiry_replay(): void
    {
        $this->travelTo(now()->startOfSecond());
        $parent = $this->fixture();
        $data = $this->startAttempt($parent);
        $base = '/api/student/try-outs/'.$parent->id.'/attempts/'.$data['id'];
        $id = $data['questions'][0]['id'];
        $this->travel(1)->minutes();
        $this->getJson($base)->assertOk()->assertJsonPath('data.expires_at', $data['expires_at'])->assertJsonPath('data.revision', 0);
        $this->putJson($base.'/answers', ['answers' => [$id => 'A'], 'revision' => 0])->assertOk()->assertJsonPath('data.revision', 1);
        $this->putJson($base.'/answers', ['answers' => [$id => 'B'], 'revision' => 0])->assertStatus(409);
        $this->getJson($base)->assertOk()->assertJsonPath('data.answers.'.$id, 'A');
        $this->travel(9)->minutes();
        $expired = $this->getJson($base)->assertOk()->assertJsonPath('data.status', 'completed')->json('data');
        $this->assertSame(1, $expired['result']['correct']);
        $this->assertSafe($expired['questions']);
        $this->postJson($base.'/submit', ['revision' => 0])->assertOk()->assertJsonPath('data.revision', $expired['revision']);
        $this->putJson($base.'/answers', ['answers' => [$id => 'B'], 'revision' => 1])->assertStatus(409);
        $this->getJson($base)->assertOk()->assertJsonPath('data.answers.'.$id, 'A')->assertJsonPath('data.completed_at', $expired['completed_at']);
        $this->assertSame(1, DB::table('gamification_rewards')->count());
        $this->travelBack();
    }
}
