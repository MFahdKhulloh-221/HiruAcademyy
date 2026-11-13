<?php

namespace App\Services;

use App\Models\Program;
use App\Models\User;

class ProgramAchievementLearningType
{
    public function __construct(private EntitlementService $entitlements) {}

    public function resolve(User $user, Program $program): array
    {
        return $this->fromGrants($user, $program, $this->entitlements->qualifyingGrants()->where('user_id', $user->id)->get());
    }

    public function fromGrants(User $user, Program $program, iterable $grants): array
    {
        if ($user->role !== 'student' || $user->account_status !== 'active') {
            return ['learning_type' => null, 'reason' => 'learning_type_unresolved'];
        }
        $today = now(config('app.timezone'))->toDateString();
        $sources = [];
        foreach ($grants as $grant) {
            if ((int) $grant->user_id !== (int) $user->id || $grant->status !== 'active'
                || $grant->starts_at->toDateString() > $today || $grant->ends_at->toDateString() < $today
                || ! $grant->program || ! in_array($grant->plan_code, ['lms', 'sensei'], true)) {
                continue;
            }
            // Project each source independently: preserve existing cumulative entitlement rules.
            $access = $this->entitlements->project($user, [$grant]);
            if (($access['learning'][$program->code] ?? 'none') === 'full') {
                $sources[] = ['learning_type' => $grant->plan_code, 'grant_id' => (int) $grant->id];
            }
        }
        usort($sources, fn ($a, $b) => (($a['learning_type'] === 'sensei' ? 0 : 1) <=> ($b['learning_type'] === 'sensei' ? 0 : 1)) ?: ($a['grant_id'] <=> $b['grant_id']));

        // No existing explicit full-free-program policy; preview access cannot prove this.
        return $sources === [] ? ['learning_type' => null, 'reason' => 'learning_type_unresolved'] : $sources[0] + ['reason' => 'resolved'];
    }
}
