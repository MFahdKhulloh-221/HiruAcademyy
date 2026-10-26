<?php

namespace Tests\Feature;

use App\Models\Testimonial;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class TestimonialLandingSelectionTest extends TestCase
{
    use DatabaseTransactions;

    public function test_selection_limit_order_replacement_and_public_channels(): void
    {
        $admin = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $admin->forceFill(['role' => 'admin'])->save();
        $this->actingAs($admin);
        $ids = [];
        for ($i = 0; $i < 7; $i++) {
            $ids[] = $this->postJson('/api/admin/testimonials', ['name' => 'Landing '.$i, 'context' => 'Fixture', 'quote' => 'Pengalaman belajar fixture', 'published' => true, 'show_on_testimonials' => true, 'landing' => false])->assertCreated()->json('data.id');
        }
        $url = fn ($id) => '/api/admin/testimonials/'.$id;
        foreach (array_slice($ids, 0, 6) as $id) $this->patchJson($url($id), ['landing' => true])->assertOk();
        $this->patchJson($url($ids[6]), ['landing' => true])->assertUnprocessable()->assertJsonValidationErrors('landing');
        $this->patchJson($url($ids[5]), ['landing_position' => 1])->assertOk();
        $expected = [$ids[5], ...array_slice($ids, 0, 5)];
        $this->assertSame($expected, $this->getJson('/api/testimonials?landing=true')->assertOk()->json('data.*.id'));
        $this->assertSame(array_fill(0, 6, 'text'), $this->getJson('/api/testimonials?landing=true')->json('data.*.type'));
        $this->getJson($url($ids[5]))->assertJsonPath('data.sort_order', 1);
        $this->patchJson($url($ids[0]), ['landing' => false])->assertOk()->assertJsonPath('data.published', true)->assertJsonPath('data.show_on_testimonials', true);
        $this->getJson('/api/testimonials')->assertJsonFragment(['id' => $ids[0]]);
        $this->patchJson($url($ids[6]), ['landing' => true])->assertOk();
        $this->getJson('/api/testimonials?landing=true')->assertJsonCount(6, 'data')->assertJsonMissing(['id' => $ids[0]]);
        $this->patchJson($url($ids[5]), ['archived_at' => now()->toISOString()])->assertOk()->assertJsonPath('data.landing', false);
        $this->getJson('/api/testimonials?landing=true')->assertJsonMissing(['id' => $ids[5]]);
        $this->getJson('/api/testimonials')->assertJsonMissing(['id' => $ids[5]]);
        $this->patchJson($url($ids[5]), ['archived_at' => null, 'published' => true, 'show_on_testimonials' => true])->assertOk()->assertJsonPath('data.landing', false);
        $this->travel(61)->seconds();
        $row = Testimonial::findOrFail($ids[0]);
        $row->forceFill(['consent_public' => false])->save();
        $this->patchJson($url($ids[0]), ['landing' => true])->assertUnprocessable();
        $row->forceFill(['consent_public' => true, 'published' => false])->save();
        $this->patchJson($url($ids[0]), ['landing' => true])->assertUnprocessable();
        $student = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $this->actingAs($student)->patchJson($url($ids[0]), ['landing' => true])->assertForbidden();
    }
    public function test_legacy_over_limit_can_only_be_reconciled_by_explicit_removal(): void
    {
        $this->assertSame('hiru_academy_test', \Illuminate\Support\Facades\DB::connection()->getDatabaseName());
        $admin = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $admin->forceFill(['role' => 'admin'])->save();
        $this->actingAs($admin);
        $ids = [];
        for ($i = 0; $i < 12; $i++) {
            $id = $this->postJson('/api/admin/testimonials', ['name' => 'Legacy '.$i, 'context' => 'Test', 'quote' => 'Pengalaman belajar legacy', 'published' => true, 'show_on_testimonials' => true, 'landing' => false])->assertCreated()->json('data.id');
            $ids[] = $id;
            if ($i < 11) Testimonial::whereKey($id)->update(['landing' => true, 'sort_order' => $i + 1]);
        }
        $this->assertCount(11, array_filter($this->getJson('/api/admin/testimonials')->assertOk()->json('data'), fn ($r) => $r['landing']));
        $this->patchJson('/api/admin/testimonials/'.$ids[11], ['landing' => true])->assertUnprocessable();
        $before = Testimonial::whereIn('id', $ids)->orderBy('id')->get()->map(fn ($m) => $m->only(['id', 'published', 'consent_public', 'archived_at', 'show_on_testimonials', 'quote', 'sort_order']))->all();
        foreach (array_slice($ids, 6, 5) as $id) $this->patchJson('/api/admin/testimonials/'.$id, ['landing' => false])->assertOk();
        $this->assertSame($before, Testimonial::whereIn('id', $ids)->orderBy('id')->get()->map(fn ($m) => $m->only(['id', 'published', 'consent_public', 'archived_at', 'show_on_testimonials', 'quote', 'sort_order']))->all());
        $this->assertSame(array_slice($ids, 0, 6), $this->getJson('/api/testimonials?landing=true')->assertOk()->json('data.*.id'));
        $this->assertSame(12, Testimonial::whereIn('id', $ids)->count());
    }

    public function test_video_cannot_enter_landing_even_with_legacy_flag(): void
    {
        $this->assertSame('hiru_academy_test', \Illuminate\Support\Facades\DB::connection()->getDatabaseName());
        $admin = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $admin->forceFill(['role' => 'admin'])->save();
        $this->actingAs($admin);
        $body = ['name' => 'Video', 'context' => 'Test', 'quote' => 'Pengalaman video', 'type' => 'video', 'title' => 'Video', 'video_url' => 'https://youtu.be/dQw4w9WgXcQ', 'video_thumbnail' => 'https://example.test/thumb.png', 'published' => true, 'show_on_testimonials' => true];
        $this->postJson('/api/admin/testimonials', $body + ['landing' => true])->assertUnprocessable()->assertJsonValidationErrors('landing');
        $id = $this->postJson('/api/admin/testimonials', $body + ['landing' => false])->assertCreated()->json('data.id');
        $this->patchJson('/api/admin/testimonials/'.$id, ['landing' => true])->assertUnprocessable()->assertJsonValidationErrors('landing');
        Testimonial::whereKey($id)->update(['landing' => true]);
        $this->getJson('/api/testimonials?landing=true')->assertOk()->assertJsonMissing(['id' => $id]);
        $this->getJson('/api/testimonials')->assertOk()->assertJsonFragment(['id' => $id]);
        $this->patchJson('/api/admin/testimonials/'.$id, ['landing' => false])->assertOk()->assertJsonPath('data.show_on_testimonials', true);
    }

}
