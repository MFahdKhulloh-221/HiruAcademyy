<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class GamificationRaceTest extends TestCase
{
    public function test_uncapped_cross_family_lifetime_and_legacy_dedup_with_separate_workers(): void
    {
        $this->assertSame(0, DB::transactionLevel());
        $this->assertSame('hiru_academy_test', DB::connection()->getDatabaseName());
        $this->assertSame('hiru_backend_test_gamification_final_20261008', getenv('HIRU_TEST_SCHEMA'));
        $user = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $connection = config('database.connections.pgsql');
        $connection['url'] = null;
        $code = <<<'PHP'
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
config(['database.default' => 'pgsql', 'database.connections.pgsql' => json_decode(getenv('RACE_CONNECTION'), true)]);
Illuminate\Support\Facades\DB::purge();
App\Support\DatabaseSafety::assertTarget(true);
if (Illuminate\Support\Facades\DB::selectOne('SELECT current_schema() AS name')->name !== getenv('HIRU_TEST_SCHEMA')) {
    throw new RuntimeException('Isolated schema required.');
}
Carbon\CarbonImmutable::setTestNow(getenv('RACE_NOW'));
Illuminate\Support\Facades\DB::select("SELECT set_config('application_name', ?, false)", [getenv('RACE_NAME')]);
$user = App\Models\User::findOrFail(getenv('RACE_USER'));
Illuminate\Support\Facades\DB::transaction(function () use ($user) {
    app(App\Services\GamificationService::class)->award($user, getenv('RACE_KEY'), 30);
}, 3);
PHP;
        $workers = [];
        try {
            DB::table('gamification_rewards')->insert(['user_id' => $user->id, 'reward_key' => 'checkpoint:1:2026-10-08', 'activity_on' => '2026-10-08', 'xp' => 0, 'created_at' => now()->utc()]);
            foreach (['2026-10-09T00:10:00+07:00', '2026-10-10T00:10:00+07:00'] as $now) {
                $workers = [];
                $names = [];
                DB::beginTransaction();
                User::whereKey($user->id)->lockForUpdate()->firstOrFail();
                foreach (['chapter:1', 'exercise:audio:1', 'tryout:1', 'chapter:1', 'checkpoint:1', 'checkpoint:1'] as $key) {
                    $name = 'gamification_'.bin2hex(random_bytes(8));
                    $names[] = $name;
                    $worker = new Process([PHP_BINARY, '-r', $code], base_path(), ['APP_ENV' => 'testing', 'DB_URL' => '', 'HIRU_TEST_SCHEMA' => getenv('HIRU_TEST_SCHEMA'), 'RACE_CONNECTION' => json_encode($connection), 'RACE_NAME' => $name, 'RACE_USER' => (string) $user->id, 'RACE_KEY' => $key, 'RACE_NOW' => $now], null, 25);
                    $worker->start();
                    $workers[] = $worker;
                }
                $deadline = microtime(true) + 12;
                do {
                    DB::select('SELECT pg_stat_clear_snapshot()');
                    $blocked = DB::table('pg_stat_activity')->where('datname', DB::connection()->getDatabaseName())->whereIn('application_name', $names)->where('wait_event_type', 'Lock')->count();
                    if ($blocked === count($workers)) {
                        break;
                    }
                    foreach ($workers as $worker) {
                        $this->assertTrue($worker->isRunning(), $worker->getErrorOutput());
                    }
                    usleep(20000);
                } while (microtime(true) < $deadline);
                $this->assertSame(count($workers), $blocked);
                DB::commit();
                foreach ($workers as $worker) {
                    $this->assertSame(0, $worker->wait(), $worker->getErrorOutput());
                }
                $this->assertSame(90, (int) DB::table('gamification_rewards')->where('user_id', $user->id)->sum('xp'));
                $this->assertSame(90, (int) DB::table('gamification_days')->where('user_id', $user->id)->sum('xp'));
                $this->assertSame(4, DB::table('gamification_rewards')->where('user_id', $user->id)->count());
                $this->assertSame(1, DB::table('gamification_days')->where('user_id', $user->id)->count());
                $this->assertDatabaseMissing('gamification_rewards', ['user_id' => $user->id, 'reward_key' => 'checkpoint:1']);
            }
        } finally {
            while (DB::transactionLevel() > 0) {
                DB::rollBack();
            }
            foreach ($workers as $worker) {
                if ($worker->isRunning()) {
                    $worker->stop();
                }
            }
            $user->delete();
        }
    }
}
