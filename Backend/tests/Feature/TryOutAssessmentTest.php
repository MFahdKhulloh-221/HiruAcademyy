<?php

namespace Tests\Feature;

use App\Models\Program;
use App\Models\TryOut;
use App\Models\TryOutAttempt;
use App\Models\User;
use App\Services\TryOutService;
use Database\Seeders\ProgramSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class TryOutAssessmentTest extends TestCase
{
    use DatabaseTransactions;

    private User $student;

    private User $admin;

    private TryOut $tryOut;

    private string $base;

    private string $adminBase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('hiru_academy_test', DB::connection()->getDatabaseName());
        $this->seed(ProgramSeeder::class);
        $this->student = $this->user('student');
        $this->admin = $this->user('admin');
        $this->tryOut = app(TryOutService::class)->save(['program_id' => Program::where('code', 'n5')->firstOrFail()->id, 'title' => 'Try Out fixture']);
        $this->base = '/api/student/try-outs/'.$this->tryOut->id;
        $this->adminBase = '/api/admin/try-outs/'.$this->tryOut->id;
        $this->actingAs($this->student);
    }

    public function call($method, $uri, $parameters = [], $cookies = [], $files = [], $server = [], $content = null)
    {
        $ip = $server['REMOTE_ADDR'] ?? $this->serverVariables['REMOTE_ADDR'] ?? '127.0.0.1';
        $user = auth()->user();
        RateLimiter::clear(md5('identity'.$ip));
        RateLimiter::clear(md5('apiwrite:'.($user ? 'user:'.$user->getAuthIdentifier() : 'ip:'.$ip)));

        return parent::call($method, $uri, $parameters, $cookies, $files, $server, $content);
    }

    private function user(string $role): User
    {
        $user = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $user->forceFill(['role' => $role, 'account_status' => 'active'])->save();

        return $user;
    }

    private function question(string $session, int $points, array $extra = []): array
    {
        return array_replace(['session' => $session, 'point_value' => $points, 'question' => 'Original question', 'options' => ['A' => 'One', 'B' => 'Two', 'C' => 'Three', 'D' => 'Four'], 'correct_option' => 'B', 'explanation' => 'Private explanation', 'reading_passage' => $session === 'reading' ? 'Original passage' : null, 'audio_url' => $session === 'audio' ? 'https://example.test/audio.mp3' : null, 'status' => 'published'], $extra);
    }

    private function publish(?int $threshold = null): void
    {
        $service = app(TryOutService::class);
        foreach (array_combine(array_keys(TryOutService::SESSIONS), [20, 40, 50, 70]) as $session => $points) {
            $service->saveQuestion($this->tryOut, $this->question($session, $points));
        }
        $this->tryOut = $service->save(['status' => 'published', 'total_passing_score' => $threshold], $this->tryOut);
    }

    private function start(): array
    {
        return $this->postJson($this->base.'/attempts')->assertCreated()->json('data');
    }

    private function finish(array $attempt, array $choices = ['B', 'B', 'B', 'B']): array
    {
        foreach (array_keys(TryOutService::SESSIONS) as $index => $session) {
            $question = array_values(array_filter($attempt['questions'], fn ($question) => $question['session'] === $session))[0];
            $answers = $choices[$index] === null ? [] : [$question['id'] => $choices[$index]];
            $attempt = $this->putJson($this->base.'/attempts/'.$attempt['id'].'/answers', ['answers' => $answers, 'revision' => $attempt['revision'], 'finish_session' => true])->assertOk()->json('data');
        }

        return $this->postJson($this->base.'/attempts/'.$attempt['id'].'/submit', ['revision' => $attempt['revision']])->assertOk()->json('data');
    }

    public function test_managed_audio_admin_validation_and_snapshot_resolution(): void
    {
        config(['media.disk' => 'public']);
        Storage::fake('public');
        $this->actingAs($this->admin);
        $wav = 'RIFF'.pack('V', 38).'WAVEfmt '.pack('VvvVVvv', 16, 1, 1, 8000, 16000, 2, 16).'data'.pack('V', 2)."\x00\x00";
        $upload = $this->post('/api/admin/media', ['kind' => 'audio', 'file' => UploadedFile::fake()->createWithContent('audio.wav', $wav)], ['Accept' => 'application/json'])->assertCreated()->json('data');
        $question = $this->postJson($this->adminBase.'/questions', $this->question('audio', 70, ['audio_url' => $upload['path']]))->assertCreated()->assertJsonPath('data.audio_url_resolved_url', $upload['url'])->json('data.id');
        foreach (['javascript:alert(1)', 'https://user:pass@example.test/audio.mp3', 'https://example.test/page', 'media/audio/missing.mp3', '../audio.mp3'] as $unsafe) {
            $this->patchJson($this->adminBase.'/questions/'.$question, ['audio_url' => $unsafe])->assertUnprocessable()->assertJsonValidationErrors('audio_url');
        }
        foreach (['vocabulary_kanji' => 20, 'grammar' => 40, 'reading' => 50] as $session => $points) {
            app(TryOutService::class)->saveQuestion($this->tryOut, $this->question($session, $points));
        }
        $this->tryOut = app(TryOutService::class)->save(['status' => 'published'], $this->tryOut);
        $this->actingAs($this->student);
        $attempt = $this->start();
        $audio = collect($attempt['questions'])->firstWhere('session', 'audio');
        $this->assertSame($upload['path'], $audio['audio_url']);
        $this->assertSame($upload['url'], $audio['audio_url_resolved_url']);
        $this->assertArrayNotHasKey('correct_option', $audio);
        $snapshot = TryOutAttempt::findOrFail($attempt['id'])->content_snapshot;
        $this->finish($attempt);
        $this->getJson($this->base.'/attempts/'.$attempt['id'].'/review')->assertOk();
        $this->assertSame($snapshot, TryOutAttempt::findOrFail($attempt['id'])->content_snapshot);
        $this->actingAs($this->admin)->patchJson($this->adminBase.'/questions/'.$question, ['audio_url' => 'https://example.test/new.mp3'])->assertOk();
        $this->deleteJson('/api/admin/media', ['path' => $upload['path']])->assertStatus(409);
    }

    public function test_admin_crud_and_exact_fixed_configuration(): void
    {
        $this->actingAs($this->admin);
        $created = $this->postJson('/api/admin/try-outs', ['program_id' => $this->tryOut->program_id, 'title' => 'Draft'])->assertCreated()->assertJsonPath('data.max_score', 180)->assertJsonPath('data.section_passing_score', 19)->assertJsonPath('data.total_passing_score', null)->json('data.id');
        $this->getJson('/api/admin/try-outs')->assertOk();
        $this->patchJson('/api/admin/try-outs/'.$created, ['title' => 'Updated'])->assertOk()->assertJsonPath('data.title', 'Updated');
        $question = $this->postJson($this->adminBase.'/questions', $this->question('reading', 20, ['status' => 'draft', 'reading_passage' => null]))->assertCreated()->json('data.id');
        $this->patchJson($this->adminBase.'/questions/'.$question, ['question' => 'Edited', 'status' => 'published'])->assertOk()->assertJsonPath('data.correct_option', 'B');
        $this->getJson($this->adminBase)->assertOk()->assertJsonPath('data.sessions.reading', 'Reading / Dokkai')->assertJsonPath('data.questions.0.question', 'Edited');
        $this->deleteJson($this->adminBase.'/questions/'.$question)->assertNoContent();
        $this->deleteJson('/api/admin/try-outs/'.$created)->assertNoContent();
    }

    public function test_authoring_rejects_malformed_options_points_sessions_media_and_tampering(): void
    {
        $this->actingAs($this->admin);
        foreach ([['point_value' => 0], ['point_value' => -1], ['point_value' => 1.5], ['point_value' => null], ['session' => 'listening'], ['correct_option' => 'E'], ['options' => ['A' => 'One', 'B' => 'Two', 'C' => 'Three']], ['options' => ['A' => 'One', 'B' => 'Two', 'C' => 'Three', 'D' => 'Four', 'E' => 'Extra']], ['options' => ['A' => ['key' => 'B'], 'B' => 'Two', 'C' => 'Three', 'D' => 'Four']], ['options' => ['A' => ' ', 'B' => 'Two', 'C' => 'Three', 'D' => 'Four']], ['audio_url' => 'javascript:alert(1)'], ['try_out_id' => 999], ['section_passing_score' => 1]] as $extra) {
            $this->postJson($this->adminBase.'/questions', $this->question('grammar', 20, $extra))->assertUnprocessable();
        }
        $missing = $this->question('grammar', 20);
        unset($missing['point_value']);
        $this->postJson($this->adminBase.'/questions', $missing)->assertUnprocessable();
        $this->postJson($this->adminBase.'/questions', $this->question('audio', 20, ['audio_url' => null]))->assertUnprocessable();
        $id = $this->postJson($this->adminBase.'/questions', $this->question('audio', 20, ['status' => 'draft', 'audio_url' => null]))->assertCreated()->json('data.id');
        $this->patchJson($this->adminBase.'/questions/'.$id, ['status' => 'published'])->assertUnprocessable();
        foreach ([['section_passing_score' => 20], ['max_score' => 100], ['sessions' => []], ['total_passing_score' => -1], ['total_passing_score' => 181], ['total_passing_score' => 19.5]] as $extra) {
            $this->patchJson($this->adminBase, $extra)->assertUnprocessable();
        }
    }

    public function test_only_active_jlpt_programs_are_authorable_and_n1_preview_is_free(): void
    {
        $this->actingAs($this->admin);
        foreach (['dasar', 'ssw-food', 'interview'] as $code) {
            $id = Program::where('code', $code)->firstOrFail()->id;
            $this->postJson('/api/admin/try-outs', ['program_id' => $id, 'title' => 'Invalid'])->assertUnprocessable();
            $this->patchJson($this->adminBase, ['program_id' => $id])->assertUnprocessable();
        }
        $program = Program::where('code', 'n1')->firstOrFail();
        $program->update(['status' => 'inactive']);
        $this->patchJson($this->adminBase, ['program_id' => $program->id])->assertUnprocessable();
        $program->update(['status' => 'active']);
        $this->patchJson($this->adminBase, ['program_id' => $program->id])->assertOk();
        $this->tryOut->refresh();
        $this->publish();
        $this->actingAs($this->student);
        $this->start();
        $program->update(['status' => 'inactive']);
        $this->postJson($this->base.'/attempts')->assertNotFound();
        $this->getJson('/api/student/try-outs')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_publish_requires_four_sessions_total180_and_edits_preserve_invariant(): void
    {
        $this->actingAs($this->admin);
        $this->patchJson($this->adminBase, ['status' => 'published'])->assertUnprocessable();
        $this->assertSame('draft', $this->tryOut->fresh()->status);
        $service = app(TryOutService::class);
        foreach (['vocabulary_kanji', 'grammar', 'reading'] as $session) {
            $service->saveQuestion($this->tryOut, $this->question($session, 60));
        }
        $this->patchJson($this->adminBase, ['status' => 'published'])->assertUnprocessable();
        $audio = $service->saveQuestion($this->tryOut, $this->question('audio', 20));
        $this->patchJson($this->adminBase, ['status' => 'published'])->assertUnprocessable();
        $grammar = $this->tryOut->questions()->where('session', 'grammar')->firstOrFail();
        $this->patchJson($this->adminBase.'/questions/'.$grammar->id, ['point_value' => 40])->assertOk();
        $this->patchJson($this->adminBase, ['status' => 'published'])->assertOk();
        foreach ([['point_value' => 19], ['status' => 'draft'], ['session' => 'grammar'], ['audio_url' => null]] as $extra) {
            $this->patchJson($this->adminBase.'/questions/'.$audio->id, $extra)->assertUnprocessable();
        }
        $this->deleteJson($this->adminBase.'/questions/'.$audio->id)->assertUnprocessable();
        $this->assertSame(20, $audio->fresh()->point_value);
        $this->postJson($this->adminBase.'/questions', $this->question('grammar', 1))->assertUnprocessable();
        $this->postJson($this->adminBase.'/questions', $this->question('grammar', 1, ['status' => 'draft']))->assertCreated();
        $this->patchJson($this->adminBase.'/questions/'.$audio->id, ['question' => 'Valid edit'])->assertOk();
    }

    public function test_program_scope_cannot_change_after_started_or_completed_attempt(): void
    {
        $this->publish();
        $attempt = $this->start();
        $original = $this->tryOut->program_id;
        $target = Program::where('code', 'n4')->firstOrFail()->id;
        $this->actingAs($this->admin);
        $this->patchJson($this->adminBase, ['program_id' => $target, 'title' => 'Rejected'])->assertUnprocessable()->assertJsonValidationErrors('program_id');
        $this->assertSame($original, $this->tryOut->fresh()->program_id);
        $this->assertSame('Try Out fixture', $this->tryOut->fresh()->title);
        $this->actingAs($this->student);
        $this->finish($attempt);
        $this->actingAs($this->admin);
        $this->patchJson($this->adminBase, ['status' => 'draft'])->assertOk();
        $this->patchJson($this->adminBase, ['program_id' => $target])->assertUnprocessable();
        $this->patchJson($this->adminBase, ['program_id' => $original, 'title' => 'Allowed'])->assertOk();
        $this->actingAs($this->student);
        $this->getJson($this->base.'/history')->assertOk()->assertJsonPath('data.best_score', 180);
        $this->getJson($this->base.'/attempts/'.$attempt['id'].'/review')->assertOk();
    }

    public function test_auth_role_and_inactive_guards(): void
    {
        $this->publish();
        $this->app['auth']->forgetGuards();
        $this->getJson($this->base)->assertUnauthorized();
        $this->postJson('/api/admin/try-outs', [])->assertUnauthorized();
        $this->actingAs($this->student)->getJson($this->adminBase)->assertForbidden();
        $this->actingAs($this->admin)->postJson($this->base.'/attempts')->assertForbidden();
        $this->admin->forceFill(['account_status' => 'inactive'])->save();
        $this->actingAs($this->admin)->patchJson($this->adminBase, ['title' => 'Forbidden'])->assertUnauthorized();
        $this->student->forceFill(['account_status' => 'inactive'])->save();
        $this->actingAs($this->student)->postJson($this->base.'/attempts')->assertUnauthorized();
    }

    public function test_student_allowlists_hide_answers_explanations_and_snapshots_until_review(): void
    {
        $this->getJson($this->base)->assertNotFound();
        $this->publish();
        $this->getJson($this->base)->assertOk()->assertJsonMissingPath('data.questions');
        $attempt = $this->start();
        $this->assertCount(4, $attempt['questions']);
        foreach (['correct_option', 'explanation', 'grading_snapshot', 'point_value'] as $secret) {
            $this->assertStringNotContainsString($secret, json_encode($attempt));
        }
        $stored = TryOutAttempt::findOrFail($attempt['id']);
        foreach (['content_snapshot', 'grading_snapshot', 'result_snapshot'] as $secret) {
            $this->assertArrayNotHasKey($secret, $stored->toArray());
        }
        $this->assertArrayNotHasKey('correct_option', $this->tryOut->questions()->firstOrFail()->toArray());
        $this->getJson($this->base.'/attempts/'.$attempt['id'].'/review')->assertForbidden();
        $stored->content_snapshot = array_map(function ($question) {
            $question['correct_option'] = 'B';
            $question['explanation'] = 'Injected';
            $question['options']['secret'] = 'Hidden';

            return $question;
        }, $stored->content_snapshot);
        DB::table('try_out_attempts')->where('id', $stored->id)->update(['content_snapshot' => json_encode($stored->content_snapshot)]);
        $response = $this->getJson($this->base.'/attempts/'.$attempt['id'])->assertOk();
        $this->assertStringNotContainsString('Injected', $response->getContent());
        $this->assertStringNotContainsString('secret', $response->getContent());
    }

    public function test_sequential_sessions_refresh_stale_save_and_server_fields(): void
    {
        $this->publish();
        $attempt = $this->start();
        $path = $this->base.'/attempts/'.$attempt['id'];
        $first = $attempt['questions'][0]['id'];
        $second = $attempt['questions'][1]['id'];
        $this->postJson($path.'/submit', ['revision' => 0])->assertUnprocessable();
        foreach ([['answers' => [$second => 'B'], 'revision' => 0, 'finish_session' => false], ['answers' => [$first => 'E'], 'revision' => 0, 'finish_session' => false], ['answers' => [], 'revision' => 0], ['answers' => [], 'revision' => -1, 'finish_session' => false], ['answers' => [], 'revision' => 0, 'finish_session' => false, 'score' => 180], ['answers' => [], 'revision' => 0, 'finish_session' => false, 'current_session' => 3]] as $input) {
            $this->putJson($path.'/answers', $input)->assertUnprocessable();
        }
        $this->putJson($path.'/answers', ['answers' => [$first => 'B'], 'revision' => 0, 'finish_session' => false])->assertOk()->assertJsonPath('data.revision', 1)->assertJsonPath('data.current_session', 0);
        $this->putJson($path.'/answers', ['answers' => [], 'revision' => 0, 'finish_session' => false])->assertConflict();
        $this->getJson($path)->assertOk()->assertJsonPath('data.answers.'.$first, 'B')->assertJsonPath('data.revision', 1);
        $this->putJson($path.'/answers', ['answers' => [$first => 'B'], 'revision' => 1, 'finish_session' => true])->assertOk()->assertJsonPath('data.current_session', 1)->assertJsonPath('data.completed_sessions.0', 'vocabulary_kanji');
        $this->putJson($path.'/answers', ['answers' => [$first => 'A'], 'revision' => 2, 'finish_session' => false])->assertUnprocessable();
        $this->putJson($path.'/answers', ['answers' => [$second => 'B'], 'revision' => 1, 'finish_session' => true])->assertConflict();
        $this->postJson($path.'/submit', ['revision' => 2, 'score' => 180])->assertUnprocessable();
        $this->postJson($path.'/submit', ['revision' => 2, 'answers' => []])->assertUnprocessable();
    }

    public function test_grading_thresholds_unanswered_and_double_submit_are_snapshot_stable(): void
    {
        $this->publish(100);
        $attempt = $this->start();
        $this->actingAs($this->admin);
        $reading = $this->tryOut->questions()->where('session', 'reading')->firstOrFail();
        $this->patchJson($this->adminBase.'/questions/'.$reading->id, ['question' => 'Changed', 'correct_option' => 'A', 'explanation' => 'Changed explanation', 'reading_passage' => 'Changed passage'])->assertOk();
        $this->patchJson($this->adminBase, ['total_passing_score' => null, 'status' => 'draft'])->assertOk();
        $this->actingAs($this->student);
        $completed = $this->finish($attempt, [null, 'A', 'B', 'B']);
        $this->assertSame(120, $completed['result']['earned']);
        $this->assertSame(180, $completed['result']['max']);
        $this->assertSame(2, $completed['result']['correct']);
        $this->assertSame(1, $completed['result']['wrong']);
        $this->assertSame(1, $completed['result']['unanswered']);
        $this->assertSame(100, $completed['result']['total_passing_score']);
        $this->assertFalse($completed['result']['overall_pass']);
        $path = $this->base.'/attempts/'.$attempt['id'];
        $retry = $this->postJson($path.'/submit', ['revision' => 0])->assertOk()->json('data');
        $this->assertEquals($completed, $retry);
        $this->assertSame($completed['completed_at'], $retry['completed_at']);
        $this->assertSame($completed['started_at'], $retry['started_at']);
        $this->putJson($path.'/answers', ['answers' => [], 'revision' => $completed['revision'], 'finish_session' => false])->assertConflict();
        $review = $this->getJson($path.'/review')->assertOk()->json('data.questions');
        $this->assertSame('Original passage', $review[2]['reading_passage']);
        $this->assertSame('B', $review[2]['correct_option']);
        $this->assertSame('Private explanation', $review[2]['explanation']);
        $this->getJson($path.'/review?incorrect_only=1')->assertOk()->assertJsonCount(2, 'data.questions');
        $this->actingAs($this->admin)->deleteJson($this->adminBase)->assertUnprocessable();
    }

    public function test_unlimited_attempts_best_score_owner_isolation_and_null_threshold(): void
    {
        $this->publish();
        $first = $this->finish($this->start(), ['A', 'B', 'B', 'B']);
        $this->assertNull($first['result']['overall_pass']);
        $second = $this->finish($this->start());
        $this->assertSame(180, $second['result']['earned']);
        $this->start();
        $this->getJson($this->base.'/history')->assertOk()->assertJsonPath('data.best_score', 180)->assertJsonCount(3, 'data.attempts');
        $otherTryOut = app(TryOutService::class)->save(['program_id' => $this->tryOut->program_id, 'title' => 'Other']);
        $this->getJson('/api/student/try-outs/'.$otherTryOut->id.'/attempts/'.$first['id'])->assertNotFound();
        $other = $this->user('student');
        $this->actingAs($other);
        $path = $this->base.'/attempts/'.$first['id'];
        $this->getJson($path)->assertNotFound();
        $this->getJson($path.'/review')->assertNotFound();
        $this->putJson($path.'/answers', ['answers' => [], 'revision' => 0, 'finish_session' => true])->assertNotFound();
        $this->postJson($path.'/submit', ['revision' => 0])->assertNotFound();
        $this->getJson($this->base.'/history')->assertOk()->assertJsonCount(0, 'data.attempts')->assertJsonPath('data.best_score', null);
    }

    public function test_total_threshold_and_fixed19_boundary_use_explicit_points_not_scaling(): void
    {
        $service = app(TryOutService::class);
        foreach (array_combine(array_keys(TryOutService::SESSIONS), [19, 20, 60, 81]) as $session => $points) {
            $service->saveQuestion($this->tryOut, $this->question($session, $points));
        }
        $this->tryOut = $service->save(['status' => 'published', 'total_passing_score' => 180], $this->tryOut);
        $completed = $this->finish($this->start());
        $this->assertTrue($completed['result']['overall_pass']);
        $this->assertTrue($completed['result']['sessions'][0]['pass']);
        $this->assertSame(19, $completed['result']['sessions'][0]['earned']);
        $this->assertSame([19, 20, 60, 81], array_column($completed['result']['sessions'], 'max'));
        $failed = $this->finish($this->start(), ['B', 'B', 'B', 'A']);
        $this->assertFalse($failed['result']['overall_pass']);
    }

    public function test_final_completion_rejects_stale_revision_and_post_session_saves(): void
    {
        $this->publish(0);
        $attempt = $this->start();
        $path = $this->base.'/attempts/'.$attempt['id'];
        foreach (range(0, 3) as $index) {
            $attempt = $this->putJson($path.'/answers', ['answers' => [], 'revision' => $index, 'finish_session' => true])->assertOk()->json('data');
        }
        $this->putJson($path.'/answers', ['answers' => [], 'revision' => 4, 'finish_session' => true])->assertConflict();
        $this->postJson($path.'/submit', ['revision' => 3])->assertConflict();
        $this->getJson($path)->assertOk()->assertJsonPath('data.status', 'in_progress')->assertJsonPath('data.current_session', 4);
        $this->postJson($path.'/submit', ['revision' => 4])->assertOk()->assertJsonPath('data.result.unanswered', 4)->assertJsonPath('data.result.earned', 0)->assertJsonPath('data.result.overall_pass', false);
        $this->postJson($path.'/submit', ['revision' => 4])->assertOk()->assertJsonPath('data.revision', 5);
    }

    public function test_attempt_snapshots_and_completed_results_are_immutable(): void
    {
        $this->publish();
        $started = $this->start();
        $attempt = TryOutAttempt::findOrFail($started['id']);
        foreach (['content_snapshot' => [], 'grading_snapshot' => [], 'user_id' => $this->admin->id, 'try_out_id' => 999, 'started_at' => now()->subDay()] as $key => $value) {
            try {
                $attempt->fresh()->update([$key => $value]);
                $this->fail('Immutable field accepted.');
            } catch (\LogicException $exception) {
                $this->assertSame('Attempt snapshots and completed attempts are immutable.', $exception->getMessage());
            }
        }
        $completed = $this->finish($started);
        $this->expectException(\LogicException::class);
        TryOutAttempt::findOrFail($completed['id'])->update(['result_snapshot' => ['earned' => 0]]);
    }

    public function test_database_checks_and_foreign_keys_reject_invalid_direct_writes(): void
    {
        $this->publish();
        $question = $this->tryOut->questions()->firstOrFail();
        foreach ([['point_value' => 0], ['session' => 'unknown'], ['correct_option' => 'E'], ['options' => json_encode(['A' => 'One'])], ['try_out_id' => 99999999]] as $values) {
            try {
                DB::transaction(fn () => DB::table('try_out_questions')->where('id', $question->id)->update($values));
                $this->fail('Invalid direct write accepted.');
            } catch (QueryException $exception) {
                $this->assertStringStartsWith('23', $exception->errorInfo[0]);
            }
        }
        $attempt = $this->start();
        try {
            DB::transaction(fn () => DB::table('try_out_attempts')->where('id', $attempt['id'])->update(['current_session' => 4]));
            $this->fail('Invalid session state accepted.');
        } catch (QueryException $exception) {
            $this->assertSame('23514', $exception->errorInfo[0]);
        }
    }
}
