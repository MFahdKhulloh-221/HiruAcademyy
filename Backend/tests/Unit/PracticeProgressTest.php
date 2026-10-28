<?php

namespace Tests\Unit;

use App\Models\Chapter;
use App\Models\Program;
use App\Services\ChapterAccessPolicy;
use App\Services\LearningProgressService;
use PHPUnit\Framework\TestCase;

final class PracticeProgressTest extends TestCase
{
    public function test_practice_completion_uses_current_question_ids_and_not_flashcard_progress(): void
    {
        $service = new LearningProgressService($this->createMock(ChapterAccessPolicy::class));
        $program = new Program(['family' => 'jlpt']);
        $chapter = (new Chapter)->forceFill(['id' => 11]);
        foreach ([[[], false, 0], [[81], false, 1], [[81, 82], true, 2], [[999], false, 0]] as [$ids, $complete, $count]) {
            $progress = $service->assemble($program, $chapter, ['reading' => [81, 82], 'flashcard' => [21]], ['reading' => $ids, 'flashcard' => [21]], true);
            $this->assertSame($complete, $progress['activities']['reading']['complete']);
            $this->assertSame($count, $progress['activities']['reading']['completed']);
            $this->assertSame(2, $progress['activities']['reading']['total']);
            $this->assertTrue($progress['activities']['flashcard']['complete']);
            $this->assertFalse($progress['activities']['audio']['complete']);
        }
    }
}
