<?php

namespace App\Services;

use App\Models\ActivityCompletion;
use App\Models\Chapter;
use App\Models\LearningAttempt;
use App\Models\Program;
use App\Models\User;

class ProgramAchievementEligibility
{
    private const TYPES = ['video', 'module', 'flashcard', 'audio', 'reading'];

    public function __construct(private LearningProgressService $progress) {}

    public function evaluate(User $user, Program $program): array
    {
        [$chapters, $completions, $attempts] = $this->loadEvidence($user, $program);

        return $this->evaluateEvidence($user, $program, $chapters, $completions, $attempts);
    }

    protected function loadEvidence(User $user, Program $program): array
    {
        $chapters = Chapter::where('program_id', $program->id)->where('status', 'published')->orderBy('id')->get();
        $rows = [];
        foreach ($chapters as $chapter) {
            $tasks = [];
            foreach (self::TYPES as $type) {
                $tasks[$type] = $this->progress->resources($chapter, $type)->map(fn ($resource) => [
                    'id' => $resource->id,
                    'chapter_id' => $chapter->id,
                    'status' => $resource->status,
                ])->all();
            }
            $rows[] = [
                'id' => $chapter->id,
                'program_id' => $chapter->program_id,
                'status' => $chapter->status,
                'tasks' => $tasks,
                'reading_ready' => ! $chapter->readingPassages()->where('status', 'published')
                    ->whereDoesntHave('questions', fn ($query) => $query->where('status', 'published'))->exists(),
            ];
        }
        $completions = ActivityCompletion::where('user_id', $user->id)->whereIn('chapter_id', $chapters->modelKeys())
            ->orderBy('id')->get(['id', 'user_id', 'chapter_id', 'type', 'resource_id', 'completed_at'])->toArray();
        $attempts = LearningAttempt::where('user_id', $user->id)->whereIn('chapter_id', $chapters->modelKeys())
            ->whereIn('kind', ['audio', 'reading'])->where('status', 'completed')->orderBy('id')
            ->get(['id', 'user_id', 'chapter_id', 'kind', 'status', 'submitted_at', 'content_snapshot', 'grading_snapshot', 'answers'])
            ->map(fn ($attempt) => $attempt->makeVisible(['content_snapshot', 'grading_snapshot', 'answers'])->toArray())->all();

        return [$rows, $completions, $attempts];
    }

