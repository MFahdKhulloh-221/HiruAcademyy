<?php

namespace App\Http\Controllers;

use App\Http\Resources\ProgramAchievementResource;
use App\Models\NotificationContent;
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

    public function notices(Request $request): JsonResponse
    {
        $request->validate(['user_id' => ['missing']]);
        $events = NotificationContent::query()->where('user_id', $request->user()->id)
            ->where('type', 'Achievement')->where('status', 'published')
            ->whereNull('popup_dismissed_at')->where('event_key', 'like', 'program-achievement:%')
            ->pluck('event_key');
        $ids = $events->map(fn ($event) => substr($event, strlen('program-achievement:')))
            ->filter(fn ($id) => preg_match('/^[1-9][0-9]*$/D', $id))->all();
        $achievements = ProgramAchievement::query()->where('user_id', $request->user()->id)
            ->whereIn('id', $ids)->orderBy('issued_at')->orderBy('id')->get();

        return response()->json(['data' => ProgramAchievementResource::collection($achievements)->resolve($request)])
            ->header('Cache-Control', 'private, no-store');
    }

    public function dismissNotice(Request $request, string $achievement): \Illuminate\Http\Response
    {
        abort_unless(filter_var($achievement, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) !== false, 404);
        if ($request->all() !== []) {
            throw ValidationException::withMessages(array_fill_keys(array_keys($request->all()), 'Dismissal does not accept input fields.'));
        }
        $owned = ProgramAchievement::query()->where('user_id', $request->user()->id)->findOrFail($achievement);
        NotificationContent::query()->where('user_id', $request->user()->id)
            ->where('event_key', 'program-achievement:'.$owned->id)->whereNull('popup_dismissed_at')
            ->update(['popup_dismissed_at' => now('UTC')]);

        return response()->noContent();
    }

    public function status(Request $request, string $program, ChapterAccessPolicy $access,
        \App\Services\ProgramAchievementEligibility $eligibility,
        \App\Services\ProgramAchievementSettings $settings): JsonResponse
    {
        abort_unless(filter_var($program, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) !== false, 404);
        $request->validate(['user_id' => ['missing']]);
        $program = Program::query()->findOrFail($program);
        $owned = ProgramAchievement::query()->where('user_id', $request->user()->id)->where('program_id', $program->id)->first();
        abort_unless($owned !== null || ($access->canAccessProgram($request->user(), $program)
            && $access->canAccessChapter($request->user(), $program->code, 1)), 404);
        $status = $eligibility->status($request->user(), $program, $owned);

        return response()->json(['data' => [
            'achievement' => $owned === null ? null : (new ProgramAchievementResource($owned))->resolve($request),
            ...$status,
            'certificate_title' => trim(strip_tags($owned?->presentation_snapshot['title'] ?? $settings->resolve($program)['title'])),
        ]])->header('Cache-Control', 'private, no-store');
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
