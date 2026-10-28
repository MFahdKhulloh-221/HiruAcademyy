<?php

namespace App\Services;

use App\Models\ActivityCompletion;
use App\Models\Chapter;
use App\Models\LearningAttempt;
use App\Models\Program;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class LearningProgressService
{
    public function __construct(private ChapterAccessPolicy $policy) {}

    public function authorize(User $user, Program $program, Chapter $chapter): void
    {
        $program->refresh();
        $chapter->refresh();
        abort_unless($this->policy->canAccessProgram($user, $program) && $chapter->status === 'published' && $chapter->program_id === $program->id, 404);
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
            'foundation', 'ssw' => ['video', 'module', 'flashcard'],
            'jlpt' => ['video', 'module', 'flashcard', 'audio', 'reading'],
            'interview' => ['video', 'module'],
            default => [],
        };
    }

    public function miniEligible(User $user, Program $program): bool
    {
        return $program->family === 'jlpt'
            && in_array($program->code, ['n5', 'n4', 'n3', 'n2'], true)
            && in_array($program->code, app(EntitlementService::class)->effectiveAccess($user)['replay_levels'], true);
    }

    public function progress(User $user, Program $program, Chapter $chapter): array
    {
        $this->authorize($user, $program, $chapter);
        $types = $this->requiredTypes($program);
        $resources = [];
        $completions = [];
        foreach ($types as $type) {
            $resources[$type] = $this->resources($chapter, $type)->pluck('id')->all();
            $completions[$type] = ActivityCompletion::where('user_id', $user->id)->where('chapter_id', $chapter->id)->where('type', $type)->whereIn('resource_id', $resources[$type])->pluck('resource_id')->map(fn ($id) => (int) $id)->all();
        }
        $readingReady = ! in_array('reading', $types, true) || ! $chapter->readingPassages()->where('status', 'published')->whereDoesntHave('questions', fn ($query) => $query->where('status', 'published'))->exists();

        return $this->assemble($program, $chapter, $resources, $completions, $readingReady, $this->miniEligible($user, $program), $this->miniCompleted($user, $chapter));
    }

    public function assemble(Program $program, Chapter $chapter, array $resources, array $completions, bool $readingReady, bool $miniEligible = false, bool $miniCompleted = false): array
    {
        $activities = [];
        foreach ($this->requiredTypes($program) as $type) {
            $ids = $resources[$type] ?? [];
            $completedIds = array_values(array_intersect($completions[$type] ?? [], $ids));
            $completed = count($completedIds);
            $ready = $type !== 'reading' || $readingReady;
            $activities[$type] = [
                'total' => count($ids),
                'completed' => $completed,
                'complete' => $ready && count($ids) > 0 && $completed === count($ids),
                'completed_ids' => $completedIds,
            ];
        }

        $required = $program->family === 'jlpt' ? $activities : array_filter($activities, fn ($activity) => $activity['total'] > 0);
        return ['chapter_id' => $chapter->id, 'activities' => $activities, 'mini_eligible' => $miniEligible, 'mini_completed' => $miniCompleted, 'mini_unlocked' => $miniEligible && $required !== [] && ! in_array(false, array_column($required, 'complete'), true)];
    }

    private function miniCompleted(User $user, Chapter $chapter): bool
    {
        return LearningAttempt::where('user_id', $user->id)->where('chapter_id', $chapter->id)
            ->where('kind', 'mini')->where('status', 'completed')->exists();
    }

    public function batch(User $user, Collection $chapters, Collection $programs): array
    {
        $published = fn ($query) => $query->where('status', 'published')->select(['id', 'chapter_id']);
        $chapters->load([
            'videoLessons' => $published,
            'modules' => $published,
            'flashcards' => $published,
            'audioQuestions' => $published,
            'readingPassages' => $published,
            'readingPassages.questions' => fn ($query) => $query->where('status', 'published')->select(['id', 'reading_passage_id']),
        ]);
        $resources = [];
        $allIds = [];
        foreach ($chapters as $chapter) {
            $resources[$chapter->id] = [
                'video' => $chapter->videoLessons->modelKeys(),
                'module' => $chapter->modules->modelKeys(),
                'flashcard' => $chapter->flashcards->modelKeys(),
                'audio' => $chapter->audioQuestions->modelKeys(),
                'reading' => $chapter->readingPassages->flatMap->questions->pluck('id')->all(),
            ];
            foreach ($resources[$chapter->id] as $ids) {
                array_push($allIds, ...$ids);
            }
        }
        $completions = ActivityCompletion::where('user_id', $user->id)->whereIn('chapter_id', $chapters->modelKeys())->whereIn('resource_id', array_unique($allIds))
            ->get(['type', 'resource_id'])->groupBy('type')->map(fn ($rows) => $rows->pluck('resource_id')->map(fn ($id) => (int) $id)->all())->all();
        $completedMini = LearningAttempt::where('user_id', $user->id)->whereIn('chapter_id', $chapters->modelKeys())
            ->where('kind', 'mini')->where('status', 'completed')->pluck('chapter_id')->flip();
        $replayLevels = app(EntitlementService::class)->effectiveAccess($user)['replay_levels'];
        $result = [];
        foreach ($chapters as $chapter) {
            $result[$chapter->id] = $this->assemble($programs->get($chapter->program_id), $chapter, $resources[$chapter->id], $completions,
                ! $chapter->readingPassages->contains(fn ($passage) => $passage->questions->isEmpty()),
                $programs->get($chapter->program_id)->family === 'jlpt'
                    && in_array($programs->get($chapter->program_id)->code, ['n5', 'n4', 'n3', 'n2'], true)
                    && in_array($programs->get($chapter->program_id)->code, $replayLevels, true), $completedMini->has($chapter->id));
        }

        return $result;
    }

    public function complete(User $user, Program $program, Chapter $chapter, string $type, ?int $resourceId): array
    {
        $this->authorize($user, $program, $chapter);
        if (! in_array($type, ['video', 'module', 'flashcard'], true)) {
            throw ValidationException::withMessages(['type' => 'Practice completion requires server submission.']);
        }

        return DB::transaction(function () use ($user, $program, $chapter, $type, $resourceId) {
            app(GamificationService::class)->lock($user);
            $chapter->newQuery()->whereKey($chapter->id)->lockForUpdate()->firstOrFail();
            $before = array_filter($this->progress($user, $program, $chapter)['activities'], fn ($activity) => $activity['total'] > 0);
            $wasComplete = $before !== [] && ! in_array(false, array_column($before, 'complete'), true);
            $deckStarted = ActivityCompletion::where('user_id', $user->id)->where('chapter_id', $chapter->id)->where('type', 'flashcard')->exists();
            $fresh = false;
            $this->authorize($user, $program, $chapter);
            $resources = $this->resources($chapter, $type);
            if ($type !== 'flashcard') {
                abort_unless($resourceId !== null && $resources->contains('id', $resourceId), 404);
                $resources = $resources->where('id', $resourceId);
            } elseif ($resourceId !== null) {
                throw ValidationException::withMessages(['resource_id' => 'Flashcard completion is chapter-wide.']);
            }
            foreach ($resources as $resource) {
                $new = $this->record($user, $chapter, $type, $resource->id);
                $fresh = $fresh || $new;
                if ($new && $type !== 'flashcard') {
                    app(GamificationService::class)->award($user, $type.':'.$resource->id, 10);
                }
            }
            if ($fresh && $type === 'flashcard' && ! $deckStarted) {
                app(GamificationService::class)->award($user, 'deck:'.$chapter->id, 10);
            }
            if ($fresh && ! $wasComplete) {
                app(GamificationService::class)->chapterBonus($user, $chapter);
            }

            return $this->progress($user, $program, $chapter);
        });
    }

    public function record(User $user, Chapter $chapter, string $type, int $resourceId): bool
    {
        $exists = ActivityCompletion::where('user_id', $user->id)->where('type', $type)->where('resource_id', $resourceId)->exists();
        ActivityCompletion::query()->upsert([['user_id' => $user->id, 'chapter_id' => $chapter->id, 'type' => $type, 'resource_id' => $resourceId, 'completed_at' => now()->utc()->format('Y-m-d H:i:sP')]], ['user_id', 'type', 'resource_id'], ['chapter_id']);

        return ! $exists;
    }
}
