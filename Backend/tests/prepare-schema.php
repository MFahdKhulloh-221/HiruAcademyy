<?php

use App\Support\DatabaseSafety;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
if (! $app->environment('testing') || $app->configurationIsCached()) {
    throw new RuntimeException('Uncached testing environment required.');
}
DatabaseSafety::assertTarget(true);
$schema = getenv('HIRU_TEST_SCHEMA');
if (! is_string($schema) || ! preg_match('/^hiru_(backend|browser)_test_[a-z0-9_]+$/D', $schema)) {
    throw new RuntimeException('Explicit isolated test schema required.');
}
DB::statement('CREATE SCHEMA IF NOT EXISTS "'.$schema.'"');
if (DB::selectOne('SELECT current_schema() AS name')->name !== $schema) {
    throw new RuntimeException('Isolated schema search path mismatch.');
}
$kernel = $app->make(Kernel::class);
if ($kernel->call('migrate', ['--force' => true]) !== 0) {
    throw new RuntimeException('Isolated schema migration failed.');
}
echo 'Isolated schema ready: '.$schema.PHP_EOL;
