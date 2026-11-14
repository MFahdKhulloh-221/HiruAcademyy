<?php

namespace Tests\Feature;

use App\Models\CheckpointAttempt;
use App\Models\Program;
use App\Models\User;
use App\Services\CheckpointAttemptService;
use App\Services\CheckpointPackageService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CheckpointR19Test extends TestCase
{
    use DatabaseTransactions;

    private function user(string $role = 'student'): User
    {
        $user = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $user->forceFill(['role' => $role, 'account_status' => 'active'])->save();
        return $user;
    }

    private function grant(User $user, string $code, string $plan, array $overrides = []): int
    {
        $program = Program::firstOrCreate(['code' => $code], ['slug' => $code, 'name' => 'R19 '.$code, 'family' => 'jlpt', 'status' => 'active', 'sort_order' => 1]);
        DB::table('program_offers')->insertOrIgnore(['program_id' => $program->id, 'plan_code' => $plan, 'duration_months' => 1, 'status' => 'inactive']);
        return DB::table('access_grants')->insertGetId(array_replace(['user_id' => $user->id, 'program_id' => $program->id, 'plan_code' => $plan, 'starts_at' => now()->subDay(), 'ends_at' => now()->addDay(), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()], $overrides));
    }

    private function package(bool $audio = false): \App\Models\CheckpointPackage
    {
        $program = Program::firstOrCreate(['code' => 'n5'], ['slug' => 'n5', 'name' => 'R19 N5', 'family' => 'jlpt', 'status' => 'active', 'sort_order' => 1]);
        $service = app(CheckpointPackageService::class);
        $package = $service->save(['program_id' => $program->id, 'title' => 'R19 checkpoint', 'access_type' => 'free', 'max_score' => $audio ? 4 : 3,
            'session_passing_scores' => ['vocabulary_kanji' => 1, 'grammar' => 1, 'reading' => 1, 'audio' => $audio ? 1 : 0]]);
        foreach (array_keys($service::SESSIONS) as $session) {
            if ($session === 'audio' && ! $audio) continue;
            $service->saveQuestion($package, ['session' => $session, 'question' => 'Question', 'options' => ['A' => 'One', 'B' => 'Two', 'C' => 'Three', 'D' => 'Four'], 'correct_option' => 'B', 'point_value' => 1, 'status' => 'published', 'audio_url' => $session === 'audio' ? 'https://example.test/audio.mp3' : null]);
        }
        return $service->save(['status' => 'published'], $package);
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('hiru_academy_test', DB::connection()->getDatabaseName());
        $this->assertSame(getenv('HIRU_TEST_SCHEMA') ?: 'hiru_backend_test_gamification_final_20261008', DB::selectOne('SELECT current_schema() AS name')->name);
    }

    public function test_http_authentication_role_and_account_gates(): void
    {
        $package = $this->package();
        $owner = $this->user();
        $this->grant($owner, 'n5', 'sensei');
        $attempt = app(CheckpointAttemptService::class)->start($owner, $package);
        $base = '/api/student/checkpoint-packages/'.$package->id;
        $path = $base.'/attempts/'.$attempt->id;
        $requests = [
            ['GET', '/api/student/checkpoint-packages', []],
            ['GET', $base, []],
            ['POST', $base.'/attempts', []],
            ['GET', $base.'/history', []],
            ['GET', $path, []],
            ['PUT', $path.'/answers', ['answers' => [], 'revision' => 0]],
            ['POST', $path.'/submit', ['revision' => 0]],
            ['POST', $path.'/abandon', []],
            ['GET', $path.'/result', []],
            ['GET', $path.'/review', []],
        ];
        $before = $attempt->fresh()->toArray();
        foreach ($requests as [$method, $uri, $body]) {
            $this->json($method, $uri, $body)->assertUnauthorized();
        }
        $admin = $this->user('admin');
        $inactive = $this->user();
        $inactive->forceFill(['account_status' => 'inactive'])->save();
        foreach ([$admin, $inactive] as $user) {
            foreach ($requests as [$method, $uri, $body]) {
                $this->actingAs($user)->json($method, $uri, $body)
                    ->assertStatus($user->account_status === 'active' ? 403 : 401);
            }
        }
        $this->assertSame($before, $attempt->fresh()->toArray());
        $this->assertSame(1, CheckpointAttempt::where('checkpoint_package_id', $package->id)->count());
    }

    public function test_sensei_only_cumulative_access_and_readonly_history(): void
    {
        $package = $this->package();
        $user = $this->user();
        $base = '/api/student/checkpoint-packages/'.$package->id;
        $this->postJson('/api/auth/login', ['identity' => $user->email, 'password' => 'password'])->assertOk();
        $this->postJson($base.'/attempts')->assertForbidden();
        $lms = $this->grant($user, 'n5', 'lms');
        $this->postJson($base.'/attempts')->assertForbidden();
        $otherLevel = Program::firstOrCreate(['code' => 'n4'], ['slug' => 'n4', 'name' => 'R19 N4', 'family' => 'jlpt', 'status' => 'active', 'sort_order' => 1]);
        $higherPackage = app(CheckpointPackageService::class)->save(['program_id' => $otherLevel->id, 'title' => 'Higher level', 'access_type' => 'free', 'max_score' => 3]);
        $lowerSensei = $this->grant($user, 'n5', 'sensei');
        $this->getJson('/api/student/checkpoint-packages/'.$higherPackage->id)->assertForbidden();
        $this->postJson('/api/student/checkpoint-packages/'.$higherPackage->id.'/attempts')->assertForbidden();
        DB::table('access_grants')->where('id', $lowerSensei)->update(['status' => 'inactive']);
        $sensei = $this->grant($user, 'n4', 'sensei', ['ends_at' => now()->subDay()]);
        $this->postJson($base.'/attempts')->assertForbidden();
        DB::table('access_grants')->where('id', $sensei)->update(['starts_at' => now()->addDay(), 'ends_at' => now()->addDays(2)]);
        $this->postJson($base.'/attempts')->assertForbidden();
        DB::table('access_grants')->where('id', $sensei)->update(['starts_at' => now()->subDay(), 'status' => 'inactive']);
        $this->postJson($base.'/attempts')->assertForbidden();
        DB::table('access_grants')->where('id', $sensei)->update(['status' => 'active']);
        $data = $this->postJson($base.'/attempts')->assertCreated()->json('data');
        $this->assertCount(3, $data['active_sessions']);
        $assertNoKeys = function (array $payload) use (&$assertNoKeys): void {
            foreach ($payload as $key => $value) {
                $this->assertNotContains($key, ['correct_option', 'correct_answer', 'explanation', 'grading_snapshot']);
                if (is_array($value)) $assertNoKeys($value);
            }
        };
        $assertNoKeys($data);
        $path = $base.'/attempts/'.$data['id'];
        $assertNoKeys($this->getJson($base)->assertOk()->json());
        $assertNoKeys($this->getJson($path)->assertOk()->json());
        $this->getJson($path.'/result')->assertForbidden();
        $this->getJson($path.'/review')->assertForbidden();
        $owner = $user;
        $other = $this->user();
        $this->grant($other, 'n4', 'sensei');
        $before = CheckpointAttempt::findOrFail($data['id'])->toArray();
        $this->actingAs($other)->getJson($path)->assertNotFound();
        $this->getJson($path.'/result')->assertNotFound();
        $this->getJson($path.'/review')->assertNotFound();
        $this->putJson($path.'/answers', ['answers' => [], 'revision' => 0])->assertNotFound();
        $this->postJson($path.'/submit', ['revision' => 0])->assertNotFound();
        $this->postJson($path.'/abandon')->assertNotFound();
        $this->assertSame($before, CheckpointAttempt::findOrFail($data['id'])->toArray());
        $this->actingAs($owner);
        $before = CheckpointAttempt::findOrFail($data['id'])->toArray();
        DB::table('access_grants')->where('id', $sensei)->update(['ends_at' => now()->subDay()]);
        $this->getJson($path)->assertForbidden();
        $this->putJson($path.'/answers', ['answers' => [], 'revision' => 0])->assertForbidden();
        $this->postJson($path.'/submit', ['revision' => 0])->assertForbidden();
        $this->assertSame($before, CheckpointAttempt::findOrFail($data['id'])->toArray());
        DB::table('access_grants')->where('id', $sensei)->update(['ends_at' => now()->addDay(), 'status' => 'inactive']);
        $this->getJson($path)->assertForbidden();
        $this->putJson($path.'/answers', ['answers' => [], 'revision' => 0])->assertForbidden();
        $this->postJson($path.'/submit', ['revision' => 0])->assertForbidden();
        $this->assertSame($before, CheckpointAttempt::findOrFail($data['id'])->toArray());
        DB::table('access_grants')->where('id', $sensei)->update(['status' => 'active']);
        $answers = array_fill_keys(array_column($data['questions'], 'id'), 'B');
        $assertNoKeys($this->putJson($path.'/answers', ['answers' => $answers, 'revision' => 0])->assertOk()->json());
        $this->putJson($path.'/answers', ['answers' => [], 'revision' => 0])->assertConflict();
        $result = $this->postJson($path.'/submit', ['revision' => 1])->assertOk()->assertJsonPath('data.result.earned', 3)->assertJsonPath('data.result.overall_pass', true)->assertJsonCount(3, 'data.result.sessions')->json('data');
        $this->postJson($path.'/submit', ['revision' => 1])->assertOk()->assertJsonPath('data.revision', $result['revision']);
        $completed = CheckpointAttempt::findOrFail($data['id'])->toArray();
        DB::table('access_grants')->where('id', $sensei)->update(['status' => 'inactive']);
        $this->getJson($path.'/result')->assertOk()->assertJsonPath('data.result.earned', 3);
        $this->getJson($path.'/review')->assertOk()->assertJsonPath('data.questions.0.correct_option', 'B');
        $this->getJson($base.'/history')->assertOk()->assertJsonPath('data.best_score', 3);
        $this->postJson($path.'/submit', ['revision' => 2])->assertForbidden();
        $this->putJson($path.'/answers', ['answers' => [], 'revision' => 2])->assertForbidden();
        $this->assertSame($completed, CheckpointAttempt::findOrFail($data['id'])->toArray());
        $assertNoKeys($this->getJson($path.'/result')->assertOk()->json());
        $this->actingAs($other)->getJson($path)->assertNotFound();
        $this->getJson($path.'/result')->assertNotFound();
        $this->getJson($path.'/review')->assertNotFound();
        $this->putJson($path.'/answers', ['answers' => [], 'revision' => 2])->assertNotFound();
        $this->postJson($path.'/submit', ['revision' => 2])->assertNotFound();
        $this->assertNotNull($lms);
    }

    public function test_legacy_owner_keeps_readonly_results_but_cannot_resume_or_write(): void
    {
        $package = $this->package();
        $user = $this->user();
        $question = ['id' => 999, 'session' => 'grammar', 'question' => 'Legacy question', 'options' => ['A' => 'One', 'B' => 'Two', 'C' => 'Three', 'D' => 'Four']];
        $grading = ['passing_score' => 60, 'questions' => [999 => ['correct_option' => 'B', 'explanation' => 'Legacy explanation']]];
        $attempt = CheckpointAttempt::create(['user_id' => $user->id, 'checkpoint_package_id' => $package->id, 'status' => 'completed',
            'content_snapshot' => [$question], 'grading_snapshot' => $grading, 'answers' => [999 => 'B'],
            'result_snapshot' => \App\Services\LegacyCheckpointAttemptService::grade([$question], $grading, [999 => 'B']),
            'revision' => 1, 'started_at' => now()->subHour(), 'expires_at' => now()->subMinutes(30), 'submitted_at' => now()->subMinutes(40)]);
        $before = $attempt->fresh()->toArray();
        $path = '/api/student/checkpoint-packages/'.$package->id.'/attempts/'.$attempt->id;
        $this->actingAs($user)->getJson($path.'/result')->assertOk()->assertJsonPath('data.result.earned', 100);
        $this->getJson($path.'/review')->assertOk()->assertJsonPath('data.questions.0.correct_option', 'B');
        $this->getJson('/api/student/checkpoint-packages/'.$package->id.'/history')->assertOk()->assertJsonPath('data.best_score', 100);
        $this->getJson($path)->assertForbidden();
        $this->putJson($path.'/answers', ['revision' => 1, 'answers' => [999 => 'A']])->assertForbidden();
        $this->postJson($path.'/submit', ['revision' => 1])->assertForbidden();
        $this->assertSame($before, $attempt->fresh()->toArray());
    }

    public function test_expiry_manual_submit_collision_is_idempotent_without_audio(): void
    {
        $package = $this->package();
        $user = $this->user();
        $this->grant($user, 'n5', 'sensei');
        $service = app(CheckpointAttemptService::class);
        $attempt = $service->start($user, $package);
        $answers = array_fill_keys(array_column($attempt->content_snapshot, 'id'), 'B');
        $saved = $service->save($user, $package, $attempt, $answers, 0);
        $content = $saved->content_snapshot;
        $grading = $saved->grading_snapshot;
        // Expiry configured at start; never rewrite an existing attempt snapshot.
        $attributes = $saved->only(['user_id', 'checkpoint_package_id', 'status', 'content_snapshot', 'grading_snapshot', 'answers', 'completed_sessions', 'current_session', 'revision', 'started_at']);
        $attributes['started_at'] = now()->subMinutes(2);
        $expired = CheckpointAttempt::create($attributes + ['expires_at' => now()->subMinute()]);
        $auto = $service->refresh($user, $package, $expired);
        $manual = $service->submit($user, $package, $expired, 0);
        $this->assertSame($auto->result_snapshot, $manual->result_snapshot);
        $this->assertSame($auto->revision, $manual->revision);
        $this->assertSame($content, $manual->content_snapshot);
        $this->assertSame($grading, $manual->grading_snapshot);
        $this->assertCount(3, $manual->result_snapshot['sessions']);
        $this->assertEquals(3, $manual->result_snapshot['earned']);
        $this->assertSame('completed', $manual->status);
    }

    public function test_try_out_attempt_engine_keeps_four_sessions(): void
    {
        $program = Program::firstOrCreate(['code' => 'n5'], ['slug' => 'n5', 'name' => 'R19 N5', 'family' => 'jlpt', 'status' => 'active', 'sort_order' => 1]);
        $content = app(\App\Services\TryOutService::class);
        $assessment = $content->save(['program_id' => $program->id, 'title' => 'R19 Try Out regression', 'access_type' => 'free', 'max_score' => 4,
            'session_passing_scores' => array_fill_keys(array_keys($content::SESSIONS), 1)]);
        foreach (array_keys($content::SESSIONS) as $session) {
            $content->saveQuestion($assessment, ['session' => $session, 'question' => 'Question', 'options' => ['A' => 'One', 'B' => 'Two', 'C' => 'Three', 'D' => 'Four'], 'correct_option' => 'B', 'point_value' => 1, 'status' => 'published', 'audio_url' => $session === 'audio' ? 'https://example.test/audio.mp3' : null]);
        }
        $assessment = $content->save(['status' => 'published'], $assessment);
        $user = $this->user();
        $service = app(\App\Services\TryOutAttemptService::class);
        $attempt = $service->start($user, $assessment);
        $this->assertArrayNotHasKey('session_policy', $attempt->grading_snapshot);
        $this->assertArrayNotHasKey('active_sessions', $service->payload($attempt));
        $answers = array_fill_keys(array_column($attempt->content_snapshot, 'id'), 'B');
        $attempt = $service->save($user, $assessment, $attempt, $answers, 0, true);
        $this->assertSame(1, $attempt->current_session);
        $result = $service->submit($user, $assessment, $attempt, 1);
        $this->assertCount(4, $result->result_snapshot['sessions']);
        $this->assertEquals(4, $result->result_snapshot['earned']);
        $this->assertTrue($result->result_snapshot['overall_pass']);
    }

    public function test_audio_and_unmarked_snapshot_remain_four_sessions(): void
    {
        $package = $this->package(true);
        $user = $this->user();
        $this->grant($user, 'n5', 'sensei');
        $service = app(CheckpointAttemptService::class);
        $attempt = $service->start($user, $package);
        $snapshot = $attempt->grading_snapshot;
        unset($snapshot['session_policy'], $snapshot['active_sessions']);
        $attributes = $attempt->only(['user_id', 'checkpoint_package_id', 'status', 'content_snapshot', 'answers', 'completed_sessions', 'current_session', 'revision', 'started_at', 'expires_at']);
        $attempt = CheckpointAttempt::create($attributes + ['grading_snapshot' => $snapshot]);
        $answers = array_fill_keys(array_column($attempt->content_snapshot, 'id'), 'B');
        $attempt = $service->save($user, $package, $attempt, $answers, 0);
        $result = $service->submit($user, $package, $attempt, 1);
        $this->assertSame($snapshot, $result->grading_snapshot);
        $this->assertCount(4, $result->result_snapshot['sessions']);
        $this->assertEquals(4, $result->result_snapshot['earned']);
        $this->assertTrue($result->result_snapshot['overall_pass']);
    }
}
