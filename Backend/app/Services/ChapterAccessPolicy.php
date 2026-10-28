<?php

namespace App\Services;

use App\Models\Program;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

class ChapterAccessPolicy
{
    public function __construct(private EntitlementService $entitlements) {}

    public function canAccessProgram(User $user, Program $program): bool
    {
        return $program->status === 'active'
            || ($program->status === 'inactive'
                && ($this->entitlements->effectiveAccess($user)['learning'][$program->code] ?? 'none') === 'full');
    }

    public function scopePrograms(Builder $query, User $user, ?array $learning = null): Builder
    {
        $fullCodes = array_keys(array_filter($learning ?? $this->entitlements->effectiveAccess($user)['learning'], fn ($state) => $state === 'full'));

        return $query->where(fn (Builder $program) => $program->where('status', 'active')
            ->orWhere(fn (Builder $inactive) => $inactive->where('status', 'inactive')->whereIn('code', $fullCodes)));
    }

    public function canAccessChapter(User $user, string $programCode, int $chapterNumber): bool
    {
        if ($chapterNumber < 1) {
            return false;
        }

        $state = $this->entitlements->effectiveAccess($user)['learning'][$programCode] ?? 'none';

        return $state === 'full' || ($state === 'preview' && $chapterNumber === 1);
    }
}
