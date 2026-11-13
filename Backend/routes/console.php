<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('daily-practices:finalize', function () {
    $this->info('Finalized: '.app(\App\Services\DailyPracticeAttemptService::class)->finalizeDue());
})->purpose('Finalize daily practice attempts past their window');

\Illuminate\Support\Facades\Schedule::command('daily-practices:finalize')->everyMinute()->withoutOverlapping();
