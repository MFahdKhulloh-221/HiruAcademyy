<?php

namespace App\Http\Controllers;

use App\Models\ClassSchedule;
use App\Models\ReplayPlaylist;
use App\Services\EntitlementService;
use App\Services\ScheduleReplayService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class StudentScheduleReplayController extends Controller
{
    public function __construct(private EntitlementService $entitlements, private ScheduleReplayService $content) {}

    public function schedules(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'program_id' => ['sometimes', 'required', 'integer', 'exists:programs,id'],
            'period' => ['sometimes', 'required', Rule::in(['upcoming', 'past'])],
        ]);
        $codes = $this->livePrograms($request);
        $query = ClassSchedule::query()->with('program')->where('status', 'published')
            ->whereHas('program', fn ($query) => $query->whereIn('code', $codes));
        if (isset($filters['program_id'])) {
            $query->where('program_id', $filters['program_id']);
        }
        if (isset($filters['period'])) {
            $query->where('scheduled_at', $filters['period'] === 'upcoming' ? '>=' : '<', now()->utc()->toIso8601String());
        }

        return response()->json(['data' => $query->orderBy('scheduled_at')->orderBy('sort_order')->orderBy('id')->get()
            ->map(fn ($model) => $this->content->payload($model))]);
    }

    public function schedule(Request $request): JsonResponse
    {
        $schedule = ClassSchedule::query()->where('status', 'published')->findOrFail($this->id($request, 'schedule'));
        abort_unless(in_array($schedule->program->code, $this->livePrograms($request), true), 403);

        return response()->json(['data' => $this->content->payload($schedule)]);
    }

    public function replays(Request $request): JsonResponse
    {
        $levels = $this->entitlements->effectiveAccess($request->user())['replay_levels'];

        return response()->json(['data' => ReplayPlaylist::query()->with('program')->where('status', 'published')
            ->whereHas('program', fn ($query) => $query->whereIn('code', $levels))
            ->orderBy('sort_order')->orderBy('id')->get()
            ->map(fn ($model) => $this->content->payload($model))]);
    }

    public function playlist(Request $request): JsonResponse
    {
        $playlist = ReplayPlaylist::query()->where('status', 'published')->findOrFail($this->id($request, 'playlist'));
        $levels = $this->entitlements->effectiveAccess($request->user())['replay_levels'];
        abort_unless(in_array($playlist->program->code, $levels, true), 403);
        $data = $this->content->payload($playlist);
        $data['videos'] = $playlist->videos()->where('status', 'published')->orderBy('sort_order')->orderBy('id')->get()
            ->map(fn ($model) => $this->content->payload($model))->all();

        return response()->json(['data' => $data]);
    }

    private function livePrograms(Request $request): array
    {
        $sources = $this->entitlements->effectiveAccess($request->user())['source_grants'];

        return array_values(array_unique(array_column(array_filter($sources, fn ($grant) => $grant['plan_code'] === 'sensei'
            && in_array($grant['program_code'], ScheduleReplayService::LEVELS, true)), 'program_code')));
    }

    private function id(Request $request, string $parameter): string
    {
        $id = (string) $request->route($parameter);
        abort_unless(preg_match('/^[1-9][0-9]*$/D', $id)
            && (strlen($id) < 19 || (strlen($id) === 19 && strcmp($id, '9223372036854775807') <= 0)), 404);

        return $id;
    }
}
