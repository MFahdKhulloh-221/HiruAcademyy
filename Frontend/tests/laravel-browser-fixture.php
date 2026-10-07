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
    (new Database\Seeders\ProgramOfferSeeder)->run();
    foreach (['admin', 'student', 'lms', 'sensei'] as $role) {
        $userRole = in_array($role, ['admin'], true) ? 'admin' : 'student';
        $user = App\Models\User::updateOrCreate(['email' => "browser.$role@example.test"], [
            'name' => "Browser $role",
            'whatsapp' => match ($role) {
                'admin' => '6281999000011',
                'student' => '6281999000012',
                'lms' => '6281999000013',
                'sensei' => '6281999000014',
            },
            'password' => 'BrowserTesting123!',
            'role' => $userRole,
            'account_status' => 'active',
            'target_jlpt' => 'N5',
        ]);
        $user->forceFill(['role' => $userRole, 'account_status' => 'active'])->save();
    }
    $student = App\Models\User::where('email', 'browser.student@example.test')->firstOrFail();
    $admin = App\Models\User::where('email', 'browser.admin@example.test')->firstOrFail();
    $lmsUser = App\Models\User::where('email', 'browser.lms@example.test')->firstOrFail();
    $senseiUser = App\Models\User::where('email', 'browser.sensei@example.test')->firstOrFail();

    $program = App\Models\Program::firstOrCreate(['code' => 'browser-payout-test'], ['slug' => 'browser-payout-test', 'name' => 'Browser Payout Test', 'family' => 'ssw', 'status' => 'active', 'sort_order' => 99]);
    $offer = App\Models\ProgramOffer::firstOrCreate(['program_id' => $program->id, 'plan_code' => 'lms'], ['base_price' => 10000, 'currency' => 'IDR', 'duration_months' => 6, 'status' => 'active']);
    $affiliate = App\Models\Affiliate::firstOrCreate(['code' => 'BROWSER_PAYOUT_TEST'], ['name' => 'Browser Payout Test', 'rate' => 10, 'status' => 'active']);
    $n5 = App\Models\Program::where('code', 'n5')->firstOrFail();
    $n5Offer = App\Models\ProgramOffer::firstOrCreate(['program_id' => $n5->id, 'plan_code' => 'lms'], ['base_price' => 50000, 'currency' => 'IDR', 'duration_months' => 6, 'status' => 'active']);

    App\Models\AccessGrant::firstOrCreate([
        'user_id' => $lmsUser->id,
        'program_id' => $n5->id,
        'plan_code' => 'lms',
    ], [
        'starts_at' => now()->subDay()->toDateString(),
        'ends_at' => now()->addMonths(6)->toDateString(),
        'status' => 'active',
    ]);
    App\Models\AccessGrant::firstOrCreate([
        'user_id' => $senseiUser->id,
        'program_id' => $n5->id,
        'plan_code' => 'sensei',
    ], [
        'starts_at' => now()->subDay()->toDateString(),
        'ends_at' => now()->addMonths(1)->toDateString(),
        'status' => 'active',
    ]);

    $n5Chapter = App\Models\Chapter::firstOrCreate(['program_id' => $n5->id, 'chapter_number' => 1], ['title' => 'Bab 1 N5', 'description' => 'Materi Bab 1 N5', 'status' => 'published', 'sort_order' => 1]);
    $n5Chapter2 = App\Models\Chapter::firstOrCreate(['program_id' => $n5->id, 'chapter_number' => 2], ['title' => 'Bab 2 N5', 'description' => 'Materi Bab 2 N5', 'status' => 'published', 'sort_order' => 2]);

    App\Models\AudioQuestion::firstOrCreate(['chapter_id' => $n5Chapter->id, 'question' => 'Pertanyaan Audio N5'], [
        'title' => 'Audio Listening 1',
        'audio_url' => 'https://example.test/audio.mp3',
        'options' => ['A' => 'Jawaban A', 'B' => 'Jawaban B', 'C' => 'Jawaban C', 'D' => 'Jawaban D'],
        'correct_option' => 'A',
        'explanation' => 'Penjelasan benar A.',
        'sort_order' => 1,
        'status' => 'published',
    ]);

    App\Models\Flashcard::firstOrCreate(['chapter_id' => $n5Chapter->id, 'japanese' => '猫'], [
        'reading' => 'ねこ',
        'meaning' => 'Kucing',
        'example' => '猫です。',
        'sort_order' => 1,
        'status' => 'published',
    ]);
    App\Models\Flashcard::firstOrCreate(['chapter_id' => $n5Chapter->id, 'japanese' => '犬'], [
        'reading' => 'いぬ',
        'meaning' => 'Anjing',
        'example' => '犬です。',
        'sort_order' => 2,
        'status' => 'published',
    ]);

    $placement = App\Models\PlacementConfig::firstOrCreate(['title' => 'Placement Test Hiru'], [
        'intro_heading' => 'Ukur Kemampuan Bahasa Jepangmu',
        'duration_minutes' => 15,
        'description' => 'Tes evaluasi kemampuan komprehensif',
        'status' => 'draft',
        'recommendation_rules' => [
            ['minScore' => 0, 'maxScore' => 39, 'recommendedProgramCode' => 'N5', 'resultTitle' => 'Rekomendasi Level N5', 'resultDescription' => 'Mulai dari dasar huruf, kosakata harian, dan pola kalimat N5.'],
            ['minScore' => 40, 'maxScore' => 59, 'recommendedProgramCode' => 'N4', 'resultTitle' => 'Rekomendasi Level N4', 'resultDescription' => 'Tingkatkan kemampuan ke percakapan praktis dan tata bahasa N4.'],
            ['minScore' => 60, 'maxScore' => 74, 'recommendedProgramCode' => 'N3', 'resultTitle' => 'Rekomendasi Level N3', 'resultDescription' => 'Siap mendalami pemahaman teks dan tata bahasa level menengah N3.'],
            ['minScore' => 75, 'maxScore' => 100, 'recommendedProgramCode' => 'N2', 'resultTitle' => 'Rekomendasi Level N2', 'resultDescription' => 'Persiapan intensif level lanjutan N2 untuk studi atau karir di Jepang.'],
        ],
    ]);
    $categories = [
        ['category' => 'Bunpou', 'prompt' => 'Pilihlah partikel yang tepat: わたし___学生です。', 'options' => ['A' => 'は', 'B' => 'が', 'C' => 'を', 'D' => 'に'], 'correct' => 'A'],
        ['category' => 'Moji・Goi', 'prompt' => 'Pilihlah kanji yang tepat untuk "neko":', 'options' => ['A' => '猫', 'B' => '犬', 'C' => '鳥', 'D' => '魚'], 'correct' => 'A'],
        ['category' => 'Dokkai', 'prompt' => 'Baca teks berikut dan pilih pernyataan yang benar:', 'options' => ['A' => 'Benar', 'B' => 'Salah', 'C' => 'Ragu', 'D' => 'Tidak tahu'], 'correct' => 'A'],
        ['category' => 'Choukai', 'prompt' => 'Dengarkan dialog dan pilih jawaban yang sesuai:', 'options' => ['A' => 'Jawaban A', 'B' => 'Jawaban B', 'C' => 'Jawaban C', 'D' => 'Jawaban D'], 'correct' => 'A'],
    ];
    foreach ($categories as $idx => $item) {
        App\Models\PlacementQuestion::firstOrCreate(['placement_config_id' => $placement->id, 'category' => $item['category']], [
            'prompt' => $item['prompt'],
            'options' => $item['options'],
            'correct_option' => $item['correct'],
            'status' => 'published',
            'sort_order' => $idx + 1,
            'explanation' => 'Penjelasan benar A.',
        ]);
    }
    $placement->update(['status' => 'published']);

    if ($affiliate->commissions()->where('status', 'approved')->exists()) return;
    $invoice = app(App\Services\InvoiceWorkflowService::class)->create($student, $offer);
    foreach (['awaiting_payment', 'paid', 'verified'] as $status) $invoice = app(App\Services\InvoiceWorkflowService::class)->transition($invoice, $status, $admin);
    $commission = app(App\Services\AffiliateService::class)->createCommission($invoice, $affiliate);
    app(App\Services\AffiliateService::class)->transition($commission, ['status' => 'approved']);
});
echo "Browser users ready in hiru_academy_test.\n";
