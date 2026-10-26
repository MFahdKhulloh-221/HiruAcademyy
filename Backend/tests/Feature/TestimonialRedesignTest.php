<?php

namespace Tests\Feature;

use App\Models\Testimonial;
use App\Models\User;
use App\Services\MediaService;
use App\Services\PublicContentService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class TestimonialRedesignTest extends TestCase
{
    use DatabaseTransactions;

    private function user(string $role = 'student'): User
    {
        $user = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $user->forceFill(['role' => $role, 'account_status' => 'active'])->save();
        return $user;
    }

    private function video(): array
    {
        return ['type' => 'video', 'context' => 'JLPT N5', 'title' => 'Video fixture', 'video_url' => 'https://youtu.be/dQw4w9WgXcQ', 'video_thumbnail' => 'https://example.test/thumb.png', 'consent_public' => true];
    }

    public function test_independent_types_approval_channels_stale_updates_and_owner_lock(): void
    {
        $student = $this->user();
        $text = ['context' => 'JLPT N5', 'quote' => str_repeat('Belajar ', 5), 'consent_public' => true];
        $a = $this->actingAs($student)->putJson('/api/student/testimonial', $text)->assertOk()->json('data');
        $b = $this->putJson('/api/student/testimonial', $this->video())->assertOk()->json('data');
        $this->assertNotSame($a['id'], $b['id']);
        $this->assertSame(2, $student->testimonials()->count());
        $this->assertSame($a['id'], $student->testimonial->id);
        $this->getJson('/api/student/testimonial')->assertJsonPath('data.id', $a['id']);
        $this->getJson('/api/student/testimonial?type=video')->assertJsonPath('data.id', $b['id']);
        $this->actingAs($this->user())->getJson('/api/student/testimonial?type=video')->assertJsonPath('data', null);
        $admin = $this->user('admin');
        $url = '/api/admin/testimonials/'.$b['id'];
        $stale = Testimonial::findOrFail($b['id']);
        $this->actingAs($admin)->patchJson($url, ['moderation_status' => 'rejected'])->assertOk();
        $this->patchJson($url, ['moderation_status' => 'approved'])->assertOk()->assertJsonPath('data.published', false)->assertJsonPath('data.landing', false)->assertJsonPath('data.show_on_testimonials', true);
        $this->patchJson($url, ['published' => false, 'landing' => false, 'show_on_testimonials' => false])->assertOk();
        $saved = app(PublicContentService::class)->save('testimonials', ['moderation_status' => 'approved'], $stale);
        $this->assertFalse($saved->published);
        $this->assertFalse($saved->landing);
        $this->assertFalse($saved->show_on_testimonials);
        $this->patchJson($url, ['moderation_status' => 'rejected'])->assertOk();
        $this->patchJson($url, ['moderation_status' => 'approved'])->assertJsonPath('data.published', false);
        $this->patchJson($url, ['published' => true, 'landing' => true])->assertOk();
        $this->getJson('/api/testimonials')->assertJsonMissing(['id' => $b['id']]);
        $this->getJson('/api/testimonials?landing=true')->assertJsonFragment(['id' => $b['id'], 'title' => 'Video fixture', 'video_url' => $this->video()['video_url']]);
        $this->patchJson($url, ['landing' => false, 'show_on_testimonials' => true])->assertOk();
        $this->getJson('/api/testimonials')->assertJsonFragment(['id' => $b['id']]);
        $this->getJson('/api/testimonials?landing=true')->assertJsonMissing(['id' => $b['id']]);
        $this->patchJson($url, ['published' => false])->assertOk()->assertJsonPath('data.show_on_testimonials', true);
        $this->getJson('/api/testimonials')->assertJsonMissing(['id' => $b['id']]);
        foreach (['type', 'video_thumbnail', 'consent_public', 'user_id', 'name'] as $field) {
            $this->patchJson($url, [$field => 'spoof'])->assertUnprocessable();
        }
        $this->actingAs($student)->putJson('/api/student/testimonial', $this->video())->assertConflict();
        $this->putJson('/api/student/testimonial', $text)->assertConflict();
    }

    public function test_video_validation_aliases_and_no_privileged_fields(): void
    {
        $this->actingAs($this->user());
        foreach ([['video_url' => 'http://youtu.be/dQw4w9WgXcQ'], ['video_url' => 'https://evil.test/video.mp4'], ['video_url' => 'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ'], ['video_thumbnail' => 'http://example.test/thumb.png'], ['video_thumbnail' => 'https://example.test/thumb.svg'], ['video_thumbnail' => 'https://user:pass@example.test/thumb.png'], ['video_thumbnail' => null], ['published' => true], ['title' => 'Other', 'video_title' => 'Conflict'], ['consent_public' => false]] as $invalid) {
            $this->putJson('/api/student/testimonial', array_replace($this->video(), $invalid))->assertUnprocessable();
        }
        $alias = $this->video();
        unset($alias['title']);
        $alias['video_title'] = 'Alias';
        $a = $this->putJson('/api/student/testimonial', $alias)->assertOk()->assertJsonPath('data.title', 'Alias')->json('data');
        $this->putJson('/api/student/testimonial', $alias)->assertConflict();
        $this->getJson('/api/student/testimonial?type=video')->assertJsonPath('data.id', $a['id']);
        Testimonial::findOrFail($a['id'])->forceFill(['moderation_status' => 'rejected'])->save();
        $this->putJson('/api/student/testimonial', array_replace($alias, ['quote' => 'Short description']))->assertJsonPath('data.quote', 'Short description');
        Testimonial::findOrFail($a['id'])->forceFill(['moderation_status' => 'rejected'])->save();
        $this->putJson('/api/student/testimonial', array_replace($alias, ['quote' => null]))->assertJsonPath('data.quote', '');
        $this->getJson('/api/student/testimonial?type=invalid')->assertUnprocessable();
        foreach (['https://www.instagram.com/reel/Ab_123/', 'https://drive.google.com/file/d/abcdefghij/view', 'https://drive.google.com/open?id=abcdefghij'] as $url) {
            Testimonial::findOrFail($a['id'])->forceFill(['moderation_status' => 'rejected'])->save();
            $this->putJson('/api/student/testimonial', array_replace($this->video(), ['video_url' => $url]))->assertOk();
        }
    }

    public function test_consent_required_on_first_approval_and_thumbnail_delete_protection(): void
    {
        $student = $this->user();
        $b = $this->actingAs($student)->putJson('/api/student/testimonial', $this->video())->assertOk()->json('data');
        $row = Testimonial::findOrFail($b['id']);
        $row->forceFill(['consent_public' => false])->save();
        $this->actingAs($this->user('admin'))->patchJson('/api/admin/testimonials/'.$b['id'], ['moderation_status' => 'approved'])->assertUnprocessable();
        Storage::fake(config('media.disk'));
        $path = 'media/image/11111111-1111-1111-1111-111111111111.png';
        Storage::disk(config('media.disk'))->put($path, 'fixture');
        $row->forceFill(['video_thumbnail' => $path])->save();
        try {
            app(MediaService::class)->delete($path);
            $this->fail('Referenced thumbnail deleted');
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $exception) {
            $this->assertSame(409, $exception->getStatusCode());
        }
        Storage::disk(config('media.disk'))->assertExists($path);
    }

    public function test_admin_video_and_thumbnail_https_boundaries_preserve_other_media_rules(): void
    {
        $media = app(MediaService::class);
        foreach (['http://example.test/a.mp4', 'http://example.test/a.webm', 'http://127.0.0.1.evil.test/a.mp4', 'http://youtu.be/dQw4w9WgXcQ'] as $url) {
            $this->assertFalse($media->valid($url, 'video'));
        }
        foreach (['https://example.test/a.mp4', 'https://example.test/a.webm', 'http://localhost:8000/a.mp4', 'http://127.0.0.1:8000/a.webm', 'http://[::1]:8000/a.mp4'] as $url) {
            $this->assertTrue($media->valid($url, 'video'), $url);
        }
        $this->assertTrue($media->valid('http://example.test/image.png', 'image'));
        $this->assertTrue($media->valid('http://example.test/audio.mp3', 'audio'));
        $this->actingAs($this->user('admin'));
        $input = ['name' => 'Admin video', 'context' => 'N5', 'quote' => 'Description', 'video_url' => 'https://example.test/a.mp4', 'title' => 'Title', 'video_thumbnail' => 'https://example.test/thumb.png'];
        foreach ([['video_url' => 'http://example.test/a.mp4'], ['video_thumbnail' => 'http://example.test/thumb.png'], ['video_thumbnail' => 'http://localhost/thumb.png'], ['video_thumbnail' => 'public/thumb.png'], ['video_thumbnail' => 'https://example.test/thumb.svg'], ['video_url' => 'https://example.test/a%0a.mp4']] as $invalid) {
            $this->postJson('/api/admin/testimonials', array_replace($input, $invalid))->assertUnprocessable();
        }
        $this->postJson('/api/admin/testimonials', $input)->assertCreated();
        $this->postJson('/api/admin/testimonials', array_replace($input, ['video_url' => 'http://127.0.0.1:8000/a.mp4']))->assertCreated();
    }

    public function test_forward_migration_preserves_legacy_records_and_composite_unique(): void
    {
        // Recreate pre-redesign table inside rolled-back PostgreSQL transaction only.
        DB::statement('ALTER TABLE testimonials DROP CONSTRAINT testimonials_type_check, DROP CONSTRAINT testimonials_quote_check');
        DB::statement('ALTER TABLE testimonials ADD CONSTRAINT testimonials_quote_check CHECK (length(btrim(quote)) > 0)');
        DB::statement('ALTER TABLE testimonials DROP CONSTRAINT testimonials_user_id_type_unique');
        DB::statement('ALTER TABLE testimonials DROP COLUMN type, DROP COLUMN title, DROP COLUMN video_thumbnail, DROP COLUMN show_on_testimonials, DROP COLUMN first_approved_at');
        DB::statement('ALTER TABLE testimonials ADD CONSTRAINT testimonials_user_id_unique UNIQUE (user_id)');
        $student = $this->user();
        $id = DB::table('testimonials')->insertGetId(['name' => 'Legacy', 'context' => 'N5', 'quote' => 'Keep legacy quote', 'video_url' => 'https://example.test/a.mp4', 'video_title' => 'Legacy title', 'published' => true, 'landing' => false, 'user_id' => $student->id]);
        $text = DB::table('testimonials')->insertGetId(['name' => 'Text', 'context' => 'N4', 'quote' => 'Legacy text', 'published' => false]);
        $migration = require database_path('migrations/2026_10_13_000001_add_testimonial_types_and_channels.php');
        $migration->up();
        $this->assertDatabaseHas('testimonials', ['id' => $id, 'type' => 'video', 'quote' => 'Keep legacy quote', 'title' => 'Legacy title', 'show_on_testimonials' => true, 'video_thumbnail' => null]);
        $this->assertDatabaseHas('testimonials', ['id' => $text, 'type' => 'text', 'show_on_testimonials' => false]);
        $legacy = Testimonial::findOrFail($id);
        $saved = app(PublicContentService::class)->save('testimonials', ['published' => false, 'landing' => false], $legacy);
        $this->assertSame('Keep legacy quote', $saved->quote);
        $this->assertNull($saved->video_thumbnail);
        $this->assertSame('https://example.test/a.mp4', $saved->video_url);
        $saved = app(PublicContentService::class)->save('testimonials', ['published' => true, 'title' => 'Legacy title', 'video_title' => 'Legacy title', 'video_url' => 'https://example.test/a.mp4', 'video_thumbnail' => null], $legacy);
        $this->assertTrue($saved->published);
        $saved->delete();
        $this->assertDatabaseMissing('testimonials', ['id' => $id]);
        DB::table('testimonials')->insert(['user_id' => $student->id, 'type' => 'video', 'name' => 'Separate video', 'context' => 'N5', 'quote' => 'Description']);
        DB::table('testimonials')->insert(['user_id' => $student->id, 'type' => 'text', 'name' => 'Separate', 'context' => 'N5', 'quote' => 'New text']);
        $this->assertSame(2, $student->testimonials()->count());
        $this->expectException(\Illuminate\Database\QueryException::class);
        DB::table('testimonials')->insert(['user_id' => $student->id, 'type' => 'text', 'name' => 'Duplicate', 'context' => 'N5', 'quote' => 'Duplicate']);
    }
}
