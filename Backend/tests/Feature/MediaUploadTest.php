<?php

namespace Tests\Feature;

use App\Models\Chapter;
use App\Models\Program;
use App\Models\User;
use App\Models\VideoLesson;
use App\Services\MediaService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class MediaUploadTest extends TestCase
{
    use DatabaseTransactions;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertNotFalse(getenv('HIRU_TEST_SCHEMA'));
        config(['media.disk' => 'public']);
        Storage::fake('public');
        $this->admin = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $this->admin->forceFill(['role' => 'admin', 'account_status' => 'active'])->save();
    }

    private function image(): UploadedFile
    {
        return UploadedFile::fake()->createWithContent('photo.png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg=='));
    }

    public function test_upload_is_admin_only_and_returns_managed_reference(): void
    {
        $this->post('/api/admin/media', ['kind' => 'image', 'file' => $this->image()], ['Accept' => 'application/json'])->assertUnauthorized();
        $student = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $student->forceFill(['role' => 'student', 'account_status' => 'active'])->save();
        $this->actingAs($student)->post('/api/admin/media', ['kind' => 'image', 'file' => $this->image()], ['Accept' => 'application/json'])->assertForbidden();
        $result = $this->actingAs($this->admin)->post('/api/admin/media', ['kind' => 'image', 'file' => $this->image()], ['Accept' => 'application/json'])->assertCreated()->assertJsonPath('data.mime_type', 'image/png');
        $path = $result->json('data.path');
        $this->assertTrue(app(MediaService::class)->managed($path, 'image'));
        Storage::disk('public')->assertExists($path);
        $this->assertNotEmpty($result->json('data.url'));
        $this->deleteJson('/api/admin/media', ['path' => $path])->assertNoContent();
        Storage::disk('public')->assertMissing($path);
        $this->deleteJson('/api/admin/media', ['path' => '../private.txt'])->assertUnprocessable();
    }

    public function test_audio_and_video_uploads_use_detected_mime(): void
    {
        $wav = 'RIFF'.pack('V', 38).'WAVEfmt '.pack('VvvVVvv', 16, 1, 1, 8000, 16000, 2, 16).'data'.pack('V', 2)."\x00\x00";
        $mp4 = pack('N', 24).'ftypisom'.pack('N', 0).'isommp42';
        foreach (['audio' => ['sound.wav', $wav], 'video' => ['clip.mp4', $mp4]] as $kind => [$name, $content]) {
            $result = $this->actingAs($this->admin)->post('/api/admin/media', ['kind' => $kind, 'file' => UploadedFile::fake()->createWithContent($name, $content)], ['Accept' => 'application/json'])->assertCreated();
            $this->assertTrue(app(MediaService::class)->valid($result->json('data.path'), $kind));
            $this->assertArrayHasKey($result->json('data.mime_type'), MediaService::FORMATS[$kind]);
            Storage::disk('public')->assertExists($result->json('data.path'));
        }
    }

    public function test_mime_spoof_and_configurable_size_are_rejected(): void
    {
        $this->actingAs($this->admin)->post('/api/admin/media', ['kind' => 'video', 'file' => UploadedFile::fake()->createWithContent('evil.mp4', '<?php echo 1;')], ['Accept' => 'application/json'])->assertUnprocessable();
        config(['media.max_kb.image' => 1]);
        $this->post('/api/admin/media', ['kind' => 'image', 'file' => UploadedFile::fake()->create('large.png', 2, 'image/png')], ['Accept' => 'application/json'])->assertUnprocessable();
    }

    public function test_private_disk_never_receives_permanent_url(): void
    {
        config(['media.disk' => 'private_media', 'filesystems.disks.private_media' => ['driver' => 'local', 'root' => storage_path('framework/testing/private-media'), 'serve' => false]]);
        $disk = Storage::fake('private_media');
        $disk->buildTemporaryUrlsUsing(fn ($path, $expires) => 'https://private.example.test/signed?expires='.$expires->getTimestamp());
        $result = $this->actingAs($this->admin)->post('/api/admin/media', ['kind' => 'image', 'file' => $this->image()], ['Accept' => 'application/json'])->assertCreated();
        $this->assertStringContainsString('signed?expires=', $result->json('data.url'));
        $this->assertStringNotContainsString('/storage/', $result->json('data.url'));
    }

    public function test_playable_references_and_optional_media(): void
    {
        $media = app(MediaService::class);
        foreach (['javascript:alert(1)', '//example.test/a.mp4', 'https://user:pass@example.test/a.mp4', 'https://example.test/page', 'https://youtube.com/watch?v=bad', 'media/video/../../a.mp4'] as $url) {
            $this->assertFalse($media->valid($url, 'video'), $url);
        }
        foreach (['https://example.test/a.mp4', 'https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'] as $url) {
            $this->assertTrue($media->valid($url, 'video'), $url);
        }
        $program = Program::create(['code' => 'n5', 'slug' => 'test-n5', 'name' => 'Test N5', 'family' => 'jlpt', 'sort_order' => 0, 'status' => 'active']);
        $chapter = Chapter::create(['program_id' => $program->id, 'chapter_number' => 1, 'title' => 'Test chapter']);
        $this->actingAs($this->admin)->postJson('/api/admin/video-lessons', ['chapter_id' => $chapter->id, 'title' => 'Video'])->assertCreated()->assertJsonPath('data.video_url', null);
        $this->postJson('/api/admin/video-lessons', ['chapter_id' => $chapter->id, 'title' => 'Second'])->assertUnprocessable()->assertJsonValidationErrors('chapter_id');
        $this->postJson('/api/admin/sensei-profiles', ['name' => 'Test', 'role' => 'Sensei', 'bio' => 'Test', 'expertise' => ['N5']])->assertCreated()->assertJsonPath('data.photo', null);
    }

    public function test_database_enforces_one_video_and_migration_preserves_duplicates(): void
    {
        $program = Program::create(['code' => 'n5', 'slug' => 'test-n5', 'name' => 'Test N5', 'family' => 'jlpt', 'sort_order' => 0, 'status' => 'active']);
        $chapter = Chapter::create(['program_id' => $program->id, 'chapter_number' => 1, 'title' => 'Test chapter']);
        VideoLesson::create(['chapter_id' => $chapter->id, 'title' => 'First']);
        try {
            DB::transaction(fn () => VideoLesson::create(['chapter_id' => $chapter->id, 'title' => 'Second']));
            $this->fail('Database accepted a second video.');
        } catch (UniqueConstraintViolationException) {
            $this->assertSame(1, VideoLesson::count());
        }
        DB::statement('ALTER TABLE video_lessons DROP CONSTRAINT video_lessons_chapter_id_unique');
        VideoLesson::create(['chapter_id' => $chapter->id, 'title' => 'Second']);
        $migration = require database_path('migrations/2026_10_07_000018_allow_optional_media_and_one_video_per_chapter.php');
        try {
            $migration->up();
            $this->fail('Migration accepted duplicate chapters.');
        } catch (\RuntimeException $exception) {
            $this->assertStringContainsString('No rows were deleted', $exception->getMessage());
            $this->assertSame(2, VideoLesson::count());
        }
    }

    public function test_delete_preserves_referenced_media_and_resolution(): void
    {
        $result = $this->actingAs($this->admin)->post('/api/admin/media', ['kind' => 'image', 'file' => $this->image()], ['Accept' => 'application/json'])->assertCreated();
        $path = $result->json('data.path');
        $profile = $this->postJson('/api/admin/sensei-profiles', ['name' => 'Test', 'role' => 'Sensei', 'bio' => 'Test', 'expertise' => ['N5'], 'photo' => $path])->assertCreated()->assertJsonPath('data.photo_resolved_url', $result->json('data.url'));
        $this->deleteJson('/api/admin/media', ['path' => $path])->assertStatus(409);
        Storage::disk('public')->assertExists($path);
        $this->patchJson('/api/admin/sensei-profiles/'.$profile->json('data.id'), ['photo' => null])->assertOk();
        $this->deleteJson('/api/admin/media', ['path' => $path])->assertNoContent();
    }
}
