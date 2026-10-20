<?php

namespace Tests\Feature;

use App\Models\Testimonial;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class TestimonialDemoTest extends TestCase
{
    use DatabaseTransactions;

    public function test_confirmation_and_dedicated_schema_are_required(): void
    {
        $this->artisan('hiru:testimonials:demo')->assertFailed();
        $schema = getenv('HIRU_TEST_SCHEMA');
        putenv('HIRU_TEST_SCHEMA=hiru_backend_test_not_demo');
        try {
            $this->artisan('hiru:testimonials:demo', ['--confirm-local-demo' => true])->assertFailed();
        } finally {
            putenv('HIRU_TEST_SCHEMA'.($schema === false ? '' : '='.$schema));
        }
    }

    public function test_two_real_formats_are_idempotent_and_public_filters_still_apply(): void
    {
        if (! preg_match('/^hiru_backend_test_testimonial_demo_[a-z0-9_]+$/D', (string) getenv('HIRU_TEST_SCHEMA'))) {
            $this->markTestSkipped('Playable demo requires dedicated testimonial demo schema; see Docs/TESTIMONIAL_VIDEO_DEMO.md.');
        }
        config(['media.disk' => 'public']);
        Storage::fake('public');
        // Existing manual demo rows are restored by DatabaseTransactions rollback.
        Testimonial::where('source', 'admin')->where('name', 'like', 'Demo / Preview untuk Evaluasi Client %')->delete();
        $this->artisan('hiru:testimonials:demo', ['--confirm-local-demo' => true])->assertSuccessful();
        $rows = Testimonial::where('name', 'like', 'Demo / Preview untuk Evaluasi Client %')->orderBy('sort_order')->get();
        $this->assertCount(2, $rows);
        $paths = $rows->pluck('video_url')->all();
        $this->assertStringEndsWith('.mp4', $paths[0]);
        $this->assertStringEndsWith('.webm', $paths[1]);
        foreach ($paths as $path) {
            Storage::disk('public')->assertExists($path);
        }
        $this->artisan('hiru:testimonials:demo', ['--confirm-local-demo' => true])->assertSuccessful();
        $this->assertSame($paths, Testimonial::whereIn('id', $rows->modelKeys())->orderBy('sort_order')->pluck('video_url')->all());
        $this->assertCount(4, Storage::disk('public')->allFiles());
        $result = $this->getJson('/api/testimonials')->assertOk()->json('data');
        foreach ($rows as $row) {
            $this->assertContains($row->id, array_column($result, 'id'));
        }
        $landing = $this->getJson('/api/testimonials?landing=true')->assertOk()->json('data');
        foreach ($rows as $row) {
            $this->assertNotContains($row->id, array_column($landing, 'id'));
        }
        $this->getJson('/api/testimonials?landing=invalid')->assertUnprocessable();
        foreach (['published' => false, 'consent_public' => false, 'moderation_status' => 'pending'] as $field => $value) {
            $rows[0]->forceFill(['published' => true, 'consent_public' => true, 'moderation_status' => 'approved', $field => $value])->save();
            $result = $this->getJson('/api/testimonials')->assertOk()->json('data');
            $this->assertNotContains($rows[0]->id, array_column($result, 'id'));
        }
    }
}
