<?php

namespace App\Services;

use App\Models\ActivityCompletion;
use App\Models\Chapter;
use App\Models\Program;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class LearningProgressService
{
    public function __construct(private ChapterAccessPolicy $policy) {}

    public function authorize(User $user, Program $program, Chapter $chapter): void
    {
        $program->refresh();
        $chapter->refresh();
        abort_unless($program->status === 'active' && $chapter->status === 'published' && $chapter->program_id === $program->id, 404);
        abort_unless($this->policy->canAccessChapter($user, $program->code, $chapter->chapter_number), 403);
    }

    public function resources(Chapter $chapter, string $type)
    {
        return match ($type) {
            'video' => $chapter->videoLessons()->where('status', 'published')->get(),
            'module' => $chapter->modules()->where('status', 'published')->get(),
            'flashcard' => $chapter->flashcards()->where('status', 'published')->get(),
            'audio' => $chapter->audioQuestions()->where('status', 'published')->get(),
            'reading' => $chapter->readingPassages()->where('status', 'published')->with(['questions' => fn ($query) => $query->where('status', 'published')])->get()->flatMap->questions,
            default => throw ValidationException::withMessages(['type' => 'Unsupported activity type.']),
        };
    }

    public function requiredTypes(Program $program): array
    {
        return match ($program->family) {
            'ssw' => ['video', 'module', 'flashcard'],
            'foundation', 'jlpt' => ['video', 'module', 'flashcard', 'audio', 'reading'],
            default => [],
        };
    }

    public function progress(User $user, Program $program, Chapter $chapter): array
    {
        $this->authorize($user, $program, $chapter);
        $types = $this->requiredTypes($program);
        $activities = [];
        foreach ($types as $type) {
            $ids = $this->resources($chapter, $type)->pluck('id')->all();
            $completed = ActivityCompletion::where('user_id', $user->id)->where('type', $type)->whereIn('resource_id', $ids)->count();
            $ready = $type !== 'reading' || ! $chapter->readingPassages()->where('status', 'published')->whereDoesntHave('questions', fn ($query) => $query->where('status', 'published'))->exists();
            $activities[$type] = ['total' => count($ids), 'completed' => $completed, 'complete' => $ready && count($ids) > 0 && $completed === count($ids)];
        }

        return ['chapter_id' => $chapter->id, 'activities' => $activities, 'mini_unlocked' => $types !== [] && ! in_array(false, array_column($activities, 'complete'), true)];
    }

    public function complete(User $user, Program $program, Chapter $chapter, string $type, ?int $resourceId): array
    {
        $this->authorize($user, $program, $chapter);
        if (! in_array($type, ['video', 'module', 'flashcard'], true)) {
            throw ValidationException::withMessages(['type' => 'Practice completion requires server submission.']);
        }

        return DB::transaction(function () use ($user, $program, $chapter, $type, $resourceId) {
            $chapter->newQuery()->whereKey($chapter->id)->lockForUpdate()->firstOrFail();
            $this->authorize($user, $program, $chapter);
            $resources = $this->resources($chapter, $type);
            if ($type !== 'flashcard') {
                abort_unless($resourceId !== null && $resources->contains('id', $resourceId), 404);
                $resources = $resources->where('id', $resourceId);
            } elseif ($resourceId !== null) {
                throw ValidationException::withMessages(['resource_id' => 'Flashcard completion is chapter-wide.']);
            }
            foreach ($resources as $resource) {
                $this->record($user, $chapter, $type, $resource->id);
            }

            return $this->progress($user, $program, $chapter);
        });
    }

    public function record(User $user, Chapter $chapter, string $type, int $resourceId): void
    {
        ActivityCompletion::query()->upsert([['user_id' => $user->id, 'chapter_id' => $chapter->id, 'type' => $type, 'resource_id' => $resourceId, 'completed_at' => now()->utc()->format('Y-m-d H:i:sP')]], ['user_id', 'type', 'resource_id'], ['chapter_id']);
    }
}
