<?php

namespace Tests\Feature;

use App\Models\PlacementAttempt;
use App\Models\PlacementConfig;
use App\Models\PlacementQuestion;
use App\Models\User;
use App\Services\PlacementService;
use App\Support\DatabaseSafety;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Tests\TestCase;

class PercentagePlacementTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        DatabaseSafety::assertTarget(true);
        $this->withoutMiddleware(ThrottleRequests::class);
    }

    private function config(int $count): PlacementConfig
    {
        $config = PlacementConfig::create(['title' => 'Test', 'intro_heading' => 'Test', 'duration_minutes' => 7, 'description' => 'Test', 'status' => 'draft']);
        for ($i = 0; $i < $count; $i++) {
            PlacementQuestion::create(['placement_config_id' => $config->id, 'prompt' => 'Test', 'options' => ['A' => 'One', 'B' => 'Two', 'C' => 'Three', 'D' => 'Four'], 'correct_option' => 'B', 'category' => 'Bunpou', 'level' => 'N5', 'status' => 'published', 'sort_order' => $i + 1]);
        }
        $config->update(['status' => 'published']);

        return $config;
    }

    private function start(): array
    {
        return $this->postJson('/api/placement/attempts', ['name' => 'Test', 'whatsapp' => '+6281234567890', 'target' => 'N3', 'privacy' => true])->assertCreated()->json('data');
    }

    public function test_readiness_and_unrestricted_admin_bank(): void
    {
        $config = $this->config(14);
        $this->getJson('/api/placement')->assertOk()->assertJsonPath('data.is_ready', false)->assertJsonPath('data.question_count', 14);
        $this->postJson('/api/placement/attempts', ['name' => 'Test', 'whatsapp' => '+6281234567890', 'target' => 'N3', 'privacy' => true])->assertUnprocessable();
        $service = app(PlacementService::class);
        $question = $config->questions()->first();
        $copy = $question->replicate();
        $copy->save();
        $this->getJson('/api/placement')->assertOk()->assertJsonPath('data.is_ready', true)->assertJsonPath('data.question_count', 15);
        $service->save('placement-configs', ['status' => 'published'], $config);
        $service->save('placement-questions', ['status' => 'draft'], $copy);
        $this->getJson('/api/placement')->assertOk()->assertJsonPath('data.is_ready', false);
        $service->delete($copy);
        $this->assertSame(14, $config->questions()->count());
    }

    public function test_percentages_thresholds_and_idempotency(): void
    {
        foreach ([[15, 15, 100, 'N1'], [15, 0, 0, 'N5'], [20, 16, 80, 'N2'], [25, 20, 80, 'N2'], [20, 4, 20, 'N5'], [20, 5, 25, 'N4'], [20, 9, 45, 'N4'], [20, 10, 50, 'N3'], [20, 13, 65, 'N3'], [20, 14, 70, 'N2'], [20, 17, 85, 'N1'], [101, 25, 2500 / 101, 'N5'], [101, 50, 5000 / 101, 'N4'], [101, 70, 7000 / 101, 'N3'], [101, 85, 8500 / 101, 'N2']] as [$total, $correct, $percentage, $level]) {
            $this->config($total);
            $attempt = $this->start();
            $this->assertFalse($attempt['adaptive']);
            $this->assertCount($total, $attempt['questions']);
            $answers = array_fill_keys(array_column(array_slice($attempt['questions'], 0, $correct), 'id'), 'B');
            $url = '/api/placement/attempts/'.$attempt['id'];
            $result = $this->postJson($url.'/submit', ['answers' => $answers, 'revision' => 0])->assertOk()->assertJsonPath('data.result.recommendation_level', $level)->assertJsonPath('data.result.total', $total)->assertJsonPath('data.result.estimation_label', 'Estimasi Level JLPT')->json('data');
            $this->assertEqualsWithDelta($percentage, $result['result']['percentage'], 0.00000001);
            $this->postJson($url.'/submit', ['answers' => [], 'revision' => 0])->assertOk()->assertJsonPath('data', fn ($actual) => $actual == $result);
        }
    }

    public function test_snapshot_autosave_refresh_stale_save_and_deadline(): void
    {
        $config = $this->config(15);
        $attempt = $this->start();
        $url = '/api/placement/attempts/'.$attempt['id'];
        $id = $attempt['questions'][0]['id'];
        $service = app(PlacementService::class);
        $service->save('placement-questions', ['prompt' => 'Changed', 'correct_option' => 'A', 'status' => 'draft'], $config->questions()->findOrFail($id));
        $copy = $config->questions()->where('status', 'published')->first()->replicate();
        $copy->save();
        $copy->replicate()->save();
        $this->assertCount(16, $this->start()['questions']);
        $this->putJson($url.'/answers', ['answers' => [$id => 'B'], 'revision' => 0])->assertOk()->assertJsonPath('data.revision', 1);
        $this->putJson($url.'/answers', ['answers' => [], 'revision' => 0])->assertConflict();
        $fresh = $this->getJson($url)->assertOk()->assertJsonPath('data.questions.0.prompt', 'Test')->assertJsonPath('data.answers.'.$id, 'B')->json('data');
        $this->assertCount(15, $fresh['questions']);
        foreach (['correct_option', 'grading_snapshot', 'owner_hash', 'explanation'] as $secret) {
            $this->assertStringNotContainsString($secret, json_encode($fresh));
        }
        $this->travel(8)->minutes();
        try {
            $result = $this->getJson($url)->assertOk()->assertJsonPath('data.status', 'completed')->assertJsonPath('data.result.correct', 1)->assertJsonPath('data.result.total', 15)->json('data');
            $this->postJson($url.'/submit', ['answers' => [$id => 'A'], 'revision' => 0])->assertOk()->assertJsonPath('data', fn ($actual) => $actual == $result);
        } finally {
            $this->travelBack();
        }
    }

    public function test_preview_uses_same_bank_and_scoring(): void
    {
        $config = $this->config(15);
        $admin = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $admin->forceFill(['role' => 'admin', 'account_status' => 'active'])->save();
        $attempt = $this->actingAs($admin)->postJson('/api/admin/placement-configs/'.$config->id.'/preview', [])->assertCreated()->json('data');
        $this->assertCount(15, $attempt['questions']);
        $this->postJson('/api/admin/placement-previews/'.$attempt['id'].'/submit', ['answers' => array_fill_keys(array_column($attempt['questions'], 'id'), 'B'), 'revision' => 0])->assertOk()->assertJsonPath('data.result.recommendation_level', 'N1');
    }
}
