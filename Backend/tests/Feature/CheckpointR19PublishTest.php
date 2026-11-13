<?php

namespace Tests\Feature;

use App\Models\CheckpointPackage;
use App\Models\Program;
use App\Models\User;
use App\Services\CheckpointPackageService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CheckpointR19PublishTest extends TestCase
{
    use DatabaseTransactions;

    private int $programId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertTrue(app()->environment('testing'));
        $this->assertSame('pgsql', DB::connection()->getDriverName());
        $this->assertSame('hiru_academy_test', DB::connection()->getDatabaseName());
        $this->assertSame('hiru_backend_test_gamification_final_20261008', DB::selectOne('SELECT current_schema() AS name')->name);
        $this->programId = Program::firstOrCreate(['code' => 'n5'], ['slug' => 'n5', 'name' => 'JLPT N5', 'family' => 'jlpt', 'cumulative_rank' => 5, 'status' => 'active', 'sort_order' => 2])->id;
        $admin = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $admin->forceFill(['role' => 'admin', 'account_status' => 'active'])->save();
        $this->actingAs($admin);
    }

    public function test_checkpoint_publishes_without_audio_and_with_valid_audio(): void
    {
        foreach ([false, true] as $withAudio) {
            [$url, $body] = $this->studio($withAudio);
            $this->putJson($url, $body)->assertOk()
                ->assertJsonPath('data.status', 'published')
                ->assertJsonPath('data.max_score', $withAudio ? 4 : 3)
                ->assertJsonPath('data.session_passing_scores.audio', $withAudio ? 1 : 0)
                ->assertJsonCount($withAudio ? 4 : 3, 'data.questions');
            $package = CheckpointPackage::findOrFail((int) basename(dirname($url)));
            $this->assertSame($withAudio ? 1 : 0, $package->questions()->where('session', 'audio')->count());
            $this->assertSame($withAudio ? 4 : 3, (int) $package->questions()->sum('point_value'));
        }
    }

    public function test_each_non_audio_session_remains_required(): void
    {
        foreach (['vocabulary_kanji', 'grammar', 'reading'] as $missing) {
            [$url, $body] = $this->studio(true);
            $body['questions'] = array_values(array_filter($body['questions'], fn ($question) => $question['content']['session'] !== $missing));
            $body['settings']['max_score'] = 3;
            $body['settings']['session_passing_scores'][$missing] = 0;
            $this->putJson($url, $body)->assertUnprocessable()->assertJsonValidationErrors('status');
            $this->assertRolledBack($url);
        }
    }

    public function test_published_audio_requires_url_and_draft_audio_is_not_silently_published(): void
    {
        [$url, $body] = $this->studio(true);
        $audio = array_key_last($body['questions']);
        $body['questions'][$audio]['content']['audio_url'] = null;
        $this->putJson($url, $body)->assertUnprocessable()->assertJsonValidationErrors('audio_url');
        $this->assertRolledBack($url);

        $body['questions'][$audio]['content']['status'] = 'draft';
        $body['settings']['max_score'] = 3;
        $body['settings']['session_passing_scores']['audio'] = 0;
        $this->putJson($url, $body)->assertUnprocessable()->assertJsonValidationErrors('status');
        $this->assertRolledBack($url);

        $body['settings']['status'] = 'draft';
        $this->putJson($url, $body)->assertOk()->assertJsonPath('data.status', 'draft');
        $package = CheckpointPackage::findOrFail((int) basename(dirname($url)));
        $this->assertSame('draft', $package->questions()->where('session', 'audio')->sole()->status);
        $this->assertSame(3, $package->questions()->where('status', 'published')->count());
    }

    public function test_invalid_points_max_score_and_unachievable_thresholds_are_rejected(): void
    {
        foreach ([null, 0, -1, 181, 1.5] as $points) {
            [$url, $body] = $this->studio(false);
            $body['questions'][0]['content']['point_value'] = $points;
            $this->putJson($url, $body)->assertUnprocessable()->assertJsonValidationErrors('point_value');
            $this->assertRolledBack($url);
        }
        foreach ([0, -1, 1.5] as $maximum) {
            [$url, $body] = $this->studio(false);
            $body['settings']['max_score'] = $maximum;
            $this->putJson($url, $body)->assertUnprocessable()->assertJsonValidationErrors('max_score');
            $this->assertRolledBack($url);
        }
        [$url, $body] = $this->studio(false);
        $body['settings']['max_score'] = 4;
        $this->putJson($url, $body)->assertUnprocessable()->assertJsonValidationErrors('status');
        $this->assertRolledBack($url);
        $body['settings']['max_score'] = 3;
        foreach (['audio', 'reading'] as $session) {
            $invalid = $body;
            $invalid['settings']['session_passing_scores'][$session] = $session === 'audio' ? 1 : 2;
            $this->putJson($url, $invalid)->assertUnprocessable()->assertJsonValidationErrors('session_passing_scores');
            $this->assertRolledBack($url);
        }
    }

    public function test_try_out_still_requires_audio_and_accepts_all_four_sessions(): void
    {
        [$url, $body] = $this->studio(false, '/api/admin/try-outs');
        $this->putJson($url, $body)->assertUnprocessable()->assertJsonValidationErrors('status');
        $this->assertDatabaseHas('try_outs', ['id' => (int) basename(dirname($url)), 'status' => 'draft']);
        $this->assertDatabaseMissing('try_out_questions', ['try_out_id' => (int) basename(dirname($url))]);
        [$url, $body] = $this->studio(true, '/api/admin/try-outs');
        $this->putJson($url, $body)->assertOk()->assertJsonPath('data.status', 'published')->assertJsonCount(4, 'data.questions');
    }

    private function studio(bool $withAudio, string $base = '/api/admin/checkpoint-packages'): array
    {
        $id = $this->postJson($base, ['program_id' => $this->programId, 'title' => 'R19 publish regression', 'access_type' => 'free', 'max_score' => $withAudio ? 4 : 3])->assertCreated()->json('data.id');
        $detail = $this->getJson($base.'/'.$id)->assertOk()->json('data');
        $questions = [];
        $thresholds = [];
        foreach (array_keys(CheckpointPackageService::SESSIONS) as $session) {
            $thresholds[$session] = $session === 'audio' && ! $withAudio ? 0 : 1;
            if ($session === 'audio' && ! $withAudio) {
                continue;
            }
            $questions[] = ['id' => 'new-'.$session, 'content' => ['session' => $session, 'question' => '<strong>Question</strong>', 'options' => ['A' => 'One', 'B' => 'Two', 'C' => 'Three', 'D' => 'Four'], 'correct_option' => 'B', 'point_value' => 1, 'status' => 'published', 'reading_passage' => $session === 'reading' ? '<p>Reading</p>' : null, 'audio_url' => $session === 'audio' ? 'https://example.test/audio.mp3' : null]];
        }

        return [$base.'/'.$id.'/studio', ['revision' => $detail['studio_revision'], 'settings' => ['status' => 'published', 'max_score' => $withAudio ? 4 : 3, 'session_passing_scores' => $thresholds], 'passages' => [], 'questions' => $questions, 'deleted_question_ids' => [], 'deleted_passage_ids' => []]];
    }

    private function assertRolledBack(string $url): void
    {
        $package = CheckpointPackage::findOrFail((int) basename(dirname($url)));
        $this->assertSame('draft', $package->status);
        $this->assertSame(0, $package->questions()->count());
    }
}
