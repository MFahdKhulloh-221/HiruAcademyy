<?php

namespace App\Http\Controllers;

use App\Http\Resources\StudentChapterResource;
use App\Models\Chapter;
use App\Models\Program;
use App\Services\ChapterAccessPolicy;
use App\Services\EntitlementService;
use App\Services\LearningLibraryService;
use Illuminate\Http\Request;

class StudentLearningController extends Controller
{
    public function library(Request $request, LearningLibraryService $library)
    {
        return response()->json(['data' => $library->modules($request->user())]);
    }

    public function index(Request $request, Program $program, EntitlementService $entitlements, ChapterAccessPolicy $policy)
    {
        abort_unless($program->status === 'active', 404);
        $access = $entitlements->effectiveAccess($request->user())['learning'][$program->code] ?? 'none';
        $chapters = Chapter::where('program_id', $program->id)->where('status', 'published')
            ->orderBy('sort_order')->orderBy('chapter_number')->orderBy('id')->get();
        foreach ($chapters as $chapter) {
            $chapter->setAttribute('access', $policy->canAccessChapter($request->user(), $program->code, $chapter->chapter_number) ? $access : 'locked');
        }

        return StudentChapterResource::collection($chapters);
    }

    public function show(Request $request, Program $program, Chapter $chapter, EntitlementService $entitlements, ChapterAccessPolicy $policy)
    {
        abort_unless($program->status === 'active' && $chapter->program_id === $program->id && $chapter->status === 'published', 404);
        abort_unless($policy->canAccessChapter($request->user(), $program->code, $chapter->chapter_number), 403);
        $chapter->setAttribute('access', $entitlements->effectiveAccess($request->user())['learning'][$program->code]);
        $published = fn ($query) => $query->where('status', 'published');
        $chapter->load([
            'videoLessons' => $published,
            'modules' => $published,
            'flashcards' => $published,
            'audioQuestions' => $published,
            'readingPassages' => $published,
            'readingPassages.questions' => $published,
        ])->loadExists(['miniCheckpointQuestions as mini_checkpoint_exists' => $published]);

        return new StudentChapterResource($chapter);
    }
}
