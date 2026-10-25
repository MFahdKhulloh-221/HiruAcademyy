<?php

require __DIR__.'/../../../Backend/vendor/autoload.php';
$app = require __DIR__.'/../../../Backend/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (! $app->environment('testing') || $app->configurationIsCached()) {
    throw new RuntimeException('Uncached testing environment required.');
}
App\Support\DatabaseSafety::assertTarget(true);
$schema = getenv('HIRU_TEST_SCHEMA');
if (! preg_match('/^hiru_browser_test_placement_[a-z0-9_]+$/D', $schema ?: '')
    || Illuminate\Support\Facades\DB::selectOne('SELECT current_schema() AS name')->name !== $schema) {
    throw new RuntimeException('Isolated placement QA schema required.');
}
$identity = getenv('HIRU_PLACEMENT_QA_IDENTITY');
if (! is_string($identity) || ! is_dir(dirname($identity))) {
    throw new RuntimeException('Explicit existing temporary identity directory required.');
}
App\Models\User::create([
    'name' => 'QA FIXTURE ONLY Placement Admin', 'email' => 'placement.qa@example.test',
    'whatsapp' => '6281999000026', 'password' => 'PlacementQaOnly123!',
    'role' => 'admin', 'account_status' => 'active', 'target_jlpt' => 'N5',
])->forceFill(['role' => 'admin', 'account_status' => 'active'])->save();
if (file_put_contents($identity, json_encode([
    'environment' => $app->environment(),
    'database' => Illuminate\Support\Facades\DB::connection()->getDatabaseName(),
    'schema' => $schema, 'api' => 'http://localhost:8026', 'frontend' => 'http://localhost:3026',
], JSON_THROW_ON_ERROR)) === false) {
    throw new RuntimeException('Cannot write placement QA identity.');
}
echo "Placement QA admin ready; no product bank seeded.\n";
