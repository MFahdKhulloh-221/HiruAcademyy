<?php

namespace App\Services;

use App\Models\TryOut;
use App\Models\TryOutAttempt;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class TryOutAttemptService
{
    protected string $assessmentModel = TryOut::class;
    protected string $attemptModel = TryOutAttempt::class;
    protected string $passageModel = \App\Models\TryOutPassage::class;
    protected string $parentKey = 'try_out_id';
    protected string $awardPrefix = 'tryout';

    public function __construct(private ChapterAccessPolicy $access, private TryOutService $content) {}

    public function authorize(User $user, Model $tryOut, ?Model $attempt = null): void
    {
        abort_unless($user->role === 'student' && $user->account_status === 'active', 403);
        if ($attempt) {
            abort_unless($attempt->user_id === $user->id && $attempt->{$this->parentKey} === $tryOut->id, 404);
        }
        $program = $tryOut->program()->firstOrFail();
        $tryOut->setRelation('program', $program);
        abort_unless($this->access->canAccessProgram($user, $program) && $program->family === 'jlpt' && in_array($program->code, ['n5', 'n4', 'n3', 'n2', 'n1'], true), 404);
        abort_unless($this->canAccess($user, $tryOut), 403);
        if (! $attempt) {
            abort_unless($tryOut->status === 'published', 404);
        }
    }

    public function canAccess(User $user, Model $tryOut): bool
    {
        return $tryOut->access_type === 'free'
            || ($this->access->canAccessChapter($user, $tryOut->program->code, 2));
    }

    public function start(User $user, Model $tryOut): Model
    {
        return DB::transaction(function () use ($user, $tryOut) {
            $parent = $this->assessmentModel::whereKey($tryOut->id)->lockForUpdate()->firstOrFail();
            $this->authorize($user, $parent);
            $this->content->assertPublishable($parent);
            $questions = [];
            $grading = [];
            $imageFields = $this->content->imageFields();
            foreach (array_keys(TryOutService::SESSIONS) as $session) {
                foreach ($parent->questions()->where('status', 'published')->where('session', $session)->orderBy('sort_order')->orderBy('id')->get() as $question) {
                    $questions[] = $question->only(array_merge(['id', 'passage_id', 'session', 'question', 'options', 'reading_passage', 'audio_url', 'instruction', 'japanese'], $imageFields));
                    $grading[$question->id] = $question->only(['correct_option', 'explanation', 'point_value']);
                }
            }

            $startedAt = now();

            return $this->attemptModel::create(['user_id' => $user->id, $this->parentKey => $parent->id, 'status' => 'in_progress', 'content_snapshot' => $questions, 'grading_snapshot' => array_replace(['passages' => $this->passageModel::where($this->parentKey, $parent->id)->get($this->content->passageFields())->keyBy('id')->toArray(), 'questions' => $grading, 'total_passing_score' => $parent->total_passing_score, 'max_score' => $parent->max_score, 'session_passing_scores' => $parent->session_passing_scores], $this->snapshotMetadata($parent, $questions)), 'answers' => [], 'completed_sessions' => [], 'current_session' => 0, 'revision' => 0, 'started_at' => $startedAt, 'expires_at' => $this->deadline($parent, $startedAt)] + ($this->assessmentModel === TryOut::class ? ['phase' => 'session', 'session_started_at' => $startedAt] : []))->fresh();
        }, 3);
    }

    protected function deadline(Model $assessment, $startedAt)
    {
        if ($this->assessmentModel === TryOut::class) {
            return $startedAt->copy()->addMinutes($assessment->session_duration_minutes[array_key_first(TryOutService::TIMING_SESSIONS)]);
        }

        return $assessment->duration_minutes === null ? null : $startedAt->copy()->addMinutes($assessment->duration_minutes);
    }

    protected function snapshotMetadata(Model $assessment, array $questions): array
    {
        return $this->assessmentModel === TryOut::class ? [
            'timing_mode' => 'per_session',
            'session_duration_minutes' => $assessment->session_duration_minutes,
            'break_duration_minutes' => $assessment->break_duration_minutes,
        ] : [];
    }

    private function perSession(Model $attempt): bool
    {
        return $this->assessmentModel === TryOut::class && ($attempt->grading_snapshot['timing_mode'] ?? null) === 'per_session';
    }

    private function finishActiveSession(User $user, Model $tryOut, Model $attempt, $endedAt, bool $timedOut = false): Model
    {
        $sessions = array_keys($this->timingSessions($attempt));
        $completed = $attempt->completed_sessions;
        $completed[] = $sessions[$attempt->current_session];
        if (count($completed) === count($sessions)) {
            if (! $timedOut) {
                return $this->finalize($user, $tryOut, $attempt);
            }
            $attempt->update([
                'completed_sessions' => $completed, 'current_session' => count($sessions),
                'phase' => 'review', 'expires_at' => null, 'break_ends_at' => null,
                'revision' => $attempt->revision + 1,
            ]);

            return $attempt;
        }
        $attempt->update([
            'completed_sessions' => $completed, 'current_session' => count($completed),
            'phase' => 'break', 'expires_at' => null,
            'break_ends_at' => $endedAt->copy()->addMinutes($attempt->grading_snapshot['break_duration_minutes']),
            'revision' => $attempt->revision + 1,
        ]);

        return $attempt;
    }

    private function catchUp(User $user, Model $tryOut, Model $attempt): Model
    {
        if (! $this->perSession($attempt)) {
            return $this->expired($attempt) ? $this->finalize($user, $tryOut, $attempt) : $attempt;
        }
        // Each frozen session can expire once and each intervening break can end once.
        for ($step = 0, $limit = count($this->timingSessions($attempt)) * 2; $step < $limit && $attempt->status === 'in_progress'; $step++) {
            if ($attempt->phase === 'session' && $this->expired($attempt)) {
                $this->finishActiveSession($user, $tryOut, $attempt, $attempt->expires_at, true);
            } elseif ($attempt->phase === 'break' && $attempt->break_ends_at !== null && now()->greaterThanOrEqualTo($attempt->break_ends_at)) {
                $this->beginSession($attempt, $attempt->break_ends_at->copy());
            } else {
                break;
            }
        }

        return $attempt;
    }

    private function beginSession(Model $attempt, $startedAt): void
    {
        $session = array_keys($this->timingSessions($attempt))[$attempt->current_session];
        $attempt->update([
            'phase' => 'session', 'session_started_at' => $startedAt, 'break_ends_at' => null,
            'expires_at' => $startedAt->copy()->addMinutes($attempt->grading_snapshot['session_duration_minutes'][$session]),
            'revision' => $attempt->revision + 1,
        ]);
    }

    public function nextSession(User $user, Model $tryOut, Model $attempt, int $revision): Model
    {
        return DB::transaction(function () use ($user, $tryOut, $attempt, $revision) {
            app(GamificationService::class)->lock($user);
            $locked = $this->attemptModel::whereKey($attempt->id)->lockForUpdate()->firstOrFail();
            $this->authorize($user, $tryOut, $locked);
            abort_if($locked->abandoned_at !== null, 409, 'Try out attempt was abandoned.');
            abort_unless($this->perSession($locked) && $locked->status === 'in_progress', 409);
            $beforeCatchUp = $locked->revision;
            $locked = $this->catchUp($user, $tryOut, $locked);
            if ($locked->revision !== $beforeCatchUp) {
                return $locked;
            }
            abort_unless($locked->revision === $revision, 409, 'Stale answer revision.');
            abort_unless($locked->phase === 'break' && $locked->break_ends_at !== null, 409, 'Attempt is not on a break.');
            $this->beginSession($locked, now());

            return $locked;
        }, 3);
    }

    protected function attemptSessions(Model $attempt): array
    {
        return TryOutService::SESSIONS;
    }

    private function timingSessions(Model $attempt): array
    {
        // ponytail: frozen four-category snapshots keep legacy timing until completion.
        return $this->perSession($attempt) && array_key_exists('grammar_reading', $attempt->grading_snapshot['session_duration_minutes'])
            ? TryOutService::TIMING_SESSIONS
            : $this->attemptSessions($attempt);
    }

    private function activeTimingCategories(Model $attempt): array
    {
        $session = array_keys($this->timingSessions($attempt))[$attempt->current_session];

        return $session === 'grammar_reading' ? TryOutService::TIMING_CATEGORIES[$session] : [$session];
    }

    public function abandon(User $user, Model $tryOut, Model $attempt): void
    {
        DB::transaction(function () use ($user, $tryOut, $attempt) {
            app(GamificationService::class)->lock($user);
            $locked = $this->attemptModel::whereKey($attempt->id)->lockForUpdate()->firstOrFail();
            $this->authorize($user, $tryOut, $locked);
            if ($locked->abandoned_at !== null) {
                return;
            }
            abort_unless($locked->status === 'in_progress', 409, 'Try out attempt is already finished.');
            $locked->update(['abandoned_at' => now(), 'revision' => $locked->revision + 1]);
        }, 3);
    }

    public function save(User $user, Model $tryOut, Model $attempt, array $answers, int $revision, bool $finishSession = false): Model
    {
        return DB::transaction(function () use ($user, $tryOut, $attempt, $answers, $revision, $finishSession) {
            app(GamificationService::class)->lock($user);
            $locked = $this->attemptModel::whereKey($attempt->id)->lockForUpdate()->firstOrFail();
            $this->authorize($user, $tryOut, $locked);
            abort_if($locked->abandoned_at !== null, 409, 'Try out attempt was abandoned.');
            $beforeCatchUp = $locked->revision;
            $locked = $this->catchUp($user, $tryOut, $locked);
            if ($locked->revision !== $beforeCatchUp) {
                return $locked;
            }
            abort_unless($locked->status === 'in_progress', 409, $this->attemptMessage('Try out attempt is already finished.'));
            abort_unless($locked->revision === $revision, 409, $this->attemptMessage('Stale answer revision.'));
            if ($this->perSession($locked)) {
                abort_unless($locked->phase === 'session', 409, 'Answers are locked during break or review.');
            }
            $activeQuestions = $this->perSession($locked)
                ? array_filter($locked->content_snapshot, fn ($question) => in_array($question['session'], $this->activeTimingCategories($locked), true))
                : $locked->content_snapshot;
            $allIds = array_map('strval', array_column($activeQuestions, 'id'));
            foreach ($answers as $id => $answer) {
                if (! in_array((string) $id, $allIds, true) || ! in_array($answer, ['A', 'B', 'C', 'D'], true)) {
                    throw ValidationException::withMessages(['answers' => $this->attemptMessage('Only valid try out questions and A–D options allowed.')]);
                }
            }
            $persisted = array_replace($locked->answers, $answers);
            if ($this->perSession($locked)) {
                $locked->answers = $persisted;
                if ($finishSession) {
                    return $this->finishActiveSession($user, $tryOut, $locked, now());
                }
                $locked->update(['answers' => $persisted, 'revision' => $locked->revision + 1]);

                return $locked;
            }
            $completed = $locked->completed_sessions;
            $sessions = $this->attemptSessions($locked);
            if ($finishSession && $locked->current_session < count($sessions)) {
                $session = array_keys($sessions)[$locked->current_session];
                if (! in_array($session, $completed, true)) {
                    $completed[] = $session;
                }
            }
            $locked->update(['answers' => $persisted, 'completed_sessions' => $completed, 'current_session' => count($completed), 'revision' => $locked->revision + 1]);

            return $locked;
        }, 3);
    }

    public function submit(User $user, Model $tryOut, Model $attempt, int $revision): Model
    {
        return DB::transaction(function () use ($user, $tryOut, $attempt, $revision) {
            app(GamificationService::class)->lock($user);
            $locked = $this->attemptModel::whereKey($attempt->id)->lockForUpdate()->firstOrFail();
            $this->authorize($user, $tryOut, $locked);
            abort_if($locked->abandoned_at !== null, 409, 'Try out attempt was abandoned.');
            if ($locked->status === 'completed') {
                return $locked;
            }
            if ($this->perSession($locked)) {
                $beforeCatchUp = $locked->revision;
                $locked = $this->catchUp($user, $tryOut, $locked);
                if ($locked->revision !== $beforeCatchUp) {
                    return $locked;
                }
                abort_unless($locked->revision === $revision, 409, $this->attemptMessage('Stale answer revision.'));
                if ($locked->phase === 'review') {
                    return $this->finalize($user, $tryOut, $locked);
                }
                abort_unless($locked->phase === 'session' && $locked->current_session === count($this->timingSessions($locked)) - 1, 409, 'Finish each session before submitting.');

                return $this->finishActiveSession($user, $tryOut, $locked, now());
            }
            if (! $this->expired($locked)) {
                abort_unless($locked->revision === $revision, 409, $this->attemptMessage('Stale answer revision.'));
            }

            return $this->finalize($user, $tryOut, $locked);
        }, 3);
    }

    protected function attemptMessage(string $message): string
    {
        return $message;
    }

    protected function expired(Model $attempt): bool
    {
        return $attempt->status === 'in_progress' && $attempt->expires_at !== null && now()->greaterThanOrEqualTo($attempt->expires_at);
    }

    public function refresh(User $user, Model $tryOut, Model $attempt): Model
    {
        return DB::transaction(function () use ($user, $tryOut, $attempt) {
            app(GamificationService::class)->lock($user);
            $locked = $this->attemptModel::whereKey($attempt->id)->lockForUpdate()->firstOrFail();
            $this->authorize($user, $tryOut, $locked);
            abort_if($locked->abandoned_at !== null, 409, 'Try out attempt was abandoned.');

            return $this->catchUp($user, $tryOut, $locked);
        }, 3);
    }

    protected function finalize(User $user, Model $tryOut, Model $locked): Model
    {
        $result = ['earned' => 0, 'max' => $locked->grading_snapshot['max_score'] ?? 180, 'correct' => 0, 'wrong' => 0, 'unanswered' => 0, 'sessions' => [], 'total_passing_score' => $locked->grading_snapshot['total_passing_score'], 'overall_pass' => null];
        $sessions = $this->attemptSessions($locked);
        foreach ($sessions as $session => $label) {
            $section = ['code' => $session, 'label' => $label, 'earned' => 0, 'max' => 0, 'correct' => 0, 'wrong' => 0, 'unanswered' => 0, 'passing_score' => 19, 'pass' => false];
            foreach ($locked->content_snapshot as $question) {
                if ($question['session'] !== $session) {
                    continue;
                }
                $grade = $locked->grading_snapshot['questions'][$question['id']];
                $answer = $locked->answers[$question['id']] ?? null;
                $outcome = $answer === null ? 'unanswered' : ($answer === $grade['correct_option'] ? 'correct' : 'wrong');
                $section[$outcome]++;
                $section['max'] += $grade['point_value'];
                $section['earned'] += $outcome === 'correct' ? $grade['point_value'] : 0;
            }
            // Sum raw points before rounding sections so total is rounded only once.
            foreach (['earned', 'correct', 'wrong', 'unanswered'] as $key) {
                $result[$key] += $section[$key];
            }
            if ($this->assessmentModel === TryOut::class) {
                $section['earned'] = (int) round($section['earned'], 0, PHP_ROUND_HALF_UP);
                $section['max'] = (int) round($section['max'], 0, PHP_ROUND_HALF_UP);
            }
            // ponytail: null preserves legacy 19-correct-answer attempts; explicit admin thresholds use points.
            $configured = $locked->grading_snapshot['session_passing_scores'][$session] ?? null;
            $section['passing_score'] = $configured ?? 19;
            $section['passing_score_basis'] = $configured === null ? 'correct_answers' : 'points';
            $section['pass'] = ($configured === null ? $section['correct'] : $section['earned']) >= $section['passing_score'];
            $result['sessions'][] = $section;
        }
        if ($this->assessmentModel === TryOut::class) {
            $result['earned'] = (int) round($result['earned'], 0, PHP_ROUND_HALF_UP);
        }
        $result['overall_pass'] = ! in_array(false, array_column($result['sessions'], 'pass'), true)
            && ($result['total_passing_score'] === null || $result['earned'] >= $result['total_passing_score']);
        $result = $this->normalizeResult($result);
        $sessions = $this->timingSessions($locked);
        $locked->update(['result_snapshot' => $result, 'status' => 'completed', 'completed_sessions' => array_keys($sessions), 'current_session' => count($sessions), 'completed_at' => now(), 'revision' => $locked->revision + 1] + ($this->perSession($locked) ? ['expires_at' => null, 'break_ends_at' => null] : []));

        if ($this->awardPrefix !== '' && count($locked->answers ?? []) > 0) {
            app(GamificationService::class)->award($user, $this->awardPrefix.':'.$tryOut->id, 20);
        }

        return $locked->fresh();
    }

    protected function normalizeResult(array $result): array
    {
        return $result;
    }

    private function result(Model $attempt): ?array
    {
        if ($attempt->status !== 'completed') {
            return null;
        }
        $result = array_intersect_key($attempt->result_snapshot, array_flip(['earned', 'max', 'correct', 'wrong', 'unanswered', 'total_passing_score', 'overall_pass']));
        $result['sessions'] = array_map(fn ($section) => array_intersect_key($section, array_flip(['code', 'label', 'earned', 'max', 'correct', 'wrong', 'unanswered', 'passing_score', 'passing_score_basis', 'pass'])), $attempt->result_snapshot['sessions']);

        return $result;
    }

    private function timingPayload(Model $attempt): array
    {
        return $this->perSession($attempt) ? [
            'timing_mode' => 'per_session', 'phase' => $attempt->phase,
            'timing_sessions' => $this->timingSessions($attempt),
            'session_started_at' => $attempt->session_started_at?->toISOString(),
            'break_ends_at' => $attempt->break_ends_at?->toISOString(),
            'session_duration_minutes' => $attempt->grading_snapshot['session_duration_minutes'],
            'break_duration_minutes' => $attempt->grading_snapshot['break_duration_minutes'],
        ] : ($this->assessmentModel === TryOut::class ? ['timing_mode' => 'global'] : []);
    }

    public function payload(Model $attempt, bool $review = false, bool $incorrectOnly = false): array
    {
        abort_if($review && $attempt->status !== 'completed', 403);
        $questions = [];
        foreach ($attempt->content_snapshot as $question) {
            if ($this->perSession($attempt) && $attempt->status === 'in_progress' && $attempt->phase !== 'review'
                && ($attempt->phase !== 'session' || ! in_array($question['session'], $this->activeTimingCategories($attempt), true))) {
                continue;
            }
            $grade = $attempt->grading_snapshot['questions'][$question['id']];
            if ($review && $incorrectOnly && ($attempt->answers[$question['id']] ?? null) === $grade['correct_option']) {
                continue;
            }
            $item = array_intersect_key($question, array_flip(array_merge(['id', 'session', 'question', 'reading_passage', 'audio_url', 'instruction', 'japanese'], $this->content->imageFields())));
            if (isset($question['passage_id'])) {
                $passage = $attempt->grading_snapshot['passages'][$question['passage_id']] ?? null;
                $item['passage'] = $passage !== null && $this->content->builderCapabilities()['images']
                    ? array_intersect_key($passage, array_flip(['id', 'title', 'body', 'image', 'image_alt', 'image_position', 'blocks']))
                    : $passage;
            }
            $item['options'] = array_intersect_key($question['options'], array_flip(['A', 'B', 'C', 'D']));
            if ($review) {
                $item += array_intersect_key($grade, array_flip(['correct_option', 'explanation', 'point_value']));
            }
            $questions[] = app(MediaService::class)->payload($item);
        }

        return ['id' => $attempt->id, $this->parentKey => $attempt->{$this->parentKey}, 'status' => $attempt->status, 'revision' => $attempt->revision, 'current_session' => $attempt->current_session, 'completed_sessions' => $attempt->completed_sessions, 'questions' => $questions, 'answers' => $attempt->answers, 'result' => $this->result($attempt), 'started_at' => $attempt->started_at->toISOString(), 'expires_at' => $attempt->expires_at?->toISOString(), 'server_now' => now()->toISOString(), 'completed_at' => ($attempt->completed_at ?? $attempt->submitted_at)?->toISOString()] + $this->timingPayload($attempt) + ($this->assessmentModel !== TryOut::class && ($attempt->grading_snapshot['session_policy'] ?? null) === 'checkpoint-optional-audio-v1' ? ['active_sessions' => array_keys($this->attemptSessions($attempt))] : []);
    }

    public function history(User $user, Model $tryOut): array
    {
        $this->authorize($user, $tryOut, new $this->attemptModel(['user_id' => $user->id, $this->parentKey => $tryOut->id]));
        $attempts = $this->attemptModel::where('user_id', $user->id)->where($this->parentKey, $tryOut->id)->whereNull('abandoned_at')->orderByDesc('id')->get();
        $best = null;
        $history = [];
        foreach ($attempts as $attempt) {
            $attempt = $this->refresh($user, $tryOut, $attempt);
            $result = $this->payload($attempt)['result'];
            if ($result !== null) {
                $best = $best === null ? $result['earned'] : max($best, $result['earned']);
            }
            $history[] = ['id' => $attempt->id, 'status' => $attempt->status, 'started_at' => $attempt->started_at->toISOString(), 'expires_at' => $attempt->expires_at?->toISOString(), 'server_now' => now()->toISOString(), 'completed_at' => ($attempt->completed_at ?? $attempt->submitted_at)?->toISOString(), 'result' => $result, 'revision' => $attempt->revision, 'current_session' => $attempt->current_session, 'completed_sessions' => $attempt->completed_sessions] + $this->timingPayload($attempt);
        }

        return ['attempts' => $history, 'best_score' => $best];
    }
}
