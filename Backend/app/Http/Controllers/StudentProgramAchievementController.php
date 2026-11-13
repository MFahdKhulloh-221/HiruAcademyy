<?php

namespace App\Http\Controllers;

use App\Http\Resources\ProgramAchievementResource;
use App\Models\Program;
use App\Models\ProgramAchievement;
use App\Services\ChapterAccessPolicy;
use App\Services\ProgramAchievementReconciliationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class StudentProgramAchievementController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $input = $request->validate([
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'user_id' => ['missing'],
        ]);
        $page = ProgramAchievement::query()->where('user_id', $request->user()->id)
            ->orderByDesc('issued_at')->orderByDesc('id')->paginate($input['per_page'] ?? 20);

        return response()->json([
            'data' => ProgramAchievementResource::collection($page->getCollection())->resolve($request),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(),
                'total' => $page->total(), 'per_page' => $page->perPage()],
        ])->header('Cache-Control', 'private, no-store');
    }

    public function show(Request $request, string $achievement): JsonResponse
    {
        abort_unless(filter_var($achievement, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) !== false, 404);
        $request->validate(['user_id' => ['missing']]);
        $owned = ProgramAchievement::query()->where('user_id', $request->user()->id)->findOrFail($achievement);

        return response()->json(['data' => (new ProgramAchievementResource($owned))->resolve($request)])
            ->header('Cache-Control', 'private, no-store');
    }

    public function reconcile(Request $request, string $program, ChapterAccessPolicy $access, ProgramAchievementReconciliationService $reconciliation): JsonResponse
    {
        abort_unless(filter_var($program, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) !== false, 404);
        $program = Program::query()->findOrFail($program);
        if ($request->all() !== []) {
            throw ValidationException::withMessages(array_fill_keys(array_keys($request->all()), 'Reconciliation does not accept input fields.'));
        }
        abort_unless($access->canAccessProgram($request->user(), $program)
            && $access->canAccessChapter($request->user(), $program->code, 1), 404);
        $result = $reconciliation->reconcile((int) $request->user()->id, (int) $program->id);

        return response()->json([
            'data' => $result['achievement'] === null ? null : (new ProgramAchievementResource($result['achievement']))->resolve($request),
            'reason' => $result['reason'],
        ])->header('Cache-Control', 'private, no-store');
    }
}
