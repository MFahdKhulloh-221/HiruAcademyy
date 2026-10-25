<?php

namespace Tests\Feature;

use App\Models\AccessGrant;
use App\Models\Invoice;
use App\Models\PlacementAttempt;
use App\Models\PlacementConfig;
use App\Models\PlacementQuestion;
use App\Models\Program;
use App\Models\User;
use App\Services\PlacementService;
use App\Support\DatabaseSafety;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class AdaptivePlacementTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        DatabaseSafety::assertTarget(true);
        $this->withoutMiddleware(ThrottleRequests::class);
    }

    private function bank(int $count = 12): PlacementConfig
    {
        $config = PlacementConfig::create(['title' => 'Adaptive fixture', 'intro_heading' => 'Intro', 'description' => 'Test', 'duration_minutes' => 30, 'question_count' => $count]);
        foreach (PlacementService::LEVELS as $level) {
            foreach (PlacementService::CATEGORIES as $category) {
                for ($i = 0; $i < ceil($count / 4); $i++) {
                    PlacementQuestion::create(['placement_config_id' => $config->id, 'prompt' => 'Question', 'passage' => 'Reading passage', 'audio_url' => 'placement/listening.mp3', 'level' => $level, 'category' => $category, 'options' => ['A' => 'Correct', 'B' => 'Wrong', 'C' => 'Other', 'D' => 'Last'], 'correct_option' => 'A', 'status' => 'published']);
                }
            }
        }

        return app(PlacementService::class)->save('placement-configs', ['status' => 'published'], $config);
    }

    private function start(): array
    {
        return $this->postJson('/api/placement/attempts', ['name' => 'Test', 'whatsapp' => '08123456789', 'privacy' => true, 'target' => 'N1'])->assertCreated()->json('data');
    }

    public function test_counts_full_correct_all_wrong_easy_only_and_zero(): void
    {
        foreach ([12, 20, 25] as $count) {
            $this->bank($count);
            foreach (['full', 'wrong', 'easy', 'zero'] as $mode) {
                $attempt = $this->start();
                $url = '/api/placement/attempts/'.$attempt['id'];
                $this->assertCount(1, $attempt['questions']);
                $this->assertSame('N3', $attempt['questions'][0]['level']);
                $this->assertSame('Reading passage', $attempt['questions'][0]['passage']);
                $this->assertTrue($attempt['adaptive']);
                $this->assertSame($count, $attempt['question_limit']);
                if ($mode !== 'zero') {
                    for ($i = 0; $i < $count; $i++) {
                        $question = $attempt['questions'][$i];
                        $this->assertSame(PlacementService::CATEGORIES[$i % 4], $question['category']);
                        $answer = $mode === 'full' || ($mode === 'easy' && $question['level'] === 'N5') ? 'A' : 'B';
                        $attempt = $this->putJson($url.'/answers', ['answers' => [$question['id'] => $answer], 'revision' => $attempt['revision']])->assertOk()->json('data');
                    }
                    $this->assertCount($count, array_unique(array_column($attempt['questions'], 'id')));
                }
                $result = $this->postJson($url.'/submit', ['answers' => [], 'revision' => $attempt['revision']])->assertOk()->json('data');
                $this->assertSame($mode === 'full' ? 'N1' : 'N5', $result['result']['recommendation_level']);
                $this->assertSame($count, $result['result']['total']);
                $this->assertSame($mode === 'zero' ? $count : 0, $result['result']['unanswered']);
                if ($mode === 'full') {
                    $this->assertSame(100, $result['result']['percentage']);
                    $this->assertTrue($result['result']['evidence']['N1']['mastered']);
                }
                $this->postJson($url.'/submit', ['answers' => []])->assertOk()->assertJsonPath('data', $result);
                $this->getJson($url)->assertOk()->assertJsonPath('data', $result);
            }
        }
    }

    public function test_revision_unissued_committed_answers_deadline_and_snapshot(): void
    {
        $config = $this->bank();
        $attempt = $this->start();
        $url = '/api/placement/attempts/'.$attempt['id'];
        $id = $attempt['questions'][0]['id'];
        $snapshot = PlacementAttempt::findOrFail($attempt['id'])->getRawOriginal('content_snapshot');
        $unissued = $config->questions()->where('id', '<>', $id)->first()->id;
        $this->putJson($url.'/answers', ['answers' => [$unissued => 'A'], 'revision' => 0])->assertUnprocessable();
        $this->putJson($url.'/answers', ['answers' => [$id => 'A']])->assertUnprocessable();
        $attempt = $this->putJson($url.'/answers', ['answers' => [$id => 'A'], 'revision' => 0])->assertOk()->json('data');
        $this->assertSame('N2', $attempt['questions'][1]['level']);
        $this->putJson($url.'/answers', ['answers' => [$id => 'A'], 'revision' => 0])->assertConflict();
        $this->putJson($url.'/answers', ['answers' => [$id => 'B'], 'revision' => 1])->assertUnprocessable();
        $this->postJson($url.'/submit', ['answers' => [], 'revision' => 0])->assertConflict();
        PlacementQuestion::whereKey($id)->update(['prompt' => 'Changed', 'correct_option' => 'B']);
        $this->getJson($url)->assertOk()->assertJsonPath('data.questions.0.prompt', 'Question')->assertJsonPath('data.revision', 1);
        $this->assertSame($snapshot, PlacementAttempt::findOrFail($attempt['id'])->getRawOriginal('content_snapshot'));
        try {
            DB::transaction(fn () => DB::table('placement_attempts')->where('id', $attempt['id'])->update(['content_snapshot' => '[]']));
            $this->fail('Immutable bank snapshot required.');
        } catch (QueryException $exception) {
            $this->assertStringContainsString('immutable', $exception->getMessage());
        }
        $this->travelTo(CarbonImmutable::parse($attempt['expires_at']));
        $this->getJson($url)->assertOk()->assertJsonPath('data.status', 'completed');
        $this->putJson($url.'/answers', ['answers' => [], 'revision' => 1])->assertOk()->assertJsonPath('data.status', 'completed');
        $this->postJson($url.'/submit', ['answers' => [$attempt['questions'][1]['id'] => 'A'], 'revision' => 0])->assertOk()->assertJsonPath('data.result.correct', 1)->assertJsonPath('data.result.unanswered', 11)->assertJsonPath('data.result.recommendation_level', 'N5');
        $this->travelBack();
    }

    public function test_coverage_admin_preview_ownership_and_program_lookup(): void
    {
        $config = $this->bank();
        $admin = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $admin->forceFill(['role' => 'admin', 'account_status' => 'active'])->save();
        $this->actingAs($admin);
        $this->getJson('/api/admin/placement-configs/'.$config->id)->assertOk()->assertJsonPath('data.availability.N1.Bunpou', ['valid' => 3, 'required' => 3]);
        $attempt = $this->postJson('/api/admin/placement-configs/'.$config->id.'/preview', [])->assertCreated()->json('data');
        $url = '/api/admin/placement-previews/'.$attempt['id'];
        $this->getJson('/api/placement/attempts/'.$attempt['id'])->assertNotFound();
        $this->getJson($url)->assertOk();
        $this->getJson('/api/admin/placement-leads')->assertOk()->assertJsonMissing(['id' => $attempt['id']]);
        $question = $attempt['questions'][0];
        $this->putJson($url.'/answers', ['answers' => [$question['id'] => 'B'], 'revision' => 0])->assertOk()->assertJsonPath('data.questions.1.level', 'N4');
        Program::whereRaw('LOWER(code) = ?', ['n5'])->update(['status' => 'inactive']);
        $this->postJson($url.'/submit', ['answers' => [], 'revision' => 1])->assertOk()->assertJsonPath('data.result.recommended_program', null);
        $program = Program::updateOrCreate(['code' => 'n5'], ['slug' => 'fixture-n5', 'name' => 'Fixture N5', 'family' => 'jlpt', 'sort_order' => 5, 'status' => 'active']);
        $program->update(['status' => 'active']);
        $next = $this->postJson('/api/admin/placement-configs/'.$config->id.'/preview', [])->assertCreated()->json('data');
        $this->postJson('/api/admin/placement-previews/'.$next['id'].'/submit', ['answers' => [], 'revision' => 0])->assertOk()
            ->assertJsonPath('data.result.recommended_program.code', 'n5')->assertJsonPath('data.result.recommended_program.title', $program->name)->assertJsonPath('data.result.recommended_program.path', '/program?level=n5');
        $program->update(['code' => 'N5']);
        $uppercase = $this->postJson('/api/admin/placement-configs/'.$config->id.'/preview', [])->assertCreated()->json('data');
        $this->postJson('/api/admin/placement-previews/'.$uppercase['id'].'/submit', ['answers' => [], 'revision' => 0])->assertOk()
            ->assertJsonPath('data.result.recommended_program.code', 'N5')->assertJsonPath('data.result.recommended_program.path', '/program?level=N5');
        $program->update(['family' => 'interview']);
        $custom = $this->postJson('/api/admin/placement-configs/'.$config->id.'/preview', [])->assertCreated()->json('data');
        $this->postJson('/api/admin/placement-previews/'.$custom['id'].'/submit', ['answers' => [], 'revision' => 0])->assertOk()
            ->assertJsonPath('data.result.recommended_program', null);
        $other = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $other->forceFill(['role' => 'admin', 'account_status' => 'active'])->save();
        $this->actingAs($other)->getJson($url)->assertNotFound();
        $question = $config->questions()->first();
        $this->patchJson('/api/admin/placement-questions/'.$question->id, ['level' => null])->assertUnprocessable();
        $this->patchJson('/api/admin/placement-configs/'.$config->id, ['question_count' => 20])->assertUnprocessable();
        $config->update(['status' => 'draft']);
        $this->patchJson('/api/admin/placement-questions/'.$question->id, ['level' => null])->assertOk();
        $this->patchJson('/api/admin/placement-configs/'.$config->id, ['status' => 'published'])->assertUnprocessable();
        $config->update(['status' => 'published']); // Simulate old published config without coverage.
        $student = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $student->forceFill(['role' => 'student', 'account_status' => 'active'])->save();
        $this->actingAs($student);
        $this->postJson('/api/placement/attempts', ['name' => 'Test', 'whatsapp' => '08123456789', 'privacy' => true, 'target' => 'N5'])->assertUnprocessable();
    }

    public function test_incomplete_listening_and_reading_do_not_count_or_allow_publishing(): void
    {
        $config = $this->bank();
        $config->update(['status' => 'draft']);
        $service = app(PlacementService::class);
        foreach (['Choukai' => 'audio_url', 'Dokkai' => 'passage'] as $category => $field) {
            $question = $config->questions()->where('level', 'N3')->where('category', $category)->firstOrFail();
            $original = $question->$field;
            foreach ([null, '', '   '] as $missing) {
                $question->update([$field => $missing]);
                $this->assertSame(['valid' => 2, 'required' => 3], $service->availability($config)['N3'][$category]);
                try {
                    $service->save('placement-configs', ['status' => 'published'], $config);
                    $this->fail('Incomplete media must not count toward published coverage.');
                } catch (ValidationException $exception) {
                    $this->assertArrayHasKey('availability', $exception->errors());
                }
                $this->assertSame('draft', $config->fresh()->status);
            }
            $question->update([$field => $original]);
        }
        $this->assertSame('published', $service->save('placement-configs', ['status' => 'published'], $config)->status);
    }

    public function test_early_submit_one_correct_n3_cannot_recommend_untested_high_level(): void
    {
        $this->bank();
        $attempt = $this->start();
        $question = $attempt['questions'][0];
        $this->postJson('/api/placement/attempts/'.$attempt['id'].'/submit', ['answers' => [$question['id'] => 'A'], 'revision' => 0])->assertOk()
            ->assertJsonPath('data.result.correct', 1)
            ->assertJsonPath('data.result.unanswered', 11)
            ->assertJsonPath('data.result.percentage', 8)
            ->assertJsonPath('data.result.recommendation_level', 'N5')
            ->assertJsonPath('data.result.estimation_label', 'Estimasi kemampuan awal')
            ->assertJsonPath('data.result.evidence.N3.mastered', false)
            ->assertJsonPath('data.result.evidence.N1.answered', 0)
            ->assertJsonPath('data.result.evidence.N1.mastered', false);
    }

    public function test_intermediate_recommendations_follow_mastered_level_evidence(): void
    {
        foreach ([12, 20, 25] as $count) {
            $this->bank($count);
            foreach (['N4', 'N3', 'N2'] as $target) {
                $rank = array_search($target, PlacementService::LEVELS, true);
                $attempt = $this->start();
                $url = '/api/placement/attempts/'.$attempt['id'];
                for ($i = 0; $i < $count; $i++) {
                    $question = $attempt['questions'][$i];
                    $answer = array_search($question['level'], PlacementService::LEVELS, true) <= $rank ? 'A' : 'B';
                    $attempt = $this->putJson($url.'/answers', ['answers' => [$question['id'] => $answer], 'revision' => $attempt['revision']])->assertOk()->json('data');
                }
                $result = $this->postJson($url.'/submit', ['answers' => [], 'revision' => $attempt['revision']])->assertOk()
                    ->assertJsonPath('data.result.recommendation_level', $target)->assertJsonPath('data.result.evidence.'.$target.'.mastered', true)->json('data.result');
                $this->assertGreaterThanOrEqual(2, $result['evidence'][$target]['correct']);
                $this->assertGreaterThanOrEqual(2, count($result['evidence'][$target]['categories']));
                foreach (array_slice(PlacementService::LEVELS, $rank + 1) as $higher) {
                    $this->assertFalse($result['evidence'][$higher]['mastered']);
                }
            }
        }
    }

    public function test_authenticated_completion_does_not_grant_paid_access_or_create_invoice(): void
    {
        $this->bank();
        $student = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $student->forceFill(['role' => 'student', 'account_status' => 'active'])->save();
        $this->actingAs($student);
        $before = $this->getJson('/api/student/access')->assertOk()->json('data');
        $this->assertSame([], $before['source_grants']);
        $counts = [AccessGrant::count(), Invoice::count()];
        $attempt = $this->start();
        $url = '/api/placement/attempts/'.$attempt['id'];
        for ($i = 0; $i < $attempt['question_limit']; $i++) {
            $attempt = $this->putJson($url.'/answers', ['answers' => [$attempt['questions'][$i]['id'] => 'A'], 'revision' => $attempt['revision']])->assertOk()->json('data');
        }
        $this->postJson($url.'/submit', ['answers' => [], 'revision' => $attempt['revision']])->assertOk()
            ->assertJsonPath('data.status', 'completed')->assertJsonPath('data.result.recommendation_level', 'N1');
        $this->assertSame($counts, [AccessGrant::count(), Invoice::count()]);
        $this->getJson('/api/student/access')->assertOk()->assertJsonPath('data', $before);
        $this->assertSame(0, AccessGrant::where('user_id', $student->id)->count());
        $this->assertSame(0, Invoice::where('user_id', $student->id)->count());
    }

    public function test_legacy_attempt_keeps_thresholds_and_mutable_answers(): void
    {
        $config = $this->bank();
        $token = str_repeat('a', 64);
        $this->withSession(['placement_owner' => $token]);
        $attempt = PlacementAttempt::create(['placement_config_id' => $config->id, 'owner_hash' => hash('sha256', $token), 'applicant_snapshot' => [], 'config_snapshot' => ['recommendation_rules' => [['minScore' => 0, 'maxScore' => 100, 'recommendedProgramCode' => 'N4']]], 'content_snapshot' => [['id' => 1, 'prompt' => 'Legacy', 'options' => ['A' => 'A', 'B' => 'B', 'C' => 'C', 'D' => 'D'], 'category' => 'Bunpou']], 'grading_snapshot' => [1 => 'A'], 'answers' => [], 'status' => 'in_progress', 'started_at' => now(), 'expires_at' => now()->addHour()]);
        $url = '/api/placement/attempts/'.$attempt->id;
        $this->putJson($url.'/answers', ['answers' => [1 => 'B']])->assertOk()->assertJsonPath('data.adaptive', false);
        $this->postJson($url.'/submit', ['answers' => [1 => 'A']])->assertOk()->assertJsonPath('data.result.correct', 1)->assertJsonPath('data.result.recommendation_level', 'N4');
    }
}
