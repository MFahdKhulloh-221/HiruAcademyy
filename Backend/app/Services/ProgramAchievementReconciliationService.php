<?php

namespace App\Services;

use App\Models\Program;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use Throwable;

class ProgramAchievementReconciliationService
{
    public function schedule(int $userId, int $programId): void
    {
        $this->validateIds($userId, $programId);
        try {
            DB::afterCommit(static function () use ($userId, $programId): void {
                // ponytail: synchronous best effort; explicit bounded reconciliation retries missed delivery.
                try {
                    // Testing transaction managers may fire before the real root commit.
                    if (DB::transactionLevel() > 0) {
                        return;
                    }
                    app(self::class)->reconcile($userId, $programId);
                } catch (Throwable $exception) {
                    self::reportFailure($exception);
                }
            });
        } catch (Throwable $exception) {
            self::reportFailure($exception);
        }
    }

    public function reconcile(int $userId, int $programId): array
    {
        $this->validateIds($userId, $programId);
        try {
            if (DB::transactionLevel() > 0) {
                $this->schedule($userId, $programId);

                return ['achievement' => null, 'reason' => 'deferred_until_commit'];
            }
            $user = User::find($userId);
            $program = Program::find($programId);
            if ($user === null || $program === null) {
                return ['achievement' => null, 'reason' => 'not_found'];
            }

            return app(ProgramAchievementService::class)->issue($user, $program);
        } catch (Throwable $exception) {
            self::reportFailure($exception);

            return ['achievement' => null, 'reason' => 'reconciliation_failed'];
        }
    }

    public function batch(array $pairs): array
    {
        if (count($pairs) > 100) {
            throw new InvalidArgumentException('Reconciliation accepts at most 100 user/program pairs.');
        }
        foreach ($pairs as $pair) {
            if (! is_array($pair) || ! is_int($pair['user_id'] ?? null) || ! is_int($pair['program_id'] ?? null)) {
                throw new InvalidArgumentException('Reconciliation requires integer user_id and program_id.');
            }
            $this->validateIds($pair['user_id'], $pair['program_id']);
        }

        $results = [];
        foreach ($pairs as $pair) {
            $results[] = ['user_id' => $pair['user_id'], 'program_id' => $pair['program_id']]
                + $this->reconcile($pair['user_id'], $pair['program_id']);
        }

        return $results;
    }

    private function validateIds(int $userId, int $programId): void
    {
        if ($userId < 1 || $programId < 1) {
            throw new InvalidArgumentException('Reconciliation requires positive user/program IDs.');
        }
    }

    private static function reportFailure(Throwable $exception): void
    {
        try {
            report($exception);
        } catch (Throwable) {
            // A failing reporter must not turn committed learning writes into an error response.
        }
    }
}
