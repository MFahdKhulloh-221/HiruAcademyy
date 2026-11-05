<?php

namespace App\Http\Controllers;

use App\Models\TryOut;
use App\Services\AdminTryOutReportService;
use App\Services\TryOutReportWorkbook;
use Illuminate\Http\Request;

class AdminTryOutReportController extends Controller
{
    private function filters(Request $request): array
    {
        abort_unless($request->user()?->role === 'admin' && $request->user()?->account_status === 'active', 403);

        return $request->validate([
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => array_merge(['nullable', 'date_format:Y-m-d'], $request->filled('date_from') ? ['after_or_equal:date_from'] : []),
            'search' => ['nullable', 'string', 'max:200'],
            'status' => ['nullable', 'in:all,passed,failed'],
            'user_id' => ['nullable', 'integer', 'min:1'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
    }

    public function overview(Request $request, TryOut $tryOut, AdminTryOutReportService $reports)
    {
        $filters = $this->filters($request);

        return response()->json(['data' => $reports->readSnapshot(fn () => $reports->overview($tryOut, $filters))])
            ->header('Cache-Control', 'private, no-store');
    }

    public function participants(Request $request, TryOut $tryOut, AdminTryOutReportService $reports)
    {
        $filters = $this->filters($request);
        $page = $reports->readSnapshot(fn () => $reports->participantsQuery($tryOut, $filters)
            ->select(['try_out_attempts.id', 'try_out_attempts.try_out_id', 'try_out_attempts.user_id',
                'try_out_attempts.status', 'try_out_attempts.started_at', 'try_out_attempts.completed_at',
                'try_out_attempts.result_snapshot', 'users.name as participant_name', 'users.whatsapp as participant_whatsapp'])
            ->orderByDesc('try_out_attempts.completed_at')
            ->orderByDesc('try_out_attempts.id')->paginate($filters['per_page'] ?? 20));

        return response()->json(['data' => $page->getCollection()->map(fn ($attempt) => $reports->participant($attempt)),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(),
                'total' => $page->total(), 'per_page' => $page->perPage()]])->header('Cache-Control', 'private, no-store');
    }

    public function attempt(Request $request, TryOut $tryOut, int $attempt, AdminTryOutReportService $reports)
    {
        $filters = $this->filters($request);

        return response()->json(['data' => $reports->readSnapshot(fn () => $reports->individual($tryOut, $filters, $attempt))])
            ->header('Cache-Control', 'private, no-store');
    }

    public function export(Request $request, TryOut $tryOut, AdminTryOutReportService $reports, TryOutReportWorkbook $workbook)
    {
        $filters = $this->filters($request);
        abort_unless(class_exists(\ZipArchive::class), 503, 'XLSX export requires PHP ZipArchive.');
        try {
            $path = $workbook->build($tryOut, $filters, $reports);
        } catch (\RuntimeException $error) {
            abort(422, $error->getMessage());
        }

        try {
            return response()->download($path, 'try-out-'.$tryOut->id.'-reports.xlsx', [
                'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Cache-Control' => 'private, no-store',
            ])->deleteFileAfterSend(true);
        } catch (\Throwable $error) {
            @unlink($path);
            throw $error;
        }
    }
}
