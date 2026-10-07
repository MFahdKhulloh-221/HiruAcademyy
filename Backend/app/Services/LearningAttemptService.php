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

    public function start(User $user, Program $program, Chapter $chapter, string $kind): LearningAttempt
    {
        return DB::transaction(function () use ($user, $program, $chapter, $kind) {
            $chapter->newQuery()->whereKey($chapter->id)->lockForUpdate()->firstOrFail();
            $this->progress->authorize($user, $program, $chapter);
            abort_unless(in_array($kind, ['audio', 'reading', 'mini'], true), 404);
            if ($kind === 'mini') {
                abort_unless($this->progress->progress($user, $program, $chapter)['mini_unlocked'], 403);
                $questions = $chapter->miniCheckpointQuestions()->where('status', 'published')->get();
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
                }
                $content[] = $item;
                $grading[$question->id] = ['correct_option' => $question->correct_option, 'explanation' => $question->explanation];
            }
            abort_unless(count(array_unique(array_column($content, 'id'))) === count($content), 422);

            return LearningAttempt::create(['user_id' => $user->id, 'chapter_id' => $chapter->id, 'kind' => $kind, 'status' => 'in_progress', 'content_snapshot' => $content, 'grading_snapshot' => $grading, 'answers' => [], 'revision' => 0]);
        });
    }

    public function authorize(User $user, Program $program, Chapter $chapter, LearningAttempt $attempt): void
    {
        abort_unless($attempt->user_id === $user->id && $attempt->chapter_id === $chapter->id, 404);
        $this->progress->authorize($user, $program, $chapter);
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
            $locked = LearningAttempt::whereKey($attempt->id)->lockForUpdate()->firstOrFail();
            $this->authorize($user, $program, $chapter, $locked);
            $this->validateAnswers($locked, $answers);
            if ($locked->status === 'completed') {
                return $locked;
            }
            abort_unless($locked->revision === $revision, 409, 'Stale answer revision.');
            $locked->update(['answers' => $answers, 'revision' => $locked->revision + 1]);

            return $locked;
        });
    }

    public function submit(User $user, Program $program, Chapter $chapter, LearningAttempt $attempt, array $answers, int $revision): LearningAttempt
    {
        return DB::transaction(function () use ($user, $program, $chapter, $attempt, $answers, $revision) {
            $locked = LearningAttempt::whereKey($attempt->id)->lockForUpdate()->firstOrFail();
            $this->authorize($user, $program, $chapter, $locked);
            $this->validateAnswers($locked, $answers);
            if ($locked->status === 'completed') {
                return $locked;
            }
            abort_unless($locked->revision === $revision, 409, 'Stale answer revision.');
            $total = count($locked->content_snapshot);
            if ($locked->kind !== 'mini' && count($answers) !== $total) {
                throw ValidationException::withMessages(['answers' => 'Finish practice by answering every question.']);
            }
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
            $correct = 0;
            foreach ($locked->grading_snapshot as $id => $grade) {
                $correct += ($answers[$id] ?? null) === $grade['correct_option'] ? 1 : 0;
            }
            $result = ['correct' => $correct, 'wrong' => count($answers) - $correct, 'unanswered' => $total - count($answers), 'total' => $total, 'percentage' => round($correct * 100 / $total, 2)];
            if ($locked->kind === 'mini') {
                $passingScore = 70;
                $result['passed'] = $result['percentage'] >= $passingScore;
                $result['passing_score'] = $passingScore;
            }
            $locked->update(['answers' => $answers, 'revision' => $locked->revision + 1, 'result_snapshot' => $result, 'status' => 'completed', 'submitted_at' => now()->utc()]);
            if ($locked->kind !== 'mini') {
                foreach ($eligible as $question) {
                    $this->progress->record($user, $chapter, $locked->kind, $question->id);
                }
            }

            return $locked;
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

        return ['id' => $attempt->id, 'chapter_id' => $attempt->chapter_id, 'kind' => $attempt->kind, 'status' => $attempt->status, 'revision' => $attempt->revision, 'questions' => $questions, 'answers' => $attempt->answers, 'result' => $attempt->status === 'completed' ? array_intersect_key($attempt->result_snapshot, array_flip(['correct', 'wrong', 'unanswered', 'total', 'percentage', 'passed', 'passing_score'])) : null, 'submitted_at' => $attempt->submitted_at?->toISOString()];
    }
}
