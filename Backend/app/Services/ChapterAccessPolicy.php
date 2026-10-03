<?php

namespace App\Services;

use App\Models\User;

class ChapterAccessPolicy
{
    public function __construct(private EntitlementService $entitlements) {}

    public function canAccessChapter(User $user, string $programCode, int $chapterNumber): bool
    {
        if ($chapterNumber < 1) {
            return false;
        }

        $state = $this->entitlements->effectiveAccess($user)['learning'][$programCode] ?? 'none';

        return $state === 'full' || ($state === 'preview' && $chapterNumber === 1);
    }
}
