<?php

namespace App\Services;

use App\Models\TryOut;
use App\Models\TryOutAttempt;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class TryOutAttemptService
{
    public function __construct(private ChapterAccessPolicy $access, private TryOutService $content) {}

    public function authorize(User $user, TryOut $tryOut, ?TryOutAttempt $attempt = null): void
    {
        abort_unless($user->role === 'student' && $user->account_status === 'active', 403);
        if ($attempt) {
            abort_unless($attempt->user_id === $user->id && $attempt->try_out_id === $tryOut->id, 404);
        }
        $program = $tryOut->program()->firstOrFail();
        abort_unless($program->status === 'active' && $program->family === 'jlpt' && in_array($program->code, ['n5', 'n4', 'n3', 'n2', 'n1'], true), 404);
        abort_unless($this->access->canAccessChapter($user, $program->code, 1), 403);
        if (! $attempt) {
            abort_unless($tryOut->status === 'published', 404);
        }
    }

    public function start(User $user, TryOut $tryOut): TryOutAttempt
    {
        return DB::transaction(function () use ($user, $tryOut) {
            $parent = TryOut::whereKey($tryOut->id)->lockForUpdate()->firstOrFail();
            $this->authorize($user, $parent);
            $this->content->assertPublishable($parent);
            $questions = [];
            $grading = [];
            foreach (array_keys(TryOutService::SESSIONS) as $session) {
                foreach ($parent->questions()->where('status', 'published')->where('session', $session)->orderBy('sort_order')->orderBy('id')->get() as $question) {
                    $questions[] = $question->only(['id', 'session', 'question', 'options', 'reading_passage', 'audio_url']);
                    $grading[$question->id] = $question->only(['correct_option', 'explanation', 'point_value']);
                }
            }

            return TryOutAttempt::create(['user_id' => $user->id, 'try_out_id' => $parent->id, 'status' => 'in_progress', 'content_snapshot' => $questions, 'grading_snapshot' => ['questions' => $grading, 'total_passing_score' => $parent->total_passing_score], 'answers' => [], 'completed_sessions' => [], 'current_session' => 0, 'revision' => 0, 'started_at' => now()])->fresh();
        }, 3);
    }

    public function save(User $user, TryOut $tryOut, TryOutAttempt $attempt, array $answers, int $revision, bool $finishSession = false): TryOutAttempt
    {
        return DB::transaction(function () use ($user, $tryOut, $attempt, $answers, $revision, $finishSession) {
            $locked = TryOutAttempt::whereKey($attempt->id)->lockForUpdate()->firstOrFail();
            $this->authorize($user, $tryOut, $locked);
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
            $locked->update(['answers' => $persisted, 'completed_sessions' => $completed, 'revision' => $locked->revision + 1]);

            return $locked;
        }, 3);
    }

    public function submit(User $user, TryOut $tryOut, TryOutAttempt $attempt, int $revision): TryOutAttempt
    {
        return DB::transaction(function () use ($user, $tryOut, $attempt, $revision) {
            $locked = TryOutAttempt::whereKey($attempt->id)->lockForUpdate()->firstOrFail();
            $this->authorize($user, $tryOut, $locked);
            if ($locked->status === 'completed') {
                return $locked;
            }
            abort_unless($locked->revision === $revision, 409, 'Stale answer revision.');
            $result = ['earned' => 0, 'max' => 180, 'correct' => 0, 'wrong' => 0, 'unanswered' => 0, 'sessions' => [], 'total_passing_score' => $locked->grading_snapshot['total_passing_score'], 'overall_pass' => null];
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
                $section['pass'] = $section['earned'] >= 19;
                $result['sessions'][] = $section;
                foreach (['earned', 'correct', 'wrong', 'unanswered'] as $key) {
                    $result[$key] += $section[$key];
                }
            }
            if ($result['total_passing_score'] !== null) {
                $result['overall_pass'] = $result['earned'] >= $result['total_passing_score'] && ! in_array(false, array_column($result['sessions'], 'pass'), true);
            }
            $locked->update(['result_snapshot' => $result, 'status' => 'completed', 'completed_sessions' => array_keys(TryOutService::SESSIONS), 'current_session' => 4, 'completed_at' => now(), 'revision' => $locked->revision + 1]);

            return $locked->fresh();
        }, 3);
    }

    private function result(TryOutAttempt $attempt): ?array
    {
        if ($attempt->status !== 'completed') {
            return null;
        }
        $result = array_intersect_key($attempt->result_snapshot, array_flip(['earned', 'max', 'correct', 'wrong', 'unanswered', 'total_passing_score', 'overall_pass']));
        $result['sessions'] = array_map(fn ($section) => array_intersect_key($section, array_flip(['code', 'label', 'earned', 'max', 'correct', 'wrong', 'unanswered', 'passing_score', 'pass'])), $attempt->result_snapshot['sessions']);

        return $result;
    }

    public function payload(TryOutAttempt $attempt, bool $review = false, bool $incorrectOnly = false): array
    {
        abort_if($review && $attempt->status !== 'completed', 403);
        $questions = [];
        foreach ($attempt->content_snapshot as $question) {
            $grade = $attempt->grading_snapshot['questions'][$question['id']];
            if ($review && $incorrectOnly && ($attempt->answers[$question['id']] ?? null) === $grade['correct_option']) {
                continue;
            }
            $item = array_intersect_key($question, array_flip(['id', 'session', 'question', 'reading_passage', 'audio_url']));
            $item['options'] = array_intersect_key($question['options'], array_flip(['A', 'B', 'C', 'D']));
            if ($review) {
                $item += array_intersect_key($grade, array_flip(['correct_option', 'explanation', 'point_value']));
            }
            $questions[] = app(MediaService::class)->payload($item);
        }

        return ['id' => $attempt->id, 'try_out_id' => $attempt->try_out_id, 'status' => $attempt->status, 'revision' => $attempt->revision, 'current_session' => $attempt->current_session, 'completed_sessions' => $attempt->completed_sessions, 'questions' => $questions, 'answers' => $attempt->answers, 'result' => $this->result($attempt), 'started_at' => $attempt->started_at->toISOString(), 'completed_at' => $attempt->completed_at?->toISOString()];
    }

    public function history(User $user, TryOut $tryOut): array
    {
        $this->authorize($user, $tryOut, new TryOutAttempt(['user_id' => $user->id, 'try_out_id' => $tryOut->id]));
        $attempts = TryOutAttempt::where('user_id', $user->id)->where('try_out_id', $tryOut->id)->orderByDesc('id')->get();
        $best = null;
        $history = [];
        foreach ($attempts as $attempt) {
            $result = $this->result($attempt);
            if ($result !== null) {
                $best = $best === null ? $result['earned'] : max($best, $result['earned']);
            }
            $history[] = ['id' => $attempt->id, 'status' => $attempt->status, 'started_at' => $attempt->started_at->toISOString(), 'completed_at' => $attempt->completed_at?->toISOString(), 'result' => $result];
        }

        return ['attempts' => $history, 'best_score' => $best];
    }
}
