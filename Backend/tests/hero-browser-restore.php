<?php
require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (! $app->environment('testing') || $app->configurationIsCached()) throw new RuntimeException('Testing required.');
App\Support\DatabaseSafety::assertTarget(true);
$schema = getenv('HIRU_TEST_SCHEMA');
if ($schema !== 'hiru_browser_test_hero_2b1_20261030' || Illuminate\Support\Facades\DB::selectOne('SELECT current_schema() AS name')->name !== $schema) throw new RuntimeException('Hero QA schema only.');
$row = Illuminate\Support\Facades\DB::table('admin_settings')->where('section', 'landing_hero')->first();
if ($row) {
    $snapshot = json_decode($row->value, true, 512, JSON_THROW_ON_ERROR);
    $evidence = getenv('HIRU_HERO_QA_SNAPSHOT');
    if (! $evidence) throw new RuntimeException('Snapshot path required.');
    file_put_contents($evidence, json_encode($snapshot, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
    Illuminate\Support\Facades\DB::table('admin_settings')->where('section', 'landing_hero')->where('value', $row->value)->delete();
}
echo json_encode(['schema' => $schema, 'restored_hero_baseline' => Illuminate\Support\Facades\DB::table('admin_settings')->where('section', 'landing_hero')->first()]);
