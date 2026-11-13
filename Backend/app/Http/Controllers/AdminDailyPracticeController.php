<?php

namespace App\Http\Controllers;

use App\Models\DailyPractice;
use App\Services\AdminDailyPracticeReportService;
use App\Services\DailyPracticeAttemptService;
use App\Services\DailyPracticeService;
use Illuminate\Http\Request;

class AdminDailyPracticeController extends Controller
{
    public function index(Request $request, DailyPracticeService $content)
    {
        return response()->json(['data' => DailyPractice::orderByDesc('starts_at')->orderByDesc('id')->get()->map(fn ($p) => $content->payload($p))]);
    }

    public function store(Request $request, DailyPracticeService $content)
    {
        return response()->json(['data' => $content->payload($content->save($request->all()))], 201);
    }

    public function show(Request $request, DailyPractice $practice, DailyPracticeService $content)
    {
        return response()->json(['data' => $content->payload($practice) + [
            'builder_capabilities' => $content->builderCapabilities(), 'studio_revision' => $content->studioRevision($practice),
            'passages' => $content->adminPassages($practice),
            'questions' => $practice->questions()->orderBy('sort_order')->orderBy('id')->get()->map(fn ($q) => $content->adminQuestion($q)),
        ]]);
    }

    public function update(Request $request, DailyPractice $practice, DailyPracticeService $content)
    {
        return response()->json(['data' => $content->payload($content->save($request->all(), $practice))]);
    }

    public function studio(Request $request, DailyPractice $practice, DailyPracticeService $content)
    {
        $content->saveStudio($practice, $request->all());

        return $this->show($request, $practice->fresh(), $content);
    }

    public function destroy(Request $request, DailyPractice $practice, DailyPracticeService $content)
    {
        $content->delete($practice);

        return response()->noContent();
    }

    private function filters(Request $request, DailyPractice $practice): array
    {
        $filters = $request->validate([
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => array_merge(['nullable', 'date_format:Y-m-d'], $request->filled('date_from') ? ['after_or_equal:date_from'] : []),
            'search' => ['nullable', 'string', 'max:200'], 'status' => ['nullable', 'in:all,passed,failed'],
            'user_id' => ['nullable', 'integer', 'min:1'], 'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
        app(DailyPracticeAttemptService::class)->finalizeDue($practice->id);

        return $filters;
    }

    public function reports(Request $request, DailyPractice $practice, AdminDailyPracticeReportService $reports)
    {
        $filters = $this->filters($request, $practice);

        return response()->json(['data' => $reports->readSnapshot(fn () => $reports->overview($practice, $filters))])->header('Cache-Control', 'private, no-store');
    }

    public function participants(Request $request, DailyPractice $practice, AdminDailyPracticeReportService $reports)
    {
        $filters = $this->filters($request, $practice);
        $page = $reports->readSnapshot(fn () => $reports->participantsQuery($practice, $filters)->orderByDesc('daily_practice_attempts.id')->paginate($filters['per_page'] ?? 20));

        return response()->json(['data' => $page->getCollection()->map(fn ($a) => $reports->participant($a)),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(), 'per_page' => $page->perPage()]])->header('Cache-Control', 'private, no-store');
    }

    public function reportAttempt(Request $request, DailyPractice $practice, int $attempt, AdminDailyPracticeReportService $reports)
    {
        $filters = $this->filters($request, $practice);

        return response()->json(['data' => $reports->readSnapshot(fn () => $reports->individual($practice, $filters, $attempt))])->header('Cache-Control', 'private, no-store');
    }
}
