<?php

namespace App\Services;

use App\Models\AudioQuestion;
use App\Models\Chapter;
use App\Models\LearningAttempt;
use App\Models\Program;
use App\Models\ReadingPassage;
use App\Models\ReadingQuestion;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class LearningAttemptService
{
    public function __construct(private LearningProgressService $progress) {}

    public function start(User $user, Program $program, Chapter $chapter, string $kind, ?int $session = null, ?int $part = null): LearningAttempt
    {
        return DB::transaction(function () use ($user, $program, $chapter, $kind, $session, $part) {
            app(GamificationService::class)->lock($user);
            $chapter->newQuery()->whereKey($chapter->id)->lockForUpdate()->firstOrFail();
            $this->progress->authorize($user, $program, $chapter);
            abort_unless(in_array($kind, ['audio', 'reading', 'mini'], true), 404);
            if ($kind === 'mini') {
                abort_unless($this->progress->progress($user, $program, $chapter)['mini_unlocked'], 403);
                if ($session === null || $session < 1 || $part === null || $part < 1) {
                    throw ValidationException::withMessages(['session' => 'Mini requires positive integer session and part.']);
                }
                $questions = $chapter->miniCheckpointQuestions()->where('status', 'published')->where('session', $session)->where('part', $part)->get();
                $this->miniConfiguration($questions->map(fn ($question) => $question->only(['session', 'part', 'duration_minutes', 'passing_score']))->all());
            } else {
                abort_unless(in_array($program->family, ['foundation', 'jlpt'], true), 404);
                $questions = $this->progress->resources($chapter, $kind);
            }
            abort_if($questions->isEmpty(), 422, 'Published questions required.');
            $content = [];
            $grading = [];
            foreach ($questions as $question) {
                $item = ['id' => $question->id, 'question' => $question->question, 'options' => $question->options];
                if ($kind === 'audio') {
                    $item['title'] = $question->title;
                    $item['audio_url'] = $question->audio_url;
                } elseif ($kind === 'reading') {
                    $passage = $question->readingPassage;
                    $item['passage'] = ['id' => $passage->id, 'title' => $passage->title, 'body' => $passage->body];
                } elseif ($kind === 'mini') {
                    $item['session'] = $question->session;
                    $item['part'] = $question->part;
                    $item['duration_minutes'] = $question->duration_minutes;
                    $item['passing_score'] = $question->passing_score;
                }
                $content[] = $item;
                $grading[$question->id] = ['correct_option' => $question->correct_option, 'explanation' => $question->explanation];
            }
            abort_unless(count(array_unique(array_column($content, 'id'))) === count($content), 422);

            return LearningAttempt::create(['user_id' => $user->id, 'chapter_id' => $chapter->id, 'kind' => $kind, 'status' => 'in_progress', 'content_snapshot' => $content, 'grading_snapshot' => $grading, 'answers' => [], 'revision' => 0])->fresh();
        });
    }

    public function authorize(User $user, Program $program, Chapter $chapter, LearningAttempt $attempt): void
    {
        abort_unless($attempt->user_id === $user->id && $attempt->chapter_id === $chapter->id, 404);
        $this->progress->authorize($user, $program, $chapter);
        if ($attempt->kind === 'mini') {
            abort_unless($this->progress->miniEligible($user, $program), 403);
        }
    }

    private function validateAnswers(LearningAttempt $attempt, array $answers): void
    {
        $ids = array_column($attempt->content_snapshot, 'id');
        foreach ($answers as $id => $answer) {
            if (! in_array((string) $id, array_map('strval', $ids), true) || ! in_array($answer, ['A', 'B', 'C', 'D'], true)) {
                throw ValidationException::withMessages(['answers' => 'Unknown question or invalid option.']);
            }
        }
    }

    public function save(User $user, Program $program, Chapter $chapter, LearningAttempt $attempt, array $answers, int $revision): LearningAttempt
    {
        return DB::transaction(function () use ($user, $program, $chapter, $attempt, $answers, $revision) {
            app(GamificationService::class)->lock($user);
            $locked = LearningAttempt::whereKey($attempt->id)->lockForUpdate()->firstOrFail();
            $this->authorize($user, $program, $chapter, $locked);
            $locked = $this->expire($user, $program, $chapter, $locked);
            if ($locked->status === 'completed') {
                return $locked;
            }
            $this->validateAnswers($locked, $answers);
            abort_unless($locked->revision === $revision, 409, 'Stale answer revision.');
            $locked = $this->expire($user, $program, $chapter, $locked);
            if ($locked->status === 'completed') {
                return $locked;
            }
            $locked->update(['answers' => $answers, 'revision' => $locked->revision + 1]);

            return $locked;
        });
    }

    public function submit(User $user, Program $program, Chapter $chapter, LearningAttempt $attempt, array $answers, int $revision): LearningAttempt
    {
        return DB::transaction(function () use ($user, $program, $chapter, $attempt, $answers, $revision) {
            app(GamificationService::class)->lock($user);
            $locked = LearningAttempt::whereKey($attempt->id)->lockForUpdate()->firstOrFail();
            $this->authorize($user, $program, $chapter, $locked);
            $locked = $this->expire($user, $program, $chapter, $locked);
            if ($locked->status === 'completed') {
                return $locked;
            }
            $this->validateAnswers($locked, $answers);
            abort_unless($locked->revision === $revision, 409, 'Stale answer revision.');
            $total = count($locked->content_snapshot);
            if ($locked->kind !== 'mini' && count($answers) !== $total) {
                throw ValidationException::withMessages(['answers' => 'Finish practice by answering every question.']);
            }

            return $this->finalize($user, $program, $chapter, $locked, $answers);
        }, 3);
    }

    private function finalize(User $user, Program $program, Chapter $chapter, LearningAttempt $locked, array $answers): LearningAttempt
    {
        $total = count($locked->content_snapshot);
        $eligible = collect();
        if ($locked->kind !== 'mini') {
            $class = $locked->kind === 'audio' ? AudioQuestion::class : ReadingQuestion::class;
            $resources = $class::whereIn('id', array_column($locked->content_snapshot, 'id'))->orderBy('id')->lockForUpdate()->get();
            $passages = $locked->kind === 'reading'
                ? ReadingPassage::whereIn('id', $resources->pluck('reading_passage_id'))->orderBy('id')->lockForUpdate()->get()->keyBy('id')
                : collect();
            Chapter::whereKey($chapter->id)->lockForUpdate()->firstOrFail();
            $this->authorize($user, $program, $chapter, $locked);
            $eligible = $resources->filter(function ($resource) use ($locked, $chapter, $passages) {
                if ($resource->status !== 'published') {
                    return false;
                }
                if ($locked->kind === 'audio') {
                    return $resource->chapter_id === $chapter->id;
                }
                $passage = $passages->get($resource->reading_passage_id);

                return $passage !== null && $passage->status === 'published' && $passage->chapter_id === $chapter->id;
            });
        } else {
            Chapter::whereKey($chapter->id)->lockForUpdate()->firstOrFail();
            $this->authorize($user, $program, $chapter, $locked);
        }
        if ($locked->kind === 'mini' && now()->utc()->greaterThanOrEqualTo($this->miniTiming($locked)['expires_at'])) {
            $answers = $locked->answers;
            $this->validateAnswers($locked, $answers);
        }
        $correct = 0;
        foreach ($locked->grading_snapshot as $id => $grade) {
            $correct += ($answers[$id] ?? null) === $grade['correct_option'] ? 1 : 0;
        }
        $result = ['correct' => $correct, 'wrong' => count($answers) - $correct, 'unanswered' => $total - count($answers), 'total' => $total, 'percentage' => round($correct * 100 / $total, 2)];
        if ($locked->kind === 'mini') {
            $passingScore = $this->miniConfiguration($locked->content_snapshot)['passing_score'];
            $result['passed'] = $result['percentage'] >= $passingScore;
            $result['passing_score'] = $passingScore;
        }
        $before = array_filter($this->progress->progress($user, $program, $chapter)['activities'], fn ($activity) => $activity['total'] > 0);
        $wasComplete = $before !== [] && ! in_array(false, array_column($before, 'complete'), true);
        $locked->update(['answers' => $answers, 'revision' => $locked->revision + 1, 'result_snapshot' => $result, 'status' => 'completed', 'submitted_at' => now()->utc()]);
        if ($locked->kind !== 'mini') {
            foreach ($eligible as $question) {
                $this->progress->record($user, $chapter, $locked->kind, $question->id);
            }
        }

        if (count($answers) > 0 && ($locked->kind === 'mini' || $eligible->count() === $total)) {
            $day = now('Asia/Jakarta')->toDateString();
            app(GamificationService::class)->award($user, 'exercise:'.$locked->kind.':'.$chapter->id.':'.$day, 20);
            if (! $wasComplete) {
                app(GamificationService::class)->chapterBonus($user, $chapter);
            }
        }

        return $locked;
    }

    public function miniConfiguration(array $questions): array
    {
        $first = $questions[0] ?? [];
        foreach (['session', 'part', 'duration_minutes', 'passing_score'] as $field) {
            if (! isset($first[$field]) || ! is_int($first[$field]) || $first[$field] < ($field === 'passing_score' ? 0 : 1) || ($field === 'passing_score' && $first[$field] > 100)) {
                throw ValidationException::withMessages([$field => 'Mini configuration requires positive session, part and duration_minutes, and passing_score between 0 and 100.']);
            }
            foreach ($questions as $question) {
                if (($question[$field] ?? null) !== $first[$field]) {
                    throw ValidationException::withMessages([$field => 'Mini questions must share session, part, duration_minutes and passing_score.']);
                }
            }
        }

        return array_intersect_key($first, array_flip(['session', 'part', 'duration_minutes', 'passing_score']));
    }

    private function miniTiming(LearningAttempt $attempt): array
    {
        $questions = $attempt->content_snapshot;
        if ($attempt->status === 'completed') {
            foreach ($questions as &$question) {
                $question['passing_score'] ??= $attempt->result_snapshot['passing_score'] ?? null;
            }
            unset($question);
        }
        $configuration = $this->miniConfiguration($questions);
        if ($attempt->created_at === null) {
            throw ValidationException::withMessages(['started_at' => 'Mini attempt has no valid start time.']);
        }
        $started = $attempt->created_at->copy()->utc();

        return $configuration + ['started_at' => $started->toISOString(), 'expires_at' => $started->copy()->addMinutes($configuration['duration_minutes'])->toISOString()];
    }

    private function practiceTiming(LearningAttempt $attempt): array
    {
        // ponytail: fixed 20-minute practice limit; replace with snapshotted admin duration when builder exists.
        $started = $attempt->created_at->copy()->utc();

        return ['duration_minutes' => 20, 'started_at' => $started->toISOString(), 'expires_at' => $started->copy()->addMinutes(20)->toISOString()];
    }

    private function expire(User $user, Program $program, Chapter $chapter, LearningAttempt $attempt): LearningAttempt
    {
        if (in_array($attempt->kind, ['mini', 'audio', 'reading'], true)) {
            $timing = $attempt->kind === 'mini' ? $this->miniTiming($attempt) : $this->practiceTiming($attempt);
            if ($attempt->status !== 'completed' && now()->utc()->greaterThanOrEqualTo($timing['expires_at'])) {
                $this->validateAnswers($attempt, $attempt->answers);

                return $this->finalize($user, $program, $chapter, $attempt, $attempt->answers);
            }
        }

        return $attempt;
    }

    public function show(User $user, Program $program, Chapter $chapter, LearningAttempt $attempt): LearningAttempt
    {
        return DB::transaction(function () use ($user, $program, $chapter, $attempt) {
            app(GamificationService::class)->lock($user);
            $locked = LearningAttempt::whereKey($attempt->id)->lockForUpdate()->firstOrFail();
            $this->authorize($user, $program, $chapter, $locked);

            return $this->expire($user, $program, $chapter, $locked);
        }, 3);
    }

    public function payload(LearningAttempt $attempt, bool $review = false): array
    {
        abort_if($review && $attempt->status !== 'completed', 403);
        $questions = [];
        foreach ($attempt->content_snapshot as $question) {
            $item = array_intersect_key($question, array_flip(['id', 'question', 'title', 'audio_url', 'session', 'part', 'duration_minutes']));
            $item['options'] = array_intersect_key($question['options'], array_flip(['A', 'B', 'C', 'D']));
            if (isset($question['passage'])) {
                $item['passage'] = array_intersect_key($question['passage'], array_flip(['id', 'title', 'body']));
            }
            if ($review) {
                $grade = $attempt->grading_snapshot[$question['id']];
                $item['correct_option'] = $grade['correct_option'];
                $item['explanation'] = $grade['explanation'];
                $item['selected_answer'] = $attempt->answers[$question['id']] ?? null;
                $item['status'] = $item['selected_answer'] === null ? 'unanswered' : ($item['selected_answer'] === $grade['correct_option'] ? 'correct' : 'wrong');
            }
            $questions[] = app(MediaService::class)->payload($item);
        }

        return ['id' => $attempt->id, 'chapter_id' => $attempt->chapter_id, 'kind' => $attempt->kind, 'status' => $attempt->status, 'revision' => $attempt->revision, 'questions' => $questions, 'answers' => $attempt->answers, 'result' => $attempt->status === 'completed' ? array_intersect_key($attempt->result_snapshot, array_flip(['correct', 'wrong', 'unanswered', 'total', 'percentage', 'passed', 'passing_score'])) : null, 'submitted_at' => $attempt->submitted_at?->toISOString()] + ($attempt->kind === 'mini' ? $this->miniTiming($attempt) : $this->practiceTiming($attempt)) + ['server_now' => now()->utc()->toISOString()];
    }
}
