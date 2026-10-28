<?php

namespace Tests\Unit;

use App\Services\PlacementRichText;
use PHPUnit\Framework\TestCase;

final class QuestionRichTextTest extends TestCase
{
    public function test_question_fields_preserve_format_and_remove_executable_content(): void
    {
        $safe = '<strong>学校</strong><em>日本語</em><u>答え</u><ruby>学校<rt>がっこう</rt></ruby>';
        foreach (['question', 'instruction', 'reading_passage', 'explanation', 'body', 'option'] as $field) {
            $dirty = $safe.'<script>alert(1)</script><img src=x onerror=alert(1)><iframe src="javascript:alert(1)"></iframe><svg onload="alert(1)"></svg>';
            $this->assertSame($safe, PlacementRichText::sanitize($dirty), $field);
            $this->assertSame($safe, PlacementRichText::sanitize($safe), $field);
        }
    }

    public function test_removes_attributes_and_normalizes_editor_tags(): void
    {
        $this->assertSame('<strong>Bold</strong><em>Italic</em><u>Underline</u><ruby>学校<rt>がっこう</rt></ruby>', PlacementRichText::sanitize('<b onclick="alert(1)">Bold</b><i style="color:red">Italic</i><u onmouseover="alert(1)">Underline</u><ruby id="x">学校<rt onclick="alert(1)">がっこう</rt></ruby>'));
    }

    public function test_legacy_plain_text_is_unchanged_and_dangerous_only_content_is_empty(): void
    {
        foreach (['学校 < 3 & 日本語', "Legacy question\nLine 2", 'A > B', ''] as $value) {
            $this->assertSame($value, PlacementRichText::sanitize($value));
        }
        $this->assertSame('', PlacementRichText::sanitize('<script>alert(1)</script><style>body{display:none}</style>'));
    }
}