    /**
     * Pure evaluation; models need only id (and Program family/code), no loaded relations.
     * Chapters: list of {id, program_id, status, reading_ready: bool,
     *   tasks: array<type, list<{id, chapter_id, status}>>}. Reading tasks are question
     *   IDs from published passages; reading_ready is false for any published empty passage.
     * Completions: list of {id, user_id, chapter_id, type, resource_id, completed_at}.
     * Attempts: list of {id, user_id, chapter_id, kind, status, submitted_at,
     *   content_snapshot: list<{id, options: array<string, string>}>,
     *   grading_snapshot: array<question_id, {correct_option: string}>,
     *   answers: array<question_id, string>}. Snapshots must cover every answer.
     * Only published chapters/tasks count. Mini checkpoints never count.
     * Returned evidence is an allowlist of IDs and timestamps, never answers or snapshots.
     */
    public function evaluateEvidence(User $user, Program $program, array $chapters, array $completions, array $attempts): array
    {
        $evidence = ['policy_version' => 1, 'program_id' => $program->id, 'user_id' => $user->id, 'chapters' => []];
        $result = function (string $reason) use (&$evidence): array {
            return ['eligible' => $reason === 'eligible', 'reason' => $reason, 'evidence' => $evidence];
        };
        if ($program->status !== 'active') {
            return $result('inactive_program');
        }
        $required = array_values(array_diff(LearningContentService::ACTIVITIES[$program->family] ?? [], ['mini_checkpoint']));
        if ($required === []) {
            return $result('policy_unresolved');
        }
        $chapters = array_values(array_filter($chapters, fn ($chapter) => ($chapter['status'] ?? null) === 'published'));
        if ($chapters === []) {
            return $result('empty_program');
        }
        foreach ($chapters as $chapter) {
            if (empty($chapter['id']) || ($chapter['program_id'] ?? null) !== $program->id) {
                return $result('invalid_content');
            }
            if (($chapter['reading_ready'] ?? null) !== true) {
                return $result('invalid_content');
            }
            $tasks = [];
            foreach ($chapter['tasks'] ?? [] as $type => $resources) {
                if (in_array($type, ['mini', 'mini_checkpoint'], true)) {
                    continue;
                }
                foreach ($resources as $resource) {
                    if (($resource['status'] ?? null) !== 'published') {
                        continue;
                    }
                    if (! in_array($type, self::TYPES, true) || ! in_array($type, $required, true)) {
                        return $result('policy_unresolved');
                    }
                    if (empty($resource['id']) || ($resource['chapter_id'] ?? null) !== $chapter['id']) {
                        return $result('invalid_content');
                    }
                    $tasks[$type][$resource['id']] = $resource['id'];
                }
            }
            if ($tasks === []) {
                return $result('empty_chapter');
            }
            $chapterEvidence = ['chapter_id' => $chapter['id'], 'tasks' => []];
            foreach ($tasks as $type => $ids) {
                foreach ($ids as $id) {
                    $completion = null;
                    foreach ($completions as $row) {
                        if (($row['user_id'] ?? null) === $user->id && ($row['chapter_id'] ?? null) === $chapter['id']
                            && ($row['type'] ?? null) === $type && ($row['resource_id'] ?? null) === $id
                            && ! empty($row['id']) && $this->validTimestamp($row['completed_at'] ?? null)) {
                            $completion = $row;
                            break;
                        }
                    }
                    if ($completion === null) {
                        return $result('incomplete');
                    }
                    $task = ['type' => $type, 'resource_id' => $id, 'completion_id' => $completion['id'], 'completed_at' => $completion['completed_at']];
                    if (in_array($type, ['audio', 'reading'], true)) {
                        $attempt = null;
                        foreach ($attempts as $row) {
                            if (($row['user_id'] ?? null) === $user->id && ($row['chapter_id'] ?? null) === $chapter['id']
                                && ($row['kind'] ?? null) === $type && $this->validAttempt($row, $id)) {
                                $attempt = $row;
                                break;
                            }
                        }
                        if ($attempt === null) {
                            return $result('incomplete');
                        }
                        $task += ['attempt_id' => $attempt['id'], 'submitted_at' => $attempt['submitted_at']];
                    }
                    $chapterEvidence['tasks'][] = $task;
                }
            }
            $evidence['chapters'][] = $chapterEvidence;
        }

        return ['eligible' => true, 'reason' => 'eligible', 'evidence' => $evidence];
    }

    private function validTimestamp(mixed $value): bool
    {
        return is_string($value) && trim($value) !== '' && strtotime($value) !== false;
    }

    private function validAttempt(array $attempt, int $resourceId): bool
    {
        if (empty($attempt['id']) || ($attempt['status'] ?? null) !== 'completed' || ! $this->validTimestamp($attempt['submitted_at'] ?? null)) {
            return false;
        }
        $content = $attempt['content_snapshot'] ?? null;
        $grading = $attempt['grading_snapshot'] ?? null;
        $answers = $attempt['answers'] ?? null;
        if (! is_array($content) || $content === [] || ! is_array($grading) || ! is_array($answers)
            || count($content) !== count($grading) || count($content) !== count($answers)) {
            return false;
        }
        $ids = [];
        foreach ($content as $question) {
            if (! is_array($question) || ! is_int($question['id'] ?? null) || $question['id'] < 1 || isset($ids[$question['id']])) {
                return false;
            }
            $id = $question['id'];
            $ids[$id] = true;
            $options = $question['options'] ?? null;
            if (! is_array($options) || count($options) !== 4) {
                return false;
            }
            foreach (['A', 'B', 'C', 'D'] as $option) {
                if (! is_string($options[$option] ?? null) || trim($options[$option]) === '') {
                    return false;
                }
            }
            if (! in_array($answers[$id] ?? null, ['A', 'B', 'C', 'D'], true)
                || ! is_array($grading[$id] ?? null)
                || ! in_array($grading[$id]['correct_option'] ?? null, ['A', 'B', 'C', 'D'], true)) {
                return false;
            }
        }

        return isset($ids[$resourceId]);
    }
}
