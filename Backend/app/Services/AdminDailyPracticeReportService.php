<?php

namespace App\Services;

use App\Models\DailyPracticeAttempt;
use Illuminate\Database\Eloquent\Model;

class AdminDailyPracticeReportService extends AdminTryOutReportService
{
    protected string $attemptModel = DailyPracticeAttempt::class;

    protected string $attemptTable = 'daily_practice_attempts';

    protected string $parentKey = 'daily_practice_id';

    public function overview(Model $tryOut, array $filters, bool $includeSnapshots = false): array
    {
        $report = parent::overview($tryOut, $filters, $includeSnapshots);
        $report['summary']['passed'] = 0;
        $report['summary']['failed'] = 0;

        return $report;
    }

    public function tryOut(Model $tryOut): array
    {
        return ['id' => $tryOut->id, 'title' => $tryOut->title, 'level' => $tryOut->target_level];
    }
}
