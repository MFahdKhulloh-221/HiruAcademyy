<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class StudentTestimonialFormTest extends TestCase
{
    use DatabaseTransactions;

    public function test_account_identity_history_and_auto_published_submission(): void
    {
        $this->assertSame('hiru_academy_test', \Illuminate\Support\Facades\DB::connection()->getDatabaseName());
        $user = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $this->actingAs($user)->getJson('/api/student/testimonial')->assertOk()->assertJsonPath('data', null)->assertJsonPath('context', 'Siswa Hiru Academy');
        $body = ['quote' => str_repeat('Belajar nyaman. ', 3), 'consent_public' => true];
        foreach (['name', 'user_id', 'image', 'avatar'] as $field) {
            $this->putJson('/api/student/testimonial', $body + [$field => 'spoof'])->assertUnprocessable();
        }
        $saved = $this->putJson('/api/student/testimonial', $body + ['context' => 'Forged program'])->assertOk()
            ->assertJsonPath('data.name', $user->name)->assertJsonPath('data.context', 'Siswa Hiru Academy')
            ->assertJsonPath('data.image', $user->avatar)->assertJsonPath('data.moderation_status', 'approved')->assertJsonPath('data.published', true)->json('data');
        $this->assertSame($user->id, $user->testimonials()->findOrFail($saved['id'])->user_id);
        $this->getJson('/api/student/testimonial')->assertOk()->assertJsonPath('data.id', $saved['id']);
        $this->putJson('/api/student/testimonial', ['quote' => 'short', 'consent_public' => true])->assertUnprocessable();
        $other = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $this->actingAs($other)->getJson('/api/student/testimonial')->assertOk()->assertJsonPath('data', null);
    }

    public function test_video_thumbnail_file_validation_storage_and_owner_lock(): void
    {
        \Illuminate\Support\Facades\Storage::fake(config('media.disk'));
        $disk = \Illuminate\Support\Facades\Storage::disk(config('media.disk'));
        $user = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $body = ['_method' => 'PUT', 'type' => 'video', 'title' => 'Cerita siswa', 'video_url' => 'https://youtu.be/dQw4w9WgXcQ', 'consent_public' => '1'];
        $file = fn () => \Illuminate\Http\UploadedFile::fake()->createWithContent('thumbnail.png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG3sAAAAASUVORK5CYII='));
        $this->post('/api/student/testimonial', $body + ['video_thumbnail' => $file()], ['Accept' => 'application/json'])->assertUnauthorized();
        $this->actingAs($user);
        foreach ([
            \Illuminate\Http\UploadedFile::fake()->createWithContent('fake.png', 'not an image'),
            \Illuminate\Http\UploadedFile::fake()->create('thumbnail.svg', 1, 'image/svg+xml'),
            \Illuminate\Http\UploadedFile::fake()->create('large.png', (int) config('media.max_kb.image') + 1, 'image/png'),
        ] as $invalid) {
            $this->post('/api/student/testimonial', $body + ['video_thumbnail' => $invalid], ['Accept' => 'application/json'])->assertUnprocessable();
        }
        $this->assertCount(0, $disk->allFiles());
        $this->post('/api/student/testimonial', array_replace($body, ['consent_public' => '0', 'video_thumbnail' => $file()]), ['Accept' => 'application/json'])->assertUnprocessable();
        $invalidUrl = $this->post('/api/student/testimonial', array_replace($body, ['video_url' => 'https://example.test/not-a-supported-video', 'video_thumbnail' => $file()]), ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('video_url');
        fwrite(STDOUT, "\nVIDEO_VALIDATION_RESPONSE=".$invalidUrl->getContent()."\n");
        $saved = $this->post('/api/student/testimonial', $body + ['quote' => 'Singkat', 'video_thumbnail' => $file()], ['Accept' => 'application/json'])->assertOk()
            ->assertJsonPath('data.published', true)->assertJsonPath('data.landing', false)->json('data');
        $disk->assertExists($saved['video_thumbnail']);
        $this->assertStringStartsWith('media/image/', $saved['video_thumbnail']);
        $this->getJson('/api/testimonials')->assertJsonFragment(['id' => $saved['id'], 'video_thumbnail' => $saved['video_thumbnail']]);
        $this->getJson('/api/student/testimonial?type=video')->assertJsonPath('data.video_thumbnail', $saved['video_thumbnail']);
        $this->post('/api/student/testimonial', $body + ['video_thumbnail' => $file()], ['Accept' => 'application/json'])->assertConflict();
        $this->assertCount(1, $disk->allFiles());
        $admin = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $admin->forceFill(['role' => 'admin'])->save();
        $this->actingAs($admin)->patchJson('/api/admin/testimonials/'.$saved['id'], ['video_thumbnail' => $saved['video_thumbnail']])->assertOk()->assertJsonPath('data.video_thumbnail', $saved['video_thumbnail']);
        $this->assertSame($user->id, $user->testimonials()->findOrFail($saved['id'])->user_id);
        $this->assertSame('Singkat', $user->testimonials()->findOrFail($saved['id'])->quote);
        $this->getJson('/api/admin/testimonials')->assertOk()->assertJsonFragment(['id' => $saved['id']]);
        $this->patchJson('/api/admin/testimonials/'.$saved['id'], ['landing' => true])->assertOk();
        $this->getJson('/api/testimonials?landing=true')->assertOk()->assertJsonFragment(['id' => $saved['id']]);
    }

}
