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
            foreach (array_keys(TryOutService::SESSIONS) as $session) {
                foreach ($parent->questions()->where('status', 'published')->where('session', $session)->orderBy('sort_order')->orderBy('id')->get() as $question) {
                    $questions[] = $question->only(['id', 'passage_id', 'session', 'question', 'options', 'reading_passage', 'audio_url', 'instruction', 'japanese']);
                    $grading[$question->id] = $question->only(['correct_option', 'explanation', 'point_value']);
                }
            }

            $startedAt = now();

            return $this->attemptModel::create(['user_id' => $user->id, $this->parentKey => $parent->id, 'status' => 'in_progress', 'content_snapshot' => $questions, 'grading_snapshot' => ['passages' => $this->passageModel::where($this->parentKey, $parent->id)->get(['id', 'title', 'body'])->keyBy('id')->toArray(), 'questions' => $grading, 'total_passing_score' => $parent->total_passing_score, 'max_score' => $parent->max_score, 'session_passing_scores' => $parent->session_passing_scores], 'answers' => [], 'completed_sessions' => [], 'current_session' => 0, 'revision' => 0, 'started_at' => $startedAt, 'expires_at' => $parent->duration_minutes === null ? null : $startedAt->copy()->addMinutes($parent->duration_minutes)])->fresh();
        }, 3);
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
            if ($this->expired($locked)) {
                return $this->finalize($user, $tryOut, $locked);
            }
            abort_unless($locked->status === 'in_progress', 409, 'Try out attempt is already finished.');
            abort_unless($locked->revision === $revision, 409, 'Stale answer revision.');
            $allIds = array_map('strval', array_column($locked->content_snapshot, 'id'));
            foreach ($answers as $id => $answer) {
                if (! in_array((string) $id, $allIds, true) || ! in_array($answer, ['A', 'B', 'C', 'D'], true)) {
                    throw ValidationException::withMessages(['answers' => 'Only valid try out questions and A–D options allowed.']);
                }
            }
            $persisted = array_replace($locked->answers, $answers);
            $completed = $locked->completed_sessions;
            if ($finishSession && $locked->current_session < 4) {
                $session = array_keys(TryOutService::SESSIONS)[$locked->current_session];
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
            if (! $this->expired($locked)) {
                abort_unless($locked->revision === $revision, 409, 'Stale answer revision.');
            }

            return $this->finalize($user, $tryOut, $locked);
        }, 3);
    }

    private function expired(Model $attempt): bool
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

            return $this->expired($locked) ? $this->finalize($user, $tryOut, $locked) : $locked;
        }, 3);
    }

    private function finalize(User $user, Model $tryOut, Model $locked): Model
    {
        $result = ['earned' => 0, 'max' => $locked->grading_snapshot['max_score'] ?? 180, 'correct' => 0, 'wrong' => 0, 'unanswered' => 0, 'sessions' => [], 'total_passing_score' => $locked->grading_snapshot['total_passing_score'], 'overall_pass' => null];
        foreach (TryOutService::SESSIONS as $session => $label) {
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
            // ponytail: null preserves legacy 19-correct-answer attempts; explicit admin thresholds use points.
            $configured = $locked->grading_snapshot['session_passing_scores'][$session] ?? null;
            $section['passing_score'] = $configured ?? 19;
            $section['passing_score_basis'] = $configured === null ? 'correct_answers' : 'points';
            $section['pass'] = ($configured === null ? $section['correct'] : $section['earned']) >= $section['passing_score'];
            $result['sessions'][] = $section;
            foreach (['earned', 'correct', 'wrong', 'unanswered'] as $key) {
                $result[$key] += $section[$key];
            }
        }
        $result['overall_pass'] = ! in_array(false, array_column($result['sessions'], 'pass'), true)
            && ($result['total_passing_score'] === null || $result['earned'] >= $result['total_passing_score']);
        $locked->update(['result_snapshot' => $result, 'status' => 'completed', 'completed_sessions' => array_keys(TryOutService::SESSIONS), 'current_session' => 4, 'completed_at' => now(), 'revision' => $locked->revision + 1]);

        if (count($locked->answers ?? []) > 0) {
            app(GamificationService::class)->award($user, $this->awardPrefix.':'.$tryOut->id.':'.now('Asia/Jakarta')->toDateString(), 20);
        }

        return $locked->fresh();
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

    public function payload(Model $attempt, bool $review = false, bool $incorrectOnly = false): array
    {
        abort_if($review && $attempt->status !== 'completed', 403);
        $questions = [];
        foreach ($attempt->content_snapshot as $question) {
            $grade = $attempt->grading_snapshot['questions'][$question['id']];
            if ($review && $incorrectOnly && ($attempt->answers[$question['id']] ?? null) === $grade['correct_option']) {
                continue;
            }
            $item = array_intersect_key($question, array_flip(['id', 'session', 'question', 'reading_passage', 'audio_url', 'instruction', 'japanese']));
            if (isset($question['passage_id'])) {
                $item['passage'] = $attempt->grading_snapshot['passages'][$question['passage_id']] ?? null;
            }
            $item['options'] = array_intersect_key($question['options'], array_flip(['A', 'B', 'C', 'D']));
            if ($review) {
                $item += array_intersect_key($grade, array_flip(['correct_option', 'explanation', 'point_value']));
            }
            $questions[] = app(MediaService::class)->payload($item);
        }

        return ['id' => $attempt->id, $this->parentKey => $attempt->{$this->parentKey}, 'status' => $attempt->status, 'revision' => $attempt->revision, 'current_session' => $attempt->current_session, 'completed_sessions' => $attempt->completed_sessions, 'questions' => $questions, 'answers' => $attempt->answers, 'result' => $this->result($attempt), 'started_at' => $attempt->started_at->toISOString(), 'expires_at' => $attempt->expires_at?->toISOString(), 'server_now' => now()->toISOString(), 'completed_at' => ($attempt->completed_at ?? $attempt->submitted_at)?->toISOString()];
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
            $history[] = ['id' => $attempt->id, 'status' => $attempt->status, 'started_at' => $attempt->started_at->toISOString(), 'expires_at' => $attempt->expires_at?->toISOString(), 'server_now' => now()->toISOString(), 'completed_at' => ($attempt->completed_at ?? $attempt->submitted_at)?->toISOString(), 'result' => $result];
        }

        return ['attempts' => $history, 'best_score' => $best];
    }
}
