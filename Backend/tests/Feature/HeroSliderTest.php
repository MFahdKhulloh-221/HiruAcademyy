<?php

namespace Tests\Feature;

use App\Services\LandingHeroService;
use App\Services\MediaService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Tests\TestCase;

class HeroSliderTest extends TestCase
{
    public function test_uploaded_image_references_prevent_deletion_and_invalid_upload_is_rejected(): void
    {
        Storage::fake(config('media.disk'));
        DB::beginTransaction();
        try {
            $media = app(MediaService::class);
            $upload = $media->upload(\Illuminate\Http\UploadedFile::fake()->image('banner.png', 1920, 640), 'image');
            $this->assertTrue($media->valid($upload['path'], 'image'));
            DB::table('admin_settings')->updateOrInsert(['section' => 'landing_hero'], ['value' => json_encode(['draft' => ['slider' => ['slides' => [['desktopSrc' => $upload['path']]]]], 'published' => null, 'revision' => 1]), 'created_at' => now(), 'updated_at' => now()]);
            try { $media->delete($upload['path']); $this->fail('Referenced image deleted'); }
            catch (\Symfony\Component\HttpKernel\Exception\HttpException $error) { $this->assertSame(409, $error->getStatusCode()); }
            $this->assertTrue(Storage::disk(config('media.disk'))->exists($upload['path']));
            try { $media->upload(\Illuminate\Http\UploadedFile::fake()->createWithContent('fake.png', '<?php echo 1;'), 'image'); $this->fail('Spoofed image accepted'); }
            catch (ValidationException) {}
        } finally { DB::rollBack(); }
    }

    public function test_draft_publish_reload_and_stale_revision_use_real_storage(): void
    {
        DB::beginTransaction();
        try {
            // Local test DB only; transaction restores any prior fixture snapshot.
            DB::table('admin_settings')->where('section', 'landing_hero')->delete();
            $hero = ['eyebrow' => 'Belajar', 'heading' => 'Belajar Jepang', 'support' => 'Bersama Hiru', 'primaryCtaLabel' => 'Daftar', 'primaryCtaPath' => '/register', 'secondaryCtaLabel' => 'Program', 'secondaryCtaPath' => '/program'];
            $slide = ['id' => 'first', 'internalTitle' => 'Pertama', 'order' => 0, 'active' => true, 'desktopSrc' => '/banners/hiru-hero-desktop.png', 'mobileSrc' => '', 'imageAlt' => 'Pelajar Jepang', 'eyebrow' => '', 'title' => 'Belajar Jepang', 'description' => '', 'showOverlay' => true, 'showPrimary' => true, 'primaryLabel' => 'Daftar', 'primaryHref' => '/register', 'showSecondary' => false, 'secondaryLabel' => '', 'secondaryHref' => '', 'desktopPosition' => 'left', 'mobilePosition' => 'left', 'offsetY' => 0];
            $hero['slider'] = ['autoplay' => true, 'intervalMs' => 6000, 'slides' => [$slide, [...$slide, 'id' => 'second', 'order' => 1]]];
            $service = app(LandingHeroService::class);
            $draft = $service->saveDraft(['revision' => 0, 'hero' => $hero]);
            $this->assertNull((new LandingHeroService)->published());
            $this->assertEquals($hero, (new LandingHeroService)->snapshot()['draft']);
            $service->publish(['revision' => $draft['revision']]);
            $this->assertEquals($hero, (new LandingHeroService)->published());
            try { $service->saveDraft(['revision' => 0, 'hero' => $hero]); $this->fail('Stale save accepted'); } catch (ConflictHttpException) {}
            $hero['slider']['slides'][0]['active'] = false;
            $hero['slider']['slides'][1]['active'] = false;
            $state = $service->saveDraft(['revision' => 2, 'hero' => $hero]);
            try { $service->publish(['revision' => $state['revision']]); $this->fail('Invalid publish accepted'); } catch (ValidationException) {}
            $this->assertTrue($service->published()['slider']['slides'][0]['active']);
            $this->assertFalse($service->snapshot()['draft']['slider']['slides'][0]['active']);
        } finally { DB::rollBack(); }
    }
}
