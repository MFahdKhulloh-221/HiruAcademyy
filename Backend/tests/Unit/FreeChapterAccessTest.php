<?php

namespace Tests\Unit;

use App\Models\User;
use App\Services\ChapterAccessPolicy;
use App\Services\EntitlementService;
use PHPUnit\Framework\TestCase;

final class FreeChapterAccessTest extends TestCase
{
    public function test_preview_allows_only_chapter_one_without_paid_entitlement(): void
    {
        $entitlements = $this->createMock(EntitlementService::class);
        $entitlements->method('effectiveAccess')->willReturn(['learning' => ['dasar' => 'preview', 'n5' => 'preview', 'ssw-food' => 'none']]);
        $policy = new ChapterAccessPolicy($entitlements);
        $user = new User;

        self::assertTrue($policy->canAccessChapter($user, 'dasar', 1));
        self::assertTrue($policy->canAccessChapter($user, 'n5', 1));
        self::assertFalse($policy->canAccessChapter($user, 'dasar', 2));
        self::assertFalse($policy->canAccessChapter($user, 'n5', 2));
        self::assertFalse($policy->canAccessChapter($user, 'ssw-food', 1));
        self::assertFalse($policy->canAccessChapter($user, 'dasar', 0));
    }
}
