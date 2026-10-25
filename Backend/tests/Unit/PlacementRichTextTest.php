<?php

namespace Tests\Unit;

use App\Services\PlacementRichText;
use PHPUnit\Framework\TestCase;

final class PlacementRichTextTest extends TestCase
{
    public function test_preserves_plain_text_and_semantic_formatting_without_unsafe_html(): void
    {
        $this->assertSame('学校 < 3', PlacementRichText::sanitize('学校 < 3'));
        $html = '<strong onclick="alert(1)">学校</strong><ruby>続ける<rt>つづける</rt></ruby><em>文</em><u>字</u><script>alert(1)</script><img src=x onerror=alert(1)>';
        $expected = '<strong>学校</strong><ruby>続ける<rt>つづける</rt></ruby><em>文</em><u>字</u>';
        $this->assertSame($expected, PlacementRichText::sanitize($html));
        $this->assertSame($expected, PlacementRichText::sanitize($expected));
        $this->assertSame('', PlacementRichText::sanitize('<script>alert(1)</script>'));
    }
}
