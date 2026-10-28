<?php

namespace Tests\Unit;

use App\Models\Chapter;
use App\Models\Program;
use App\Models\User;
use App\Services\ChapterAccessPolicy;
use App\Services\EntitlementService;
use App\Services\LearningContentService;
use App\Services\LearningProgressService;
use PHPUnit\Framework\TestCase;

final class StandaloneJourneyTest extends TestCase
{
    public function test_standalone_content_progress_and_inactive_entitlement_are_program_scoped(): void
    {
        $user = new User;
        foreach (['ssw' => 'ssw-food', 'interview' => 'interview'] as $family => $code) {
            $entitlements = $this->createMock(EntitlementService::class);
            $entitlements->method('effectiveAccess')->willReturn(['learning' => [$code => 'full']]);
            $policy = new ChapterAccessPolicy($entitlements);
            $program = new Program(['code' => $code, 'family' => $family, 'status' => 'inactive']);
            $this->assertTrue($policy->canAccessProgram($user, $program));
            $this->assertTrue($policy->canAccessChapter($user, $code, 2));
            $this->assertFalse($policy->canAccessChapter($user, $code === 'interview' ? 'ssw-food' : 'interview', 1));
            $service = new LearningProgressService($policy);
            $this->assertSame($family === 'ssw' ? ['video', 'module', 'flashcard'] : ['video', 'module'], $service->requiredTypes($program));
            $this->assertContains('video', LearningContentService::ACTIVITIES[$family]);
            $this->assertContains('module', LearningContentService::ACTIVITIES[$family]);
            $this->assertNotContains('audio', LearningContentService::ACTIVITIES[$family]);
            $this->assertNotContains('reading', LearningContentService::ACTIVITIES[$family]);
            $progress = $service->assemble($program, (new Chapter)->forceFill(['id' => 11]), ['module' => [51]], ['module' => [99]], true);
            $this->assertFalse($progress['activities']['module']['complete']);
            $this->assertSame(0, $progress['activities']['module']['completed']);
            $this->assertFalse($progress['mini_unlocked']);
            $complete = $service->assemble($program, (new Chapter)->forceFill(['id' => 11]), ['module' => [51]], ['module' => [51]], true);
            $this->assertTrue($complete['activities']['module']['complete']);
            $denied = $this->createMock(EntitlementService::class);
            $denied->method('effectiveAccess')->willReturn(['learning' => [$code => 'none']]);
            $this->assertFalse((new ChapterAccessPolicy($denied))->canAccessProgram($user, $program));
        }
    }
}
