<?php

namespace App\Services;

use App\Models\Program;
use App\Models\ProgramAchievement;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\QueryException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use LogicException;

class ProgramAchievementService
{
    public function __construct(
        private ProgramAchievementSettings $settings,
        private ProgramAchievementEligibility $eligibility,
        private ProgramAchievementLearningType $learningType,
    ) {}

    public function collection(User $user): Collection
    {
        $this->authorize($user);

        return $this->achievements()->where('user_id', $user->getKey())->orderByDesc('issued_at')->get();
    }

    public function issue(User $user, Program $program): array
    {
        $this->authorize($user);
        abort_unless($program->exists && $program->getKey() !== null, 404);
        $existing = $this->existing($user, $program);
        if ($existing !== null) {
            return ['achievement' => $existing, 'reason' => 'existing'];
        }
        if (DB::getDriverName() !== 'pgsql') {
            throw new LogicException('Program achievement issuance requires PostgreSQL.');
        }

        if (DB::transactionLevel() > 0) {
            $userId = $user->getKey();
            $programId = $program->getKey();
            DB::afterCommit(function () use ($userId, $programId): void {
                // Synchronous best effort, not durable delivery. Future issue calls can retry.
                // Callback results cannot be delivered to the original caller.
                try {
                    $user = User::find($userId);
                    $program = Program::find($programId);
                    if ($user !== null && $program !== null) {
                        $this->issue($user, $program);
                    }
                } catch (\Throwable $exception) {
                    // Learning writes already committed; issuance failure must not imply rollback.
                    report($exception);
                }
            });

            return ['achievement' => null, 'reason' => 'deferred_until_commit'];
        }

        try {
            return DB::transaction(function () use ($user, $program) {
                // Eligibility/settings/grants share one MVCC snapshot, not commit-latest state.
                // Concurrent writes may follow issuance; READ COMMITTED writers have no global serializability guarantee.
                DB::statement('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
                DB::statement("SET LOCAL lock_timeout='2s'");
                DB::statement("SET LOCAL statement_timeout='8s'");
                $user = $user->newQuery()->whereKey($user->getKey())->firstOrFail();
                $this->authorize($user);
                $program = $program->newQuery()->whereKey($program->getKey())->firstOrFail();
                $existing = $this->existing($user, $program);
                if ($existing !== null) {
                    return ['achievement' => $existing, 'reason' => 'existing'];
                }
                $settings = $this->settings->resolve($program);
                if (! $settings['automatic_enabled']) {
                    return ['achievement' => null, 'reason' => 'disabled'];
                }
                // MediaService does not yet retain achievement references during deletion.
                if (($settings['background_image'] ?? null) !== null) {
                    return ['achievement' => null, 'reason' => 'media_reference_unresolved'];
                }
                $eligibility = $this->eligibility->evaluate($user, $program);
                if (! $eligibility['eligible']) {
                    return ['achievement' => null, 'reason' => $eligibility['reason']];
                }
                $learningType = $this->learningType->resolve($user, $program);
                // No explicit full-free-program policy exists; never infer free issuance.
                if (! in_array($learningType['learning_type'], ['lms', 'sensei'], true)) {
                    return ['achievement' => null, 'reason' => 'learning_type_unresolved'];
                }
                abort_unless(is_string($user->name) && trim($user->name) !== ''
                    && is_string($program->name) && trim($program->name) !== ''
                    && is_string($program->code) && trim($program->code) !== '', 422);

                $achievement = $this->achievements()->newModelInstance([
                    'user_id' => $user->getKey(),
                    'program_id' => $program->getKey(),
                    'student_name_snapshot' => $user->name,
                    'program_name_snapshot' => $program->name,
                    'program_code_snapshot' => $program->code,
                    'learning_type_snapshot' => $learningType['learning_type'],
                    'presentation_snapshot' => Arr::only($settings, ['title', 'description', 'background_image', 'presentation_version'])
                        + ['issuer' => 'HiruAcademy'] + app(CertificateIssuerSettings::class)->resolve(),
                    // Eligibility returns only IDs/timestamps, never raw answers/grading snapshots.
                    'completion_evidence_snapshot' => array_merge($eligibility['evidence'], ['source_grant_id' => $learningType['grant_id'] ?? null]),
                    'issued_at' => now('UTC'),
                ]);
                $achievement->issuedByService = true;
                if ($achievement->save() !== true) {
                    throw new LogicException('Program achievement could not be saved.');
                }

                return ['achievement' => $achievement, 'reason' => 'issued'];
            }, 3);
        } catch (UniqueConstraintViolationException $exception) {
            $existing = $this->existing($user, $program);
            if ($existing === null) {
                throw $exception;
            }

            return ['achievement' => $existing, 'reason' => 'existing'];
        } catch (QueryException $exception) {
            // Laravel retries serialization failures/deadlocks up to the transaction limit.
            if (in_array($exception->errorInfo[0] ?? $exception->getCode(), ['55P03', '40001', '40P01'], true)) {
                return ['achievement' => null, 'reason' => 'issuance_conflict'];
            }

            throw $exception;
        }
    }

    protected function achievements(): Builder
    {
        return ProgramAchievement::query();
    }

    private function existing(User $user, Program $program): ?ProgramAchievement
    {
        return $this->achievements()->where('user_id', $user->getKey())->where('program_id', $program->getKey())->first();
    }

    private function authorize(User $user): void
    {
        abort_unless($user->exists && $user->getKey() !== null
            && $user->role === 'student' && $user->account_status === 'active', 403);
    }
}
