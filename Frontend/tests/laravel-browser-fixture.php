<?php

require __DIR__.'/../../Backend/vendor/autoload.php';
$app = require __DIR__.'/../../Backend/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (! $app->environment('testing') || $app->configurationIsCached()) {
    throw new RuntimeException('Testing environment without config cache required.');
}
App\Support\DatabaseSafety::assertTarget(true);
if (($argv[1] ?? '') === 'verify') {
    echo json_encode(['environment' => $app->environment(), 'database' => Illuminate\Support\Facades\DB::connection()->getDatabaseName()]);
    exit;
}
$schema = getenv('HIRU_TEST_SCHEMA');
if (! is_string($schema) || ! preg_match('/^hiru_browser_test_[a-z0-9_]+$/D', $schema)
    || Illuminate\Support\Facades\DB::selectOne('SELECT current_schema() AS name')->name !== $schema) {
    throw new RuntimeException('Isolated browser schema required for fixture writes.');
}
Illuminate\Support\Facades\DB::transaction(function () {
    (new Database\Seeders\ProgramSeeder)->run();
    foreach (['admin', 'student'] as $role) {
        $user = App\Models\User::updateOrCreate(['email' => "browser.$role@example.test"], [
            'name' => "Browser $role",
            'whatsapp' => $role === 'admin' ? '6281999000011' : '6281999000012',
            'password' => 'BrowserTesting123!',
            'role' => $role,
            'account_status' => 'active',
            'target_jlpt' => 'N5',
        ]);
        $user->forceFill(['role' => $role, 'account_status' => 'active'])->save();
    }
    $student = App\Models\User::where('email', 'browser.student@example.test')->firstOrFail();
    $admin = App\Models\User::where('email', 'browser.admin@example.test')->firstOrFail();
    $program = App\Models\Program::firstOrCreate(['code' => 'browser-payout-test'], ['slug' => 'browser-payout-test', 'name' => 'Browser Payout Test', 'family' => 'ssw', 'status' => 'active', 'sort_order' => 99]);
    $offer = App\Models\ProgramOffer::firstOrCreate(['program_id' => $program->id, 'plan_code' => 'lms'], ['base_price' => 10000, 'currency' => 'IDR', 'duration_months' => 6, 'status' => 'active']);
    $affiliate = App\Models\Affiliate::firstOrCreate(['code' => 'BROWSER_PAYOUT_TEST'], ['name' => 'Browser Payout Test', 'rate' => 10, 'status' => 'active']);
    $n5 = App\Models\Program::where('code', 'n5')->firstOrFail();
    $n5Offer = App\Models\ProgramOffer::firstOrCreate(['program_id' => $n5->id, 'plan_code' => 'lms'], ['base_price' => 50000, 'currency' => 'IDR', 'duration_months' => 6, 'status' => 'active']);
    $n5Chapter = App\Models\Chapter::firstOrCreate(['program_id' => $n5->id, 'chapter_number' => 1], ['title' => 'Bab 1 N5', 'status' => 'published', 'sort_order' => 1]);
    App\Models\AudioQuestion::firstOrCreate(['chapter_id' => $n5Chapter->id, 'question' => 'Pertanyaan Audio N5'], [
        'title' => 'Audio Listening 1',
        'audio_url' => 'https://example.test/audio.mp3',
        'options' => ['A' => 'Jawaban A', 'B' => 'Jawaban B', 'C' => 'Jawaban C', 'D' => 'Jawaban D'],
        'correct_option' => 'A',
        'explanation' => 'Penjelasan benar A.',
        'sort_order' => 1,
        'status' => 'published',
    ]);
    if ($affiliate->commissions()->where('status', 'approved')->exists()) return;
    $invoice = app(App\Services\InvoiceWorkflowService::class)->create($student, $offer);
    foreach (['awaiting_payment', 'paid', 'verified'] as $status) $invoice = app(App\Services\InvoiceWorkflowService::class)->transition($invoice, $status, $admin);
    $commission = app(App\Services\AffiliateService::class)->createCommission($invoice, $affiliate);
    app(App\Services\AffiliateService::class)->transition($commission, ['status' => 'approved']);
});
echo "Browser users ready in hiru_academy_test.\n";
