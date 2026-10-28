<?php

namespace Tests\Unit;

use App\Models\Chapter;
use App\Models\Program;
use App\Services\ChapterAccessPolicy;
use App\Services\LearningProgressService;
use Tests\TestCase;

final class MiniEligibilityTest extends TestCase
{
    public function test_all_five_activities_are_required_and_empty_activities_stay_locked(): void
    {
        $service = new LearningProgressService($this->createMock(ChapterAccessPolicy::class));
        $program = new Program(['family' => 'jlpt']);
        $chapter = (new Chapter)->forceFill(['id' => 11]);
        $resources = ['video' => [1], 'module' => [2, 3], 'flashcard' => [4], 'audio' => [5], 'reading' => [6]];
        $completed = ['video' => [1], 'module' => [2, 3], 'flashcard' => [4], 'audio' => [5], 'reading' => [6]];
        $this->assertTrue($service->assemble($program, $chapter, $resources, $completed, true, true)['mini_unlocked']);
        foreach (['video', 'module', 'flashcard', 'audio', 'reading'] as $type) {
            $partial = $completed;
            $partial[$type] = [];
            $this->assertFalse($service->assemble($program, $chapter, $resources, $partial, true, true)['mini_unlocked']);
            $empty = $resources;
            $empty[$type] = [];
            $this->assertFalse($service->assemble($program, $chapter, $empty, $completed, true, true)['mini_unlocked']);
        }
        $this->assertFalse($service->assemble($program, $chapter, $resources, $completed, false, true)['mini_unlocked']);
        $completed['module'] = [3];
        $this->assertFalse($service->assemble($program, $chapter, $resources, $completed, true, true)['mini_unlocked']);
        $completed['module'] = [2];
        $this->assertFalse($service->assemble($program, $chapter, $resources, $completed, true, true)['mini_unlocked']);
        $completed['module'] = [999, 1000];
        $this->assertFalse($service->assemble($program, $chapter, $resources, $completed, true, true)['mini_unlocked']);
        $this->assertFalse($service->assemble($program, $chapter, $resources, $completed, true, false)['mini_unlocked']);
    }
    public function test_all_modules_are_required_and_completion_is_backend_supplied(): void
    {
        $service = new LearningProgressService($this->createMock(ChapterAccessPolicy::class));
        $program = new Program(['family' => 'jlpt']);
        $chapter = (new Chapter)->forceFill(['id' => 11]);
        $resources = ['video' => [1], 'module' => [2, 3], 'flashcard' => [4], 'audio' => [5], 'reading' => [6]];
        $completed = ['video' => [1], 'module' => [2], 'flashcard' => [4], 'audio' => [5], 'reading' => [6]];
        $this->assertFalse($service->assemble($program, $chapter, $resources, $completed, true, true)['mini_unlocked']);
        $this->assertTrue($service->assemble($program, $chapter, $resources, $completed, true, true, true)['mini_completed']);
        $this->assertFalse($service->assemble($program, $chapter, $resources, $completed, true, true)['mini_completed']);
        foreach (['ssw', 'interview'] as $family) {
            $other = new Program(['family' => $family]);
            $this->assertNotContains('audio', $service->requiredTypes($other));
            $this->assertFalse($service->assemble($other, $chapter, $resources, $completed, true)['mini_unlocked']);
        }
    }

    public function test_attempt_ownership_and_chapter_are_checked_before_access(): void
    {
        $progress = $this->createMock(LearningProgressService::class);
        $progress->expects($this->never())->method('authorize');
        $service = new \App\Services\LearningAttemptService($progress);
        $user = (new \App\Models\User)->forceFill(['id' => 1]);
        $chapter = (new Chapter)->forceFill(['id' => 11]);
        foreach ([[2, 11], [1, 12]] as [$owner, $chapterId]) {
            $attempt = (new \App\Models\LearningAttempt)->forceFill(['user_id' => $owner, 'chapter_id' => $chapterId, 'kind' => 'mini']);
            try {
                $service->authorize($user, new Program, $chapter, $attempt);
                $this->fail('Foreign attempt was authorized.');
            } catch (\Symfony\Component\HttpKernel\Exception\HttpException $error) {
                $this->assertSame(404, $error->getStatusCode());
            }
        }
    }

}
