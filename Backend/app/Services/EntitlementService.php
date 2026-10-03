<?php

namespace App\Services;

use App\Models\AccessGrant;
use App\Models\User;
use Illuminate\Validation\ValidationException;

class EntitlementService
{
    private const JLPT_LEVELS = ['n5', 'n4', 'n3', 'n2', 'n1'];

    public function effectiveAccess(User $user): array
    {
        if ($user->role !== 'student') {
            throw ValidationException::withMessages(['user_id' => 'Effective access requires a student account.']);
        }

        $learning = array_fill_keys(['dasar', ...self::JLPT_LEVELS], 'preview');
        $learning += ['ssw-food' => 'none', 'interview' => 'none'];
        $replay = [];
        $sources = [];
        $today = now(config('app.timezone'))->toDateString();
        $grants = AccessGrant::with('program')->where('user_id', $user->id)
            ->where('status', 'active')->where('starts_at', '<=', $today)
            ->where('ends_at', '>=', $today)->orderBy('id')->get();

        foreach ($grants as $grant) {
            $code = $grant->program->code;
            $rank = array_search($code, self::JLPT_LEVELS, true);
            if ($rank !== false && in_array($grant->plan_code, ['lms', 'sensei'], true)) {
                $learning['dasar'] = 'full';
                foreach (array_slice(self::JLPT_LEVELS, 0, $rank + 1) as $level) {
                    $learning[$level] = 'full';
                    if ($grant->plan_code === 'sensei') {
                        $replay[$level] = true;
                    }
                }
            } elseif (in_array($code, ['ssw-food', 'interview'], true) && $grant->plan_code === 'lms') {
                $learning[$code] = 'full';
            }

            $sources[] = [
                'id' => $grant->id,
                'program_code' => $code,
                'plan_code' => $grant->plan_code,
                'starts_at' => $grant->starts_at->toDateString(),
                'ends_at' => $grant->ends_at->toDateString(),
            ];
        }

        return [
            'learning' => $learning,
            'replay_levels' => array_values(array_intersect(self::JLPT_LEVELS, array_keys($replay))),
            'source_grants' => $sources,
        ];
    }
}
