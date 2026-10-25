<?php

if (parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) === '/qa-placement-fixture.wav') {
    header('Access-Control-Allow-Origin: http://localhost:3026');
    header('Content-Type: audio/wav');
    $samples = str_repeat(pack('v', 0), 8000);
    echo 'RIFF'.pack('V', 36 + strlen($samples)).'WAVEfmt '.pack('VvvVVvv', 16, 1, 1, 8000, 16000, 2, 16).'data'.pack('V', strlen($samples)).$samples;
    exit;
}
require __DIR__.'/../../../Backend/vendor/autoload.php';
$app = require __DIR__.'/../../../Backend/bootstrap/app.php';
$app->make(Illuminate\Contracts\Http\Kernel::class)->bootstrap();
if (! $app->environment('testing') || $app->configurationIsCached()) {
    throw new RuntimeException('Uncached testing environment required.');
}
App\Support\DatabaseSafety::assertTarget(true);
$schema = getenv('HIRU_TEST_SCHEMA');
if (! preg_match('/^hiru_browser_test_placement_[a-z0-9_]+$/D', $schema ?: '')
    || Illuminate\Support\Facades\DB::selectOne('SELECT current_schema() AS name')->name !== $schema) {
    throw new RuntimeException('Isolated placement QA schema required.');
}
$cache = dirname(getenv('HIRU_PLACEMENT_QA_IDENTITY')).'/cache';
if (! is_dir($cache) && ! mkdir($cache, 0700, true)) {
    throw new RuntimeException('Cannot create isolated QA cache.');
}
config(['cache.stores.file.path' => $cache, 'cache.stores.file.lock_path' => $cache]);
// QA-only bulk bank and rapid adaptive runs; production limiter remains unchanged.
Illuminate\Support\Facades\RateLimiter::for('api', fn () => Illuminate\Cache\RateLimiting\Limit::perMinute(5000)->by($schema));
$app->handleRequest(Illuminate\Http\Request::capture());
