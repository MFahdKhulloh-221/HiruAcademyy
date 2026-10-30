<?php

require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (! $app->environment('testing') || $app->configurationIsCached()) throw new RuntimeException('Uncached testing required.');
App\Support\DatabaseSafety::assertTarget(true);
$schema = getenv('HIRU_TEST_SCHEMA');
if (! preg_match('/^hiru_browser_test_hero_[a-z0-9_]+$/D', $schema) || Illuminate\Support\Facades\DB::selectOne('SELECT current_schema() AS name')->name !== $schema) throw new RuntimeException('Isolated Hero schema required.');
$baseline = Illuminate\Support\Facades\DB::table('admin_settings')->where('section', 'landing_hero')->first();
if ($baseline !== null) throw new RuntimeException('New schema must have empty Hero baseline.');
$user = App\Models\User::firstOrCreate(['email' => 'hero.qa@example.test'], ['name' => 'Hero QA Admin', 'email' => 'hero.qa@example.test', 'whatsapp' => '6281999112244', 'password' => getenv('HIRU_HERO_QA_PASSWORD'), 'role' => 'admin', 'account_status' => 'active']);
$user->forceFill(['role' => 'admin', 'account_status' => 'active'])->save();
echo json_encode(['schema' => $schema, 'database' => Illuminate\Support\Facades\DB::connection()->getDatabaseName(), 'hero_baseline' => null]);
