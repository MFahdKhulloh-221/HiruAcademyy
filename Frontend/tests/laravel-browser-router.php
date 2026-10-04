<?php

require __DIR__.'/../../Backend/vendor/autoload.php';
$app = require __DIR__.'/../../Backend/bootstrap/app.php';
$app->make(Illuminate\Contracts\Http\Kernel::class)->bootstrap();
if (! $app->environment('testing') || $app->configurationIsCached()) {
    throw new RuntimeException('Testing environment without config cache required.');
}
App\Support\DatabaseSafety::assertTarget(true);
$schema = getenv('HIRU_TEST_SCHEMA');
if (! is_string($schema) || ! preg_match('/^hiru_browser_test_[a-z0-9_]+$/D', $schema)
    || Illuminate\Support\Facades\DB::selectOne('SELECT current_schema() AS name')->name !== $schema) {
    throw new RuntimeException('Isolated browser schema required.');
}
$cache = sys_get_temp_dir().'/hiru-browser-test-'.getenv('HIRU_BROWSER_RUN');
if (! is_dir($cache) && ! mkdir($cache, 0700, true) && ! is_dir($cache)) {
    throw new RuntimeException('Cannot create isolated browser test cache.');
}
config(['cache.stores.file.path' => $cache, 'cache.stores.file.lock_path' => $cache]);
Illuminate\Support\Facades\RateLimiter::for('identity', fn () => Illuminate\Cache\RateLimiting\Limit::perMinute(10000));
$app->handleRequest(Illuminate\Http\Request::capture());
