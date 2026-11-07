<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class RecoveryOtpRaceTest extends TestCase
{
    public function test_workers_cannot_exceed_daily_or_cooldown_limits(): void
    {
        $email = 'otp-race-'.bin2hex(random_bytes(8)).'@example.com';
        $key = 'otp:'.hash_hmac('sha256', $email, config('app.key'));
        $table = config('auth.passwords.users.table');
        $connection = config('database.connections.pgsql');
        $connection['url'] = null;
        $code = <<<'PHP'
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
config(['database.default' => 'pgsql', 'database.connections.pgsql' => json_decode(getenv('OTP_CONNECTION'), true), 'mail.default' => 'array']);
Illuminate\Support\Facades\DB::purge();
App\Support\DatabaseSafety::assertTarget(true);
app(App\Services\RecoveryOtpService::class)->send(getenv('OTP_EMAIL'), getenv('OTP_IP'));
PHP;
        $workers = [];
        $ipKeys = [];
        try {
            foreach ([0, 4] as $count) {
                DB::table($table)->updateOrInsert(['email' => $key], ['token' => json_encode(['d' => now('Asia/Jakarta')->format('Y-m-d'), 'n' => $count, 's' => 0]), 'created_at' => now()]);
                DB::beginTransaction();
                DB::table($table)->where('email', $key)->lockForUpdate()->first();
                for ($i = 0; $i < 6; $i++) {
                    $ip = $email.':'.$count.':'.$i;
                    $ipKeys[] = 'otp-ip:'.hash_hmac('sha256', $ip, config('app.key'));
                    $worker = new Process([PHP_BINARY, '-r', $code], base_path(), ['APP_ENV' => 'testing', 'DB_DATABASE' => 'hiru_academy_test', 'DB_URL' => '', 'OTP_CONNECTION' => json_encode($connection), 'OTP_EMAIL' => $email, 'OTP_IP' => $ip], null, 30);
                    $worker->start();
                    $workers[] = $worker;
                }
                DB::commit();
                foreach ($workers as $worker) {
                    $worker->wait();
                    $this->assertTrue($worker->isSuccessful(), $worker->getErrorOutput());
                }
                $state = json_decode(DB::table($table)->where('email', $key)->value('token'), true);
                $this->assertSame($count + 1, $state['n']);
                $workers = [];
            }
        } finally {
            if (DB::transactionLevel()) {
                DB::rollBack();
            }
            foreach ($workers as $worker) {
                $worker->stop();
            }
            DB::table($table)->whereIn('email', [$key, ...$ipKeys])->delete();
        }
    }
}
