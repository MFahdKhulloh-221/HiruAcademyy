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
        return app(ChapterAccessPolicy::class)->canAccessChapter($user, $tryOut->program->code, 2);
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
