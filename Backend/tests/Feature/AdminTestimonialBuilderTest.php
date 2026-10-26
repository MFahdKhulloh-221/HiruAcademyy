<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Testimonial;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AdminTestimonialBuilderTest extends TestCase
{
    use DatabaseTransactions;

    public function test_student_admin_public_crud_archive_and_permissions(): void
    {
        $this->assertSame('hiru_academy_test', DB::connection()->getDatabaseName());
        if (! \Illuminate\Support\Facades\Schema::hasColumn('testimonials', 'archived_at')) {
            (require database_path('migrations/2026_10_26_000001_add_testimonial_archive.php'))->up();
        }
        $student = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $admin = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $admin->forceFill(['role' => 'admin'])->save();
        $body = ['quote' => str_repeat('Belajar nyaman. ', 3), 'consent_public' => true];
        $item = $this->actingAs($student)->putJson('/api/student/testimonial', $body)->assertOk()->assertJsonPath('data.published', true)->assertJsonPath('data.landing', false)->assertJsonPath('data.show_on_testimonials', true)->json('data');
        $id = $item['id'];
        $this->getJson('/api/student/testimonial')->assertJsonPath('data.id', $id);
        $this->getJson('/api/testimonials')->assertJsonFragment(['id' => $id]);
        foreach (['get', 'post', 'patch', 'delete'] as $method) {
            $url = '/api/admin/testimonials'.(in_array($method, ['patch', 'delete']) ? '/'.$id : '');
            $this->{$method.'Json'}($url, [])->assertForbidden();
        }
        $this->actingAs($admin)->getJson('/api/admin/testimonials')->assertJsonFragment(['id' => $id]);
        $url = '/api/admin/testimonials/'.$id;
        $this->patchJson($url, ['name' => 'spoof'])->assertUnprocessable();
        $this->patchJson($url, ['user_id' => $admin->id])->assertUnprocessable();
        $this->patchJson($url, ['quote' => 'Isi diperbarui oleh Admin.', 'landing' => true])->assertOk();
        $this->getJson('/api/testimonials?landing=true')->assertJsonFragment(['id' => $id]);
        $this->patchJson($url, ['landing' => false])->assertOk();
        $this->getJson('/api/testimonials?landing=true')->assertJsonMissing(['id' => $id]);
        $this->patchJson($url, ['landing' => true])->assertOk();
        $this->patchJson($url, ['quote' => str_repeat('a', 501)])->assertUnprocessable();
        $this->patchJson($url, ['show_on_testimonials' => false])->assertOk();
        $this->getJson('/api/testimonials')->assertJsonMissing(['id' => $id]);
        $this->patchJson($url, ['archived_at' => now()->toISOString(), 'published' => true, 'landing' => true])->assertOk()->assertJsonPath('data.published', false)->assertJsonPath('data.landing', false);
        $this->getJson('/api/testimonials?landing=true')->assertJsonMissing(['id' => $id]);
        $this->getJson('/api/testimonials')->assertJsonMissing(['id' => $id]);
        $this->patchJson($url, ['published' => true, 'landing' => true, 'show_on_testimonials' => true])->assertOk()->assertJsonPath('data.published', false)->assertJsonPath('data.show_on_testimonials', false);
        $this->actingAs($student)->getJson('/api/student/testimonial')->assertJsonPath('data.published', false);
        $this->putJson('/api/student/testimonial', $body)->assertConflict();
        $this->actingAs($admin)->patchJson($url, ['archived_at' => null, 'published' => true, 'show_on_testimonials' => true, 'landing' => false])->assertOk();
        $this->getJson('/api/testimonials')->assertJsonFragment(['id' => $id, 'quote' => 'Isi diperbarui oleh Admin.']);
        $row = Testimonial::findOrFail($id);
        $row->forceFill(['consent_public' => false])->save();
        $this->patchJson($url, ['published' => true])->assertUnprocessable();
        $this->getJson('/api/testimonials')->assertJsonMissing(['id' => $id]);
        $new = $this->postJson('/api/admin/testimonials', ['name' => 'Atribusi Admin', 'context' => 'Konten kurasi', 'quote' => 'Pengalaman terverifikasi', 'published' => false])->assertCreated()->json('data.id');
        $this->getJson('/api/admin/testimonials/'.$new)->assertOk()->assertJsonPath('data.source', 'admin');
        $this->deleteJson('/api/admin/testimonials/'.$new)->assertNoContent();
        $this->getJson('/api/admin/testimonials/'.$new)->assertNotFound();
        $this->assertSame($student->id, Testimonial::findOrFail($id)->user_id);
    }

    public function test_landing_limit_legacy_status_and_shared_media_survive_delete(): void
    {
        $this->assertSame('hiru_academy_test', DB::connection()->getDatabaseName());
        $legacy = Testimonial::create(['name' => 'Legacy fixture', 'context' => 'Existing', 'quote' => 'Keep hidden', 'published' => false, 'landing' => false]);
        $before = $legacy->fresh()->getRawOriginal();
        $migration = require database_path('migrations/2026_10_26_000001_add_testimonial_archive.php');
        // Transactional DDL on isolated test DB; verify migration does not publish old rows.
        $migration->down();
        $migration->up();
        $this->assertSame($before, $legacy->fresh()->getRawOriginal());
        $admin = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $admin->forceFill(['role' => 'admin'])->save();
        $this->actingAs($admin);
        for ($i = 0; $i < 7; $i++) {
            $this->postJson('/api/admin/testimonials', ['name' => 'Landing fixture '.$i, 'context' => 'Admin', 'quote' => 'Verified content', 'published' => true, 'landing' => true])->assertStatus($i < 6 ? 201 : 422);
        }
        $this->getJson('/api/testimonials?landing=true')->assertOk()->assertJsonCount(6, 'data');
        $this->assertSame($before, $legacy->fresh()->getRawOriginal());
        \Illuminate\Support\Facades\Storage::fake(config('media.disk'));
        $path = 'media/image/11111111-1111-1111-1111-111111111111.png';
        \Illuminate\Support\Facades\Storage::disk(config('media.disk'))->put($path, 'fixture');
        $legacy->forceFill(['image' => $path])->save();
        $shared = Testimonial::create(['name' => 'Shared fixture', 'context' => 'Admin', 'quote' => 'Shared media', 'image' => $path]);
        $this->deleteJson('/api/admin/testimonials/'.$legacy->id)->assertNoContent();
        $this->assertSame($path, $shared->fresh()->image);
        \Illuminate\Support\Facades\Storage::disk(config('media.disk'))->assertExists($path);
    }
}
