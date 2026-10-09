<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\MediaService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class StudentProfileAvatarTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertNotFalse(getenv('HIRU_TEST_SCHEMA'));
        config(['media.disk' => 'public']);
        Storage::fake('public');
    }

    private function student(): User
    {
        $user = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $user->forceFill(['role' => 'student', 'account_status' => 'active'])->save();

        return $user;
    }

    private function image(string $name = 'photo.png'): UploadedFile
    {
        return UploadedFile::fake()->createWithContent($name, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg=='));
    }

    private function upload(array $extra = [])
    {
        return $this->post('/api/student/profile/avatar', ['file' => $this->image(), ...$extra], ['Accept' => 'application/json']);
    }

    public function test_owner_avatar_persists_replaces_and_deletes_without_affecting_other_student(): void
    {
        $owner = $this->student();
        $other = $this->student();
        $this->actingAs($owner)->getJson('/api/me')->assertOk()->assertJsonPath('data.avatar', null)->assertJsonPath('data.avatar_resolved_url', null);
        $first = $this->upload()->assertOk();
        $old = $first->json('data.avatar');
        $this->assertTrue(app(MediaService::class)->managed($old, 'image'));
        $this->getJson('/api/me')->assertOk()->assertJsonPath('data.avatar', $old)->assertJsonPath('data.avatar_resolved_url', $first->json('data.avatar_resolved_url'));
        Storage::disk('public')->assertExists($old);
        $next = $this->upload()->assertOk()->json('data.avatar');
        $this->assertNotSame($old, $next);
        Storage::disk('public')->assertMissing($old);
        Storage::disk('public')->assertExists($next);
        $this->assertNull($other->refresh()->avatar);
        $this->deleteJson('/api/student/profile/avatar')->assertOk()->assertJsonPath('data.avatar', null)->assertJsonPath('data.avatar_resolved_url', null);
        Storage::disk('public')->assertMissing($next);
    }

    public function test_endpoint_guards_and_arbitrary_references_are_rejected(): void
    {
        $this->upload()->assertUnauthorized();
        $owner = $this->student();
        $this->actingAs($owner);
        foreach (['path' => 'media/image/manual.png', 'url' => 'https://example.test/a.png', 'user_id' => $this->student()->id, 'avatar' => 'manual.png'] as $key => $value) {
            $this->upload([$key => $value])->assertUnprocessable();
        }
        $this->patchJson('/api/me', ['avatar' => 'https://example.test/a.png'])->assertUnprocessable()->assertJsonValidationErrors('avatar');
        $this->post('/api/admin/media', ['kind' => 'image', 'file' => $this->image()], ['Accept' => 'application/json'])->assertForbidden();
        $owner->forceFill(['account_status' => 'inactive'])->save();
        $this->actingAs($owner);
        $this->upload()->assertUnauthorized();
        $owner->forceFill(['account_status' => 'active', 'role' => 'admin'])->save();
        $this->actingAs($owner);
        $this->upload()->assertForbidden();
        $this->deleteJson('/api/student/profile/avatar')->assertForbidden();
    }

    public function test_invalid_upload_preserves_current_avatar_and_configured_limit(): void
    {
        $owner = $this->student();
        $this->actingAs($owner);
        $old = $this->upload()->assertOk()->json('data.avatar');
        foreach ([$this->image('spoof.jpg'), UploadedFile::fake()->createWithContent('bad.png', '<?php echo 1;')] as $file) {
            $this->post('/api/student/profile/avatar', ['file' => $file], ['Accept' => 'application/json'])->assertUnprocessable();
        }
        config(['media.max_kb.image' => 1]);
        $this->post('/api/student/profile/avatar', ['file' => UploadedFile::fake()->create('large.png', 2, 'image/png')], ['Accept' => 'application/json'])->assertUnprocessable();
        $this->assertSame($old, $owner->refresh()->avatar);
        Storage::disk('public')->assertExists($old);
    }

    public function test_central_delete_keeps_referenced_avatar(): void
    {
        $owner = $this->student();
        $this->actingAs($owner);
        $path = $this->upload()->assertOk()->json('data.avatar');
        $admin = $this->student();
        $admin->forceFill(['role' => 'admin'])->save();
        $this->actingAs($admin)->deleteJson('/api/admin/media', ['path' => $path])->assertStatus(409);
        Storage::disk('public')->assertExists($path);
    }
}
