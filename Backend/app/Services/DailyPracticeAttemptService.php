<?php

namespace App\Services;

use App\Models\DailyPractice;
use App\Models\DailyPracticeAttempt;
use App\Models\DailyPracticePassage;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

class DailyPracticeAttemptService extends TryOutAttemptService
{
    protected string $assessmentModel = DailyPractice::class;

    protected string $attemptModel = DailyPracticeAttempt::class;

    protected string $passageModel = DailyPracticePassage::class;

    protected string $parentKey = 'daily_practice_id';

    protected string $awardPrefix = '';

    public function __construct(ChapterAccessPolicy $access, DailyPracticeService $content)
    {
        parent::__construct($access, $content);
    }

    public function authorize(User $user, Model $tryOut, ?Model $attempt = null): void
    {
        abort_unless($user->role === 'student' && $user->account_status === 'active', 403);
        abort_unless($tryOut->status === 'published', 404);
        if ($attempt) {
            abort_unless($attempt->user_id === $user->id && $attempt->daily_practice_id === $tryOut->id, 404);
        }
    }

    public function start(User $user, Model $tryOut): Model
    {
        return app(MediaService::class)->locked(function () use ($user, $tryOut) {
            $parent = DailyPractice::whereKey($tryOut->id)->lockForUpdate()->firstOrFail();
            $this->authorize($user, $parent);
            $existing = DailyPracticeAttempt::where('daily_practice_id', $parent->id)->where('user_id', $user->id)->first();
            if ($existing) {
                return $this->refresh($user, $parent, $existing);
            }
            return parent::start($user, $parent);
        });
    }

    public function submit(User $user, Model $tryOut, Model $attempt, int $revision = -1): Model
    {
        return DB::transaction(function () use ($user, $tryOut, $attempt, $revision) {
            app(GamificationService::class)->lock($user);
            $locked = DailyPracticeAttempt::whereKey($attempt->id)->lockForUpdate()->firstOrFail();

            return parent::submit($user, $tryOut, $locked, $revision < 0 ? $locked->revision : $revision);
        }, 3);
    }

    protected function deadline(Model $assessment, $startedAt)
    {
        return null;
    }

    protected function attemptMessage(string $message): string
    {
        return match ($message) {
            'Try out attempt is already finished.' => 'Latihan sudah dikumpulkan.',
            'Stale answer revision.' => 'Jawaban telah diperbarui. Muat ulang latihan sebelum menyimpan kembali.',
            'Only valid try out questions and A–D options allowed.' => 'Jawaban harus memakai soal latihan ini dan pilihan A–D.',
            default => $message,
        };
    }

    protected function expired(Model $attempt): bool
    {
        return false;
    }

    protected function snapshotMetadata(Model $assessment, array $questions): array
    {
        return ['max_score' => (float) $assessment->questions()->sum('point_value'), 'total_passing_score' => null,
            'session_passing_scores' => null, 'category' => $assessment->category];
    }

    protected function attemptSessions(Model $attempt): array
    {
        $code = DailyPracticeService::CATEGORIES[$attempt->grading_snapshot['category']];

        return [$code => TryOutService::SESSIONS[$code]];
    }

    protected function normalizeResult(array $result): array
    {
        $result['overall_pass'] = null;
        foreach ($result['sessions'] as &$session) {
            $session['passing_score'] = null;
            $session['passing_score_basis'] = null;
            $session['pass'] = null;
        }

        return $result;
    }

    public function payload(Model $attempt, bool $review = false, bool $incorrectOnly = false): array
    {
        abort_if($review && $attempt->status !== 'completed', 403, 'Pembahasan tersedia setelah latihan dikumpulkan.');

        return array_replace(parent::payload($attempt, $review, $incorrectOnly), ['expires_at' => null]);
    }

    public function finalizeDue(?int $practiceId = null): int
    {
        // Retain compatibility with callers of the retired scheduler command.
        return 0;
    }
}
