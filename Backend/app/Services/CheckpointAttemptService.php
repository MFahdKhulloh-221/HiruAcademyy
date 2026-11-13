<?php

namespace App\Services;

use App\Models\CheckpointPackage;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

class CheckpointAttemptService extends TryOutAttemptService
{
    protected string $assessmentModel = CheckpointPackage::class;
    protected string $attemptModel = \App\Models\CheckpointAttempt::class;
    protected string $passageModel = \App\Models\CheckpointPassage::class;
    protected string $parentKey = 'checkpoint_package_id';
    protected string $awardPrefix = 'checkpoint';

    public function __construct(ChapterAccessPolicy $access, CheckpointPackageService $content)
    {
        parent::__construct($access, $content);
    }

    public function canAccess(User $user, Model $tryOut): bool
    {
        return in_array($tryOut->program->code, app(EntitlementService::class)->effectiveAccess($user)['replay_levels'], true);
    }

    protected function snapshotMetadata(Model $assessment, array $questions): array
    {
        $sessions = array_keys(TryOutService::SESSIONS);
        if (! in_array('audio', array_column($questions, 'session'), true)) {
            $sessions = array_values(array_diff($sessions, ['audio']));
        }

        return ['session_policy' => 'checkpoint-optional-audio-v1', 'active_sessions' => $sessions];
    }

    protected function attemptSessions(Model $attempt): array
    {
        if (($attempt->grading_snapshot['session_policy'] ?? null) !== 'checkpoint-optional-audio-v1') {
            return parent::attemptSessions($attempt);
        }
        $sessions = $attempt->grading_snapshot['active_sessions'] ?? null;
        $all = array_keys(TryOutService::SESSIONS);
        if ($sessions !== $all && $sessions !== array_values(array_diff($all, ['audio']))) {
            throw new \LogicException('Invalid checkpoint active sessions snapshot.');
        }

        return array_intersect_key(TryOutService::SESSIONS, array_flip($sessions));
    }

    public function completed(User $user, Model $package, Model $attempt): Model
    {
        abort_unless($user->role === 'student' && $user->account_status === 'active', 403);
        abort_unless($attempt->user_id === $user->id && $attempt->checkpoint_package_id === $package->id, 404);
        abort_unless($attempt->status === 'completed' && $attempt->abandoned_at === null, 403);

        return $attempt;
    }

    public function history(User $user, Model $tryOut): array
    {
        abort_unless($user->role === 'student' && $user->account_status === 'active', 403);
        if ($this->canAccess($user, $tryOut)) {
            return parent::history($user, $tryOut);
        }
        $history = [];
        $best = null;
        foreach ($this->attemptModel::where('user_id', $user->id)->where($this->parentKey, $tryOut->id)
            ->where('status', 'completed')->whereNull('abandoned_at')->orderByDesc('id')->get() as $attempt) {
            $payload = $this->payload($this->completed($user, $tryOut, $attempt));
            $history[] = array_intersect_key($payload, array_flip(['id', 'status', 'started_at', 'expires_at', 'server_now', 'completed_at', 'result']));
            $best = $best === null ? $payload['result']['earned'] : max($best, $payload['result']['earned']);
        }

        return ['attempts' => $history, 'best_score' => $best];
    }

    public function abandon(User $user, Model $tryOut, Model $attempt): void
    {
        if (isset($attempt->grading_snapshot['max_score'])) {
            parent::abandon($user, $tryOut, $attempt);
            return;
        }
        \Illuminate\Support\Facades\DB::transaction(function () use ($user, $tryOut, $attempt) {
            app(GamificationService::class)->lock($user);
            $locked = $this->attemptModel::whereKey($attempt->id)->lockForUpdate()->firstOrFail();
            $this->authorize($user, $tryOut, $locked);
            if ($locked->abandoned_at !== null) return;
            abort_unless($locked->status === 'in_progress', 409, 'Checkpoint attempt is already finished.');
            $locked->update(['abandoned_at' => now(), 'revision' => $locked->revision + 1]);
        }, 3);
    }

    public function save(User $user, Model $tryOut, Model $attempt, array $answers, int $revision, bool $finishSession = false): Model
    {
        return isset($attempt->grading_snapshot['max_score'])
            ? parent::save($user, $tryOut, $attempt, $answers, $revision, $finishSession)
            : app(LegacyCheckpointAttemptService::class)->mutate($user, $tryOut, $attempt, 'save', $revision, $answers);
    }

    public function submit(User $user, Model $tryOut, Model $attempt, int $revision): Model
    {
        return isset($attempt->grading_snapshot['max_score'])
            ? parent::submit($user, $tryOut, $attempt, $revision)
            : app(LegacyCheckpointAttemptService::class)->mutate($user, $tryOut, $attempt, 'submit', $revision);
    }

    public function refresh(User $user, Model $tryOut, Model $attempt): Model
    {
        return isset($attempt->grading_snapshot['max_score'])
            ? parent::refresh($user, $tryOut, $attempt)
            : app(LegacyCheckpointAttemptService::class)->mutate($user, $tryOut, $attempt, 'read');
    }

    public function payload(Model $attempt, bool $review = false, bool $incorrectOnly = false): array
    {
        return isset($attempt->grading_snapshot['max_score'])
            ? parent::payload($attempt, $review, $incorrectOnly)
            : app(LegacyCheckpointAttemptService::class)->payload($attempt, $review);
    }
}
