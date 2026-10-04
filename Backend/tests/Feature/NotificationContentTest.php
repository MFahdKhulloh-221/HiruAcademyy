<?php

namespace Tests\Feature;

use App\Models\AccessGrant;
use App\Models\NotificationContent;
use App\Models\NotificationRead;
use App\Models\Program;
use App\Models\User;
use App\Services\NotificationService;
use Carbon\CarbonImmutable;
use Database\Seeders\ProgramOfferSeeder;
use Database\Seeders\ProgramSeeder;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class NotificationContentTest extends TestCase
{
    use DatabaseTransactions;

    private User $admin;

    private User $student;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->assertSame('hiru_academy_test', DB::connection()->getDatabaseName());
        $this->travelTo(CarbonImmutable::parse('2026-10-04T12:00:00Z'));
        $this->seed([ProgramSeeder::class, ProgramOfferSeeder::class]);
        $this->admin = $this->user('admin');
        $this->student = $this->user('student');
        Mail::fake();
        Notification::fake();
        Bus::fake();
    }

    protected function tearDown(): void
    {
        Mail::assertNothingSent();
        Mail::assertNothingQueued();
        Notification::assertNothingSent();
        Bus::assertNothingDispatched();
        $this->travelBack();
        parent::tearDown();
    }

    private function user(string $role): User
    {
        $user = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $user->forceFill(['role' => $role, 'account_status' => 'active'])->save();

        return $user;
    }

    private function payload(array $overrides = []): array
    {
        return array_replace(['type' => 'Pengumuman', 'title' => 'Fixture notification', 'body' => 'Fixture body'], $overrides);
    }

    private function content(array $overrides = []): NotificationContent
    {
        return app(NotificationService::class)->save($this->payload(['status' => 'published', ...$overrides]));
    }

    private function grant(string $code, string $plan, array $overrides = []): AccessGrant
    {
        return AccessGrant::create(array_replace([
            'user_id' => $this->student->id,
            'program_id' => Program::where('code', $code)->firstOrFail()->id,
            'plan_code' => $plan, 'status' => 'active',
            'starts_at' => '2026-10-01', 'ends_at' => '2026-10-31',
        ], $overrides));
    }

    private function visibleIds(): array
    {
        return array_column($this->getJson('/api/student/notifications')->assertOk()->json('data'), 'id');
    }

    public function test_admin_crud_and_metadata_only_time(): void
    {
        $this->actingAs($this->admin);
        $url = '/api/admin/notifications';
        $created = $this->postJson($url, $this->payload())->assertCreated()
            ->assertJsonPath('data.status', 'draft')->assertJsonPath('data.preset', 'None')
            ->assertJsonPath('data.path', null)->assertJsonPath('data.cta_label', null);
        $id = $created->json('data.id');
        $this->getJson($url)->assertOk()->assertJsonFragment(['id' => $id]);
        $this->getJson($url.'/'.$id)->assertOk();
        $this->patchJson($url.'/'.$id, ['preset' => 'chapter', 'cta_label' => 'Fixture CTA', 'status' => 'published', 'time' => '2099-01-01T10:00:00+07:00'])
            ->assertOk()->assertJsonPath('data.path', '/learn/n4/chapter-4');
        $this->assertTrue(NotificationContent::findOrFail($id)->time->equalTo(CarbonImmutable::parse('2099-01-01T03:00:00Z')));
        $this->actingAs($this->student);
        $this->assertContains($id, $this->visibleIds());
        $this->actingAs($this->admin);
        $this->patchJson($url.'/'.$id, ['preset' => 'None'])->assertOk()
            ->assertJsonPath('data.path', null)->assertJsonPath('data.cta_label', null);
        $this->deleteJson($url.'/'.$id)->assertNoContent();
        $this->getJson($url.'/'.$id)->assertNotFound();
        $this->patchJson($url.'/'.$id, ['title' => 'Missing'])->assertNotFound();
        $this->deleteJson($url.'/'.$id)->assertNotFound();
        $this->getJson('/api/public/notifications')->assertNotFound();
    }

    public function test_auth_and_role_boundaries(): void
    {
        $content = $this->content();
        $admin = '/api/admin/notifications';
        $student = '/api/student/notifications';
        $adminRequests = [['GET', $admin], ['POST', $admin], ['GET', $admin.'/'.$content->id], ['PATCH', $admin.'/'.$content->id], ['DELETE', $admin.'/'.$content->id]];
        $studentRequests = [['GET', $student], ['PATCH', $student.'/'.$content->id.'/read'], ['POST', $student.'/read-all']];
        foreach ([...$adminRequests, ...$studentRequests] as [$method, $url]) {
            $this->json($method, $url, [])->assertUnauthorized();
        }
        $this->actingAs($this->student);
        foreach ($adminRequests as [$method, $url]) {
            $this->json($method, $url, $this->payload())->assertForbidden();
        }
        $this->actingAs($this->admin);
        foreach ($studentRequests as [$method, $url]) {
            $this->json($method, $url, ['read' => true])->assertForbidden();
        }
        foreach ([[$this->admin, $adminRequests], [$this->student, $studentRequests]] as [$user, $requests]) {
            $user->forceFill(['account_status' => 'inactive'])->save();
            foreach ($requests as [$method, $url]) {
                $this->actingAs($user)->json($method, $url, [])->assertUnauthorized();
            }
        }
        $this->assertNotNull($content->fresh());
        $this->assertSame(0, NotificationRead::count());
    }

    public static function unsafePaths(): array
    {
        return array_map(fn ($path) => [$path], [
            '//evil.test', '/\\evil.test', 'https://evil.test', 'javascript:alert(1)',
            '/user@evil.test', '/foo bar', "/foo\nbar", "/foo\0bar", '/a/../b', '/./a',
            '/%2f%2fevil.test', '/%5cevil.test', '/%2e%2e/a', '/%252e%252e/a',
            '/%25252f%25252fevil.test', '/%ZZ', '/foo?next=https://evil.test',
            '/foo#//evil.test', '/foo//bar', '/foo:bar', '/%0aevil', '/%40evil.test',
        ]);
    }

    #[DataProvider('unsafePaths')]
    public function test_custom_rejects_unsafe_and_encoded_destinations(string $path): void
    {
        $this->actingAs($this->admin)->postJson('/api/admin/notifications', $this->payload([
            'preset' => 'custom', 'path' => $path, 'cta_label' => 'Fixture CTA',
        ]))->assertUnprocessable()->assertJsonValidationErrors('path');
    }

    public function test_presets_custom_updates_and_strict_fields(): void
    {
        $this->actingAs($this->admin);
        $url = '/api/admin/notifications';
        foreach (NotificationService::PRESETS as $preset => $path) {
            $input = $this->payload(['preset' => $preset]);
            if ($preset !== 'None') {
                $input['cta_label'] = 'Fixture CTA';
            }
            if ($preset === 'custom') {
                $path = $input['path'] = '/learn/n4/chapter-4';
            }
            $id = $this->postJson($url, $input)->assertCreated()->assertJsonPath('data.path', $path)->json('data.id');
            if ($preset === 'custom') {
                $this->patchJson($url.'/'.$id, ['title' => 'Edited'])->assertOk()->assertJsonPath('data.path', $path);
                $this->patchJson($url.'/'.$id, ['path' => '/%252f%252fevil.test'])->assertUnprocessable();
            } elseif ($preset !== 'None') {
                $this->patchJson($url.'/'.$id, ['path' => '/arbitrary'])->assertUnprocessable();
                $this->patchJson($url.'/'.$id, ['cta_label' => null])->assertUnprocessable();
            }
        }
        foreach ([['type' => 'Class'], ['audience' => 'user'], ['level' => 'n1'], ['status' => 'scheduled'],
            ['preset' => 'new-preset'], ['time' => '2026-10-04T12:00:00'], ['time' => 'not-date'],
            ['preset' => 'None', 'path' => '/schedule'], ['preset' => 'None', 'cta_label' => 'CTA'],
            ['preset' => 'schedule'], ['user_id' => $this->student->id], ['send_at' => '2099-01-01T00:00:00Z']] as $invalid) {
            $this->postJson($url, $this->payload($invalid))->assertUnprocessable();
        }
        foreach (NotificationService::TYPES as $type) {
            $this->postJson($url, $this->payload(['type' => $type]))->assertCreated();
        }
    }

    public function test_audiences_exact_source_levels_union_and_inactive_grants(): void
    {
        $items = [];
        foreach (NotificationService::AUDIENCES as $audience) {
            foreach ([null, 'n5', 'n4', 'n3', 'n2'] as $level) {
                $items[$audience][$level ?? 'none'] = $this->content(compact('audience', 'level'))->id;
            }
        }
        $draft = $this->content(['status' => 'draft']);
        $this->actingAs($this->student);
        $this->assertEqualsCanonicalizing([$items['All']['none'], $items['Free']['none']], $this->visibleIds());
        foreach ([['status' => 'inactive'], ['starts_at' => '2026-11-01', 'ends_at' => '2026-11-30'], ['ends_at' => '2026-10-03']] as $overrides) {
            $grant = $this->grant('n4', 'sensei', $overrides);
            $this->assertEqualsCanonicalizing([$items['All']['none'], $items['Free']['none']], $this->visibleIds());
            $grant->delete();
        }
        $lms = $this->grant('n4', 'lms');
        $this->assertEqualsCanonicalizing([$items['All']['none'], $items['All']['n4'], $items['Mandiri']['none'], $items['Mandiri']['n4']], $this->visibleIds());
        $sensei = $this->grant('n3', 'sensei');
        $this->grant('n3', 'sensei');
        $ids = $this->visibleIds();
        $this->assertEqualsCanonicalizing([$items['All']['none'], $items['All']['n4'], $items['All']['n3'],
            $items['Mandiri']['none'], $items['Mandiri']['n4'], $items['Sensei']['none'], $items['Sensei']['n3']], $ids);
        $this->assertSame(count($ids), count(array_unique($ids)));
        $this->assertNotContains($draft->id, $ids);
        $lms->delete();
        $sensei->delete();
        AccessGrant::where('user_id', $this->student->id)->delete();
        $this->grant('ssw-food', 'lms');
        $this->assertEqualsCanonicalizing([$items['All']['none'], $items['Mandiri']['none']], $this->visibleIds());
    }

    public function test_own_read_unread_bulk_isolation_and_forbidden_fields(): void
    {
        $visible = $this->content(['preset' => 'schedule', 'cta_label' => 'Fixture CTA']);
        $second = $this->content();
        $draft = $this->content(['status' => 'draft']);
        $hidden = $this->content(['audience' => 'Sensei']);
        $other = $this->user('student');
        $url = '/api/student/notifications/'.$visible->id.'/read';
        $this->actingAs($this->student);
        $this->patchJson($url, ['read' => true])->assertOk()->assertJsonPath('data.read', true);
        $readAt = NotificationRead::where('user_id', $this->student->id)->firstOrFail()->read_at;
        $this->assertTrue($readAt->equalTo(now()->utc()));
        $this->travel(1)->minutes();
        $this->patchJson($url, ['read' => true])->assertOk();
        $this->assertTrue(NotificationRead::where('user_id', $this->student->id)->firstOrFail()->read_at->equalTo($readAt));
        $this->actingAs($other)->getJson('/api/student/notifications')->assertOk()->assertJsonFragment(['id' => $visible->id, 'read' => false]);
        $this->postJson('/api/student/notifications/read-all', [])->assertNoContent();
        $this->actingAs($this->student)->patchJson($url, ['read' => false])->assertOk()->assertJsonPath('data.read', false);
        $this->assertSame(2, NotificationRead::where('user_id', $other->id)->count());
        foreach (['user_id' => $other->id, 'notification_content_id' => $second->id, 'read_at' => '2099-01-01'] as $field => $value) {
            $this->patchJson($url, ['read' => true, $field => $value])->assertUnprocessable();
            $this->postJson('/api/student/notifications/read-all', [$field => $value])->assertUnprocessable();
        }
        $this->patchJson($url, [])->assertUnprocessable();
        $this->patchJson($url, ['read' => 'yes'])->assertUnprocessable();
        foreach ([$draft->id, $hidden->id, 9223372036854775807] as $id) {
            $this->patchJson('/api/student/notifications/'.$id.'/read', ['read' => true])->assertNotFound();
        }
        $this->postJson('/api/student/notifications/read-all', [])->assertNoContent();
        $this->postJson('/api/student/notifications/read-all', [])->assertNoContent();
        $this->assertSame(2, NotificationRead::where('user_id', $this->student->id)->count());
        $this->assertSame('/schedule', $visible->fresh()->path);
        $this->assertSame(0, NotificationRead::whereIn('notification_content_id', [$draft->id, $hidden->id])->count());
        $this->actingAs($this->admin)->deleteJson('/api/admin/notifications/'.$visible->id)->assertNoContent();
        $this->assertSame(0, NotificationRead::where('notification_content_id', $visible->id)->count());
    }
}
