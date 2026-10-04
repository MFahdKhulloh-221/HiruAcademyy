<?php

namespace Tests\Feature;

use App\Models\PlacementAttempt;
use App\Models\PlacementConfig;
use App\Models\PlacementQuestion;
use App\Models\User;
use App\Services\PlacementService;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Cache\LockProvider;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PlacementTest extends TestCase
{
    use DatabaseTransactions;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->assertSame('pgsql', DB::connection()->getDriverName());
        $this->assertSame('hiru_academy_test', DB::connection()->getDatabaseName());
        $this->travelTo(CarbonImmutable::parse('2026-10-04T12:00:00Z'));
        $this->admin = $this->user('admin');
    }

    protected function tearDown(): void
    {
        $this->travelBack();
        parent::tearDown();
    }

    private function user(string $role, string $status = 'active'): User
    {
        $user = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $user->forceFill(['role' => $role, 'account_status' => $status])->save();

        return $user;
    }

    private function configInput(): array
    {
        return ['title' => 'Fixture placement', 'intro_heading' => 'Fixture intro', 'duration_minutes' => 7, 'description' => 'Fixture description'];
    }

    private function questionInput(int $id, array $changes = []): array
    {
        return array_replace(['placement_config_id' => $id, 'prompt' => 'Fixture prompt', 'options' => ['A' => 'First', 'B' => 'Second', 'C' => 'Third', 'D' => 'Fourth'], 'correct_option' => 'B', 'category' => 'Bunpou', 'status' => 'published', 'explanation' => 'Hidden explanation'], $changes);
    }

    private function published(int $count = 3): PlacementConfig
    {
        $service = app(PlacementService::class);
        $config = $service->save('placement-configs', $this->configInput());
        for ($i = 0; $i < $count; $i++) {
            $service->save('placement-questions', $this->questionInput($config->id, ['sort_order' => $i + 1, 'category' => PlacementService::CATEGORIES[$i % 4]]));
        }
        $service->save('placement-questions', $this->questionInput($config->id, ['status' => 'draft']));

        return $service->save('placement-configs', ['status' => 'published'], $config);
    }

    private function applicant(): array
    {
        return ['name' => 'Fixture applicant', 'whatsapp' => '+62 81234567890', 'target' => 'N3', 'privacy' => true, 'whatsappConsent' => false];
    }

    private function start(): array
    {
        return $this->postJson('/api/placement/attempts', $this->applicant())->assertCreated()->json('data');
    }

    private function assertNoSecrets(array $payload): void
    {
        $json = json_encode($payload, JSON_THROW_ON_ERROR);
        foreach (['correct_option', 'explanation', 'grading_snapshot', 'owner_hash', 'applicant_snapshot', 'whatsapp', 'Fixture applicant'] as $secret) {
            $this->assertStringNotContainsString($secret, $json);
        }
    }

    public function test_start_route_blocks_session_and_sequential_guests_keep_access(): void
    {
        $route = app('router')->getRoutes()->match(Request::create('/api/placement/attempts', 'POST'));
        $this->assertGreaterThan(0, $route->locksFor());
        $this->assertNotSame('cookie', config('session.driver'));
        $store = app('cache')->store(config('session.block_store'));
        $this->assertInstanceOf(LockProvider::class, $store->getStore());
        $lock = $store->lock('placement_test_'.bin2hex(random_bytes(16)), 10);
        $this->assertTrue($lock->get());
        $this->assertTrue($lock->release());
        $this->published(1);
        $first = $this->start();
        $owner = session('placement_owner');
        $second = $this->start();
        $this->assertSame($owner, session('placement_owner'));
        $this->assertNotSame($first['id'], $second['id']);
        foreach ([$first, $second] as $attempt) {
            $this->getJson('/api/placement/attempts/'.$attempt['id'])->assertOk()->assertJsonPath('data.id', $attempt['id']);
            $this->assertSame(hash('sha256', $owner), PlacementAttempt::findOrFail($attempt['id'])->owner_hash);
        }
    }

    public function test_admin_crud_publishing_and_last_question_guard(): void
    {
        $this->actingAs($this->admin);
        $base = '/api/admin/placement-configs';
        $config = $this->postJson($base, $this->configInput())->assertCreated()->assertJsonPath('data.status', 'draft')->json('data');
        $this->getJson($base)->assertOk()->assertJsonFragment(['id' => $config['id']]);
        $this->getJson($base.'/'.$config['id'])->assertOk()->assertJsonPath('data', fn ($actual) => $actual == $config);
        $this->patchJson($base.'/'.$config['id'], ['status' => 'published'])->assertUnprocessable();
        $qbase = '/api/admin/placement-questions';
        $question = $this->postJson($qbase, $this->questionInput($config['id']))->assertCreated()->assertJsonPath('data.correct_option', 'B')->json('data');
        $this->getJson($qbase)->assertOk()->assertJsonFragment(['id' => $question['id']]);
        $this->getJson($qbase.'/'.$question['id'])->assertOk()->assertJsonPath('data.explanation', 'Hidden explanation');
        $this->patchJson($qbase.'/'.$question['id'], ['options' => ['A' => 'Changed', 'B' => 'Second', 'C' => 'Third', 'D' => 'Fourth']])->assertOk()->assertJsonPath('data.options.A', 'Changed');
        $this->patchJson($base.'/'.$config['id'], ['title' => 'Changed', 'status' => 'published'])->assertOk();
        $this->patchJson($qbase.'/'.$question['id'], ['status' => 'draft'])->assertUnprocessable();
        $this->deleteJson($qbase.'/'.$question['id'])->assertUnprocessable();
        $this->patchJson($base.'/'.$config['id'], ['status' => 'draft'])->assertOk();
        $this->deleteJson($qbase.'/'.$question['id'])->assertNoContent();
        $this->deleteJson($base.'/'.$config['id'])->assertNoContent();
        foreach ([$base, $qbase] as $url) {
            $this->getJson($url.'/9223372036854775808')->assertNotFound();
            $this->getJson($url.'/999999999')->assertNotFound();
            $this->patchJson($url.'/999999999', [])->assertNotFound();
        }
    }

    public function test_admin_auth_all_operations(): void
    {
        foreach (['placement-configs', 'placement-questions'] as $resource) {
            foreach ([['GET', ''], ['POST', ''], ['GET', '/1'], ['PATCH', '/1'], ['DELETE', '/1']] as [$method, $suffix]) {
                auth('web')->logout();
                $url = '/api/admin/'.$resource.$suffix;
                $this->json($method, $url)->assertUnauthorized();
                $this->actingAs($this->user('student'))->json($method, $url)->assertForbidden();
                $this->actingAs($this->user('admin', 'inactive'))->json($method, $url)->assertUnauthorized();
            }
        }
    }

    public function test_strict_fields_options_categories_and_media(): void
    {
        $config = $this->published();
        $this->actingAs($this->admin);
        foreach ([['duration_minutes' => 0], ['status' => 'active'], ['internal' => true]] as $change) {
            $this->patchJson('/api/admin/placement-configs/'.$config->id, $change)->assertUnprocessable();
        }
        foreach ([['options' => ['A' => 'Only']], ['options' => ['A' => '', 'B' => 'B', 'C' => 'C', 'D' => 'D']], ['options' => ['A' => 'A', 'B' => 'B', 'C' => 'C', 'D' => 'D', 'E' => 'E']], ['correct_option' => 'E'], ['category' => 'Moji Goi'], ['sort_order' => 0], ['score' => 100], ['placement_config_id' => 999999999]] as $change) {
            $this->postJson('/api/admin/placement-questions', $this->questionInput($config->id, $change))->assertUnprocessable();
        }
        foreach (['javascript:alert(1)', 'data:audio/mp3;base64,AAAA', 'https://user:password@example.test/file', '../secret', '%252e%252e/secret', '//example.test/file', 'folder\\secret'] as $reference) {
            foreach (['image_url', 'audio_url'] as $field) {
                $this->postJson('/api/admin/placement-questions', $this->questionInput($config->id, [$field => $reference]))->assertUnprocessable();
            }
        }
        foreach (PlacementService::CATEGORIES as $category) {
            $this->postJson('/api/admin/placement-questions', $this->questionInput($config->id, ['category' => $category, 'image_url' => 'public/placement.png', 'audio_url' => 'https://example.test/placement.mp3']))->assertCreated();
        }
    }

    public function test_public_only_published_and_sanitized(): void
    {
        $this->getJson('/api/placement')->assertNotFound();
        $config = $this->published();
        app(PlacementService::class)->save('placement-configs', $this->configInput());
        $response = $this->getJson('/api/placement')->assertOk()->assertJsonPath('data.id', $config->id);
        $this->assertCount(3, $response->json('data.questions'));
        $this->assertSame(['id', 'title', 'intro_heading', 'duration_minutes', 'description', 'questions'], array_keys($response->json('data')));
        $this->assertNoSecrets($response->json());
        $question = $config->questions()->firstOrFail();
        $this->assertArrayNotHasKey('correct_option', $question->toArray());
        $this->assertArrayNotHasKey('explanation', $question->toArray());
    }

    public function test_required_applicant_and_optional_whatsapp_consent_without_effects(): void
    {
        $this->published();
        foreach (['name', 'whatsapp', 'target', 'privacy'] as $field) {
            $input = $this->applicant();
            unset($input[$field]);
            $this->postJson('/api/placement/attempts', $input)->assertUnprocessable();
        }
        foreach ([['privacy' => false], ['target' => 'N6'], ['whatsapp' => 'javascript:alert(1)'], ['whatsappConsent' => 'yes'], ['user_id' => 1], ['score' => 100]] as $change) {
            $this->postJson('/api/placement/attempts', array_replace($this->applicant(), $change))->assertUnprocessable();
        }
        $input = $this->applicant();
        unset($input['whatsappConsent']);
        $attempt = $this->postJson('/api/placement/attempts', $input)->assertCreated()->json('data');
        $stored = PlacementAttempt::findOrFail($attempt['id']);
        $this->assertFalse($stored->applicant_snapshot['whatsappConsent']);
        $this->assertNull($stored->user_id);
        $this->assertSame(64, strlen($stored->owner_hash));
        $this->assertNoSecrets($attempt);
        $undecided = $this->postJson('/api/placement/attempts', array_replace($this->applicant(), ['target' => 'Belum menentukan']))->assertCreated()->json('data');
        $this->assertSame('Belum menentukan', PlacementAttempt::findOrFail($undecided['id'])->applicant_snapshot['target']);
    }

    public function test_guest_isolation_unknown_ids_and_student_ownership(): void
    {
        $this->published();
        $attempt = $this->start();
        $url = '/api/placement/attempts/'.$attempt['id'];
        $this->getJson($url)->assertOk();
        $owner = session('placement_owner');
        $this->withSession(['placement_owner' => bin2hex(random_bytes(32))]);
        $this->getJson($url)->assertNotFound();
        $this->postJson($url.'/submit', ['answers' => []])->assertNotFound();
        $this->putJson($url.'/answers', ['answers' => []])->assertNotFound();
        $this->getJson('/api/placement/attempts/999999999')->assertNotFound();
        $this->getJson('/api/placement/attempts/9223372036854775808')->assertNotFound();
        $this->withSession(['placement_owner' => $owner]);
        $student = $this->user('student');
        $this->actingAs($student)->getJson($url)->assertOk();
        $owned = $this->start();
        $ownedUrl = '/api/placement/attempts/'.$owned['id'];
        $this->actingAs($this->user('student'))->getJson($ownedUrl)->assertNotFound();
        $this->postJson($ownedUrl.'/submit', ['answers' => []])->assertNotFound();
        $this->putJson($ownedUrl.'/answers', ['answers' => []])->assertNotFound();
        $this->actingAs($student)->getJson($ownedUrl)->assertOk();
        $this->actingAs($this->admin)->postJson('/api/placement/attempts', $this->applicant())->assertForbidden();
        $this->getJson($url)->assertForbidden();
        $this->actingAs($this->user('student', 'inactive'))->postJson('/api/placement/attempts', $this->applicant())->assertForbidden();
    }

    public function test_snapshot_deadline_server_grade_late_submit_and_idempotency(): void
    {
        DB::statement("SET LOCAL TIME ZONE 'Asia/Jakarta'");
        $config = $this->published();
        $attempt = $this->start();
        $url = '/api/placement/attempts/'.$attempt['id'];
        $ids = array_column($attempt['questions'], 'id');
        $this->assertSame('2026-10-04T12:00:00.000000Z', $attempt['started_at']);
        $this->assertSame('2026-10-04T12:07:00.000000Z', $attempt['expires_at']);
        $service = app(PlacementService::class);
        $service->save('placement-questions', ['correct_option' => 'A', 'prompt' => 'New prompt'], PlacementQuestion::findOrFail($ids[0]));
        $service->save('placement-configs', ['duration_minutes' => 12, 'status' => 'draft'], $config);
        $saved = [$ids[0] => 'B', $ids[1] => 'A'];
        $attempt = $this->putJson($url.'/answers', ['answers' => $saved])->assertOk()->json('data');
        $this->travel(8)->minutes();
        $this->getJson($url)->assertOk()->assertJsonPath('data', fn ($actual) => $actual == $attempt);
        $this->putJson($url.'/answers', ['answers' => [$ids[0] => 'A', $ids[1] => 'B', $ids[2] => 'B']])->assertConflict();
        foreach ([['answers' => [$ids[0] => 'E']], ['answers' => ['999999999' => 'A']], ['answers' => [$ids[0] => ['correct_option' => 'B']]], ['answers' => [], 'score' => 100], ['answers' => [], 'correct_option' => 'B'], ['answers' => [], 'is_correct' => true]] as $input) {
            $this->postJson($url.'/submit', $input)->assertUnprocessable();
        }
        $result = $this->postJson($url.'/submit', ['answers' => [$ids[0] => 'A', $ids[1] => 'B', $ids[2] => 'B']])->assertOk()
            ->assertJsonPath('data.answers', fn ($actual) => $actual == $saved)
            ->assertJsonPath('data.result.correct', 1)
            ->assertJsonPath('data.result.wrong', 1)
            ->assertJsonPath('data.result.unanswered', 1)
            ->assertJsonPath('data.result.total', 3)
            ->assertJsonPath('data.result.percentage', 33)
            ->assertJsonPath('data.result.recommendation_level', null)
            ->assertJsonPath('data.completed_at', '2026-10-04T12:08:00.000000Z')
            ->assertJsonPath('data.questions.0.prompt', 'Fixture prompt')->json('data');
        $this->assertNoSecrets($result);
        $this->postJson($url.'/submit', ['answers' => []])->assertOk()->assertJsonPath('data', fn ($actual) => $actual == $result);
        $this->postJson($url.'/submit', ['answers' => [$ids[0] => 'A', $ids[1] => 'B', $ids[2] => 'B']])->assertOk()->assertJsonPath('data', fn ($actual) => $actual == $result);
        $this->getJson($url)->assertOk()->assertJsonPath('data', fn ($actual) => $actual == $result);
        $this->assertNoSecrets(PlacementAttempt::findOrFail($attempt['id'])->toArray());
        $this->actingAs($this->admin)->deleteJson('/api/admin/placement-configs/'.$config->id)->assertUnprocessable();
    }

    public function test_answer_save_is_refresh_safe_strict_and_deadline_bound(): void
    {
        $this->published(1);
        $attempt = $this->start();
        $url = '/api/placement/attempts/'.$attempt['id'];
        $id = $attempt['questions'][0]['id'];
        foreach ([[], ['answers' => [$id => 'E']], ['answers' => [999999999 => 'A']], ['answers' => [$id => ['correct_option' => 'B']]], ['answers' => [], 'score' => 100], ['answers' => [], 'privacy' => true], ['answers' => [], 'correct_option' => 'B'], ['answers' => [], 'is_correct' => true]] as $input) {
            $this->putJson($url.'/answers', $input)->assertUnprocessable();
        }
        $this->travelTo(CarbonImmutable::parse($attempt['expires_at'])->subSecond());
        $saved = $this->putJson($url.'/answers', ['answers' => [$id => 'B']])->assertOk()
            ->assertJsonPath('data.answers.'.$id, 'B')->json('data');
        $this->assertNoSecrets($saved);
        $this->getJson($url)->assertOk()->assertJsonPath('data', fn ($actual) => $actual == $saved);
        $this->travelTo(CarbonImmutable::parse($attempt['expires_at']));
        $this->putJson($url.'/answers', ['answers' => [$id => 'A']])->assertConflict();
        $completed = $this->postJson($url.'/submit', ['answers' => []])->assertOk()
            ->assertJsonPath('data.answers.'.$id, 'B')->assertJsonPath('data.result.correct', 1)->json('data');
        $this->putJson($url.'/answers', ['answers' => [$id => 'A']])->assertConflict();
        $this->postJson($url.'/submit', ['answers' => [$id => 'A']])->assertOk()->assertJsonPath('data', fn ($actual) => $actual == $completed);
    }

    public function test_expired_unsaved_answers_cannot_earn_score(): void
    {
        $this->published(1);
        $attempt = $this->start();
        $id = $attempt['questions'][0]['id'];
        $this->travelTo(CarbonImmutable::parse($attempt['expires_at']));
        $this->postJson('/api/placement/attempts/'.$attempt['id'].'/submit', ['answers' => [$id => 'B']])->assertOk()
            ->assertJsonPath('data.answers', [])
            ->assertJsonPath('data.result.correct', 0)
            ->assertJsonPath('data.result.unanswered', 1);
    }

    public function test_manual_submit_wins_and_stale_autosave_cannot_change_result(): void
    {
        $this->published(1);
        $attempt = $this->start();
        $url = '/api/placement/attempts/'.$attempt['id'];
        $id = $attempt['questions'][0]['id'];
        $this->putJson($url.'/answers', ['answers' => [$id => 'A']])->assertOk();
        $manual = $this->postJson($url.'/submit', ['answers' => [$id => 'B']])->assertOk()
            ->assertJsonPath('data.answers.'.$id, 'B')->assertJsonPath('data.result.correct', 1)->json('data');
        $this->putJson($url.'/answers', ['answers' => [$id => 'A']])->assertConflict();
        $this->travelTo(CarbonImmutable::parse($attempt['expires_at']));
        $this->postJson($url.'/submit', ['answers' => []])->assertOk()->assertJsonPath('data', fn ($actual) => $actual == $manual);
        $this->getJson($url)->assertOk()->assertJsonPath('data', fn ($actual) => $actual == $manual);
    }

    public function test_empty_answers_are_all_unanswered(): void
    {
        $this->published(1);
        $attempt = $this->start();
        $this->postJson('/api/placement/attempts/'.$attempt['id'].'/submit', ['answers' => []])->assertOk()
            ->assertJsonPath('data.result.correct', 0)
            ->assertJsonPath('data.result.wrong', 0)
            ->assertJsonPath('data.result.unanswered', 1)
            ->assertJsonPath('data.result.total', 1)
            ->assertJsonPath('data.result.percentage', 0)
            ->assertJsonPath('data.result.recommendation_level', null);
    }

    public function test_model_and_database_snapshot_and_completion_guards(): void
    {
        $this->published(1);
        $data = $this->start();
        $attempt = PlacementAttempt::findOrFail($data['id']);
        foreach (['content_snapshot' => [], 'grading_snapshot' => [], 'expires_at' => now()->addHour(), 'owner_hash' => str_repeat('a', 64)] as $field => $value) {
            try {
                $attempt->fresh()->update([$field => $value]);
                $this->fail('Expected immutable model guard.');
            } catch (\LogicException $exception) {
                $this->assertStringContainsString('immutable', $exception->getMessage());
            }
        }
        foreach (['content_snapshot' => '[]', 'owner_hash' => str_repeat('b', 64)] as $field => $value) {
            $this->assertDatabaseRejects(fn () => DB::table('placement_attempts')->where('id', $attempt->id)->update([$field => $value]));
        }
        $this->postJson('/api/placement/attempts/'.$attempt->id.'/submit', ['answers' => []])->assertOk();
        $this->assertDatabaseRejects(fn () => DB::table('placement_attempts')->where('id', $attempt->id)->update(['answers' => '{}']));
        $this->assertDatabaseRejects(fn () => DB::table('placement_attempts')->where('id', $attempt->id)->delete());
        try {
            $attempt->fresh()->update(['status' => 'in_progress']);
            $this->fail('Expected completed model guard.');
        } catch (\LogicException $exception) {
            $this->assertStringContainsString('immutable', $exception->getMessage());
        }
    }

    private function assertDatabaseRejects(callable $operation): void
    {
        try {
            DB::transaction($operation);
            $this->fail('Expected database guard.');
        } catch (QueryException $exception) {
            $this->assertNotEmpty($exception->getMessage());
        }
    }
}
