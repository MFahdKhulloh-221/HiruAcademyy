<?php

namespace Tests\Unit;

use App\Services\HeroSliderConfiguration;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class HeadlineHighlightsTest extends TestCase
{
    public function test_headline_ranges_accept_unicode_and_reject_invalid_or_injected_data(): void
    {
        $slide = ['id' => 'first', 'internalTitle' => 'Banner', 'order' => 0, 'active' => true, 'desktopSrc' => '/banners/hiru-hero-desktop.png', 'mobileSrc' => '', 'imageAlt' => 'Banner', 'eyebrow' => '', 'title' => '日😀Terarah', 'description' => '', 'showOverlay' => true, 'showPrimary' => false, 'primaryLabel' => '', 'primaryHref' => '', 'showSecondary' => false, 'secondaryLabel' => '', 'secondaryHref' => '', 'desktopPosition' => 'left', 'mobilePosition' => 'left', 'offsetY' => 0];
        $validate = fn ($ranges) => app(HeroSliderConfiguration::class)->validate(['autoplay' => false, 'intervalMs' => 3000, 'slides' => [$slide + ['titleHighlights' => $ranges]]], true);
        $this->assertSame([['start' => 2, 'end' => 9]], $validate([['start' => 2, 'end' => 9]])['slides'][0]['titleHighlights']);
        foreach ([[['start' => 2, 'end' => 10]], [['start' => 2, 'end' => 2]], [['start' => 2, 'end' => 6], ['start' => 4, 'end' => 9]], [['start' => 0, 'end' => 1, 'html' => '<script>']]] as $invalid) {
            try { $validate($invalid); $this->fail('Invalid formatting accepted'); }
            catch (ValidationException) { $this->addToAssertionCount(1); }
        }
    }
}
