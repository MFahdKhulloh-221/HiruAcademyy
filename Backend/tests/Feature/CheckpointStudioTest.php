<?php

namespace Tests\Feature;

use App\Models\CheckpointPackage;
use App\Models\Program;
use App\Models\User;
use App\Services\CheckpointPackageService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CheckpointStudioTest extends TestCase
{
    use DatabaseTransactions;

    public function test_admin_studio_student_submit_review_and_domain_isolation(): void
    {
        $this->assertTrue(app()->environment('testing'));
        $this->assertSame('hiru_academy_test', DB::connection()->getDatabaseName());
        $this->assertSame('hiru_backend_test_gamification_final_20261008', DB::selectOne('SELECT current_schema() AS name')->name);
        $program = Program::firstOrCreate(['code' => 'n5'], ['slug' => 'n5', 'name' => 'JLPT N5', 'family' => 'jlpt', 'cumulative_rank' => 5, 'status' => 'active', 'sort_order' => 2]);
        $users = [];
        foreach (['admin', 'student', 'student'] as $role) {
            $user = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
            $user->forceFill(['role' => $role, 'account_status' => 'active'])->save();
            $users[] = $user;
        }
        [$admin, $student, $stranger] = $users;
        $originalCounts = [DB::table('try_outs')->count(), DB::table('try_out_questions')->count(), DB::table('try_out_attempts')->count()];
        $this->actingAs($admin);
        $base = '/api/admin/checkpoint-packages';
        $id = $this->postJson($base, ['program_id' => $program->id, 'title' => 'Checkpoint HTTP', 'access_type' => 'free', 'max_score' => 4])->assertCreated()->json('data.id');
        $detail = $this->getJson($base.'/'.$id)->assertOk()->json('data');
        $questions = [];
        foreach (array_keys(CheckpointPackageService::SESSIONS) as $session) {
            $questions[] = ['id' => 'new-'.$session, 'content' => ['session' => $session, 'question' => '<strong>Question</strong>', 'options' => ['A' => 'One', 'B' => 'Two', 'C' => 'Three', 'D' => 'Four'], 'correct_option' => 'B', 'point_value' => 1, 'status' => 'published', 'reading_passage' => $session === 'reading' ? '<p>Reading</p>' : null, 'audio_url' => $session === 'audio' ? 'https://example.test/audio.mp3' : null]];
        }
        $body = ['revision' => $detail['studio_revision'], 'settings' => ['status' => 'published', 'session_passing_scores' => array_fill_keys(array_keys(CheckpointPackageService::SESSIONS), 1)], 'passages' => [], 'questions' => $questions, 'deleted_question_ids' => [], 'deleted_passage_ids' => []];
        $this->putJson($base.'/'.$id.'/studio', $body)->assertOk()->assertJsonCount(4, 'data.questions');
        $this->putJson($base.'/'.$id.'/studio', $body)->assertConflict();
        $this->actingAs($student);
        $base = '/api/student/checkpoint-packages/'.$id;
        $this->getJson($base.'?membership=sensei')->assertForbidden();
        $this->postJson($base.'/attempts?membership=sensei')->assertUnprocessable();
        $this->postJson($base.'/attempts')->assertForbidden();
        DB::table('program_offers')->insertOrIgnore(['program_id' => $program->id, 'plan_code' => 'sensei', 'duration_months' => 1, 'status' => 'inactive']);
        DB::table('access_grants')->insert(['user_id' => $student->id, 'program_id' => $program->id, 'plan_code' => 'sensei', 'starts_at' => now()->subDay(), 'ends_at' => now()->addDay(), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
        $this->getJson($base)->assertOk()->assertJsonPath('data.title', 'Checkpoint HTTP');
        $attempt = $this->postJson($base.'/attempts')->assertCreated()->json('data');
        $this->assertArrayNotHasKey('correct_option', $attempt['questions'][0]);
        $path = $base.'/attempts/'.$attempt['id'];
        $this->actingAs($stranger)->getJson($path)->assertNotFound();
        $this->actingAs($student);
        $answers = array_fill_keys(array_column($attempt['questions'], 'id'), 'B');
        $this->putJson($path.'/answers', ['revision' => 0, 'answers' => $answers])->assertOk()->assertJsonPath('data.revision', 1);
        $this->postJson($path.'/submit', ['revision' => 1])->assertOk()->assertJsonPath('data.result.earned', 4)->assertJsonPath('data.result.overall_pass', true);
        $this->postJson($path.'/submit', ['revision' => 1])->assertOk()->assertJsonPath('data.revision', 2);
        $this->getJson($path.'/review')->assertOk()->assertJsonPath('data.questions.0.correct_option', 'B');
        $this->getJson($base.'/history')->assertOk()->assertJsonPath('data.best_score', 4);
        $this->assertSame($originalCounts, [DB::table('try_outs')->count(), DB::table('try_out_questions')->count(), DB::table('try_out_attempts')->count()]);
        $fresh = $this->postJson($base.'/attempts')->assertCreated()->json('data');
        $this->postJson($base.'/attempts/'.$fresh['id'].'/abandon')->assertNoContent();
        $this->putJson($base.'/attempts/'.$fresh['id'].'/answers', ['revision' => 0, 'answers' => []])->assertConflict();
        $this->assertSame('published', CheckpointPackage::findOrFail($id)->status);
    }
}
