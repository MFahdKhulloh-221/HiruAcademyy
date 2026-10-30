<?php

namespace Tests\Feature;

use App\Models\Affiliate;
use App\Models\Commission;
use App\Models\Program;
use App\Models\ProgramOffer;
use App\Models\User;
use App\Services\AffiliateService;
use App\Services\AffiliateWithdrawalService;
use App\Services\InvoiceWorkflowService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class AffiliateWithdrawalRaceTest extends TestCase
{
    public function test_concurrent_reservation_retries_legacy_settlement_and_partial_transfers(): void
    {
        $this->assertSame('hiru_academy_test', DB::connection()->getDatabaseName());
        $this->assertStringStartsWith('hiru_backend_test_affiliate_', (string) getenv('HIRU_TEST_SCHEMA'));
        $this->assertFalse((bool) app(AffiliateWithdrawalService::class)->settings()->withdrawals_enabled);
        DB::table('affiliate_settings')->where('id', 1)->update(['withdrawals_enabled' => true, 'minimum' => 1, 'fee' => 0, 'waiting_days' => 0]);
        $owner = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $buyer = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $admin = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $admin->role = 'admin'; $admin->save();
        $affiliate = app(AffiliateService::class)->ensure($owner);
        $affiliate->update(['rate' => 50]);
        $suffix = strtolower(Str::random(10));
        $program = Program::create(['code' => 'race-'.$suffix, 'slug' => 'race-'.$suffix, 'name' => 'Race test', 'family' => 'ssw', 'status' => 'active', 'sort_order' => 99]);
        $offer = ProgramOffer::create(['program_id' => $program->id, 'plan_code' => 'lms', 'base_price' => 100, 'currency' => 'IDR', 'duration_months' => 6, 'status' => 'active']);
        $workflow = app(InvoiceWorkflowService::class);
        $invoice = $workflow->create($buyer, $offer, ['referral_code' => $affiliate->code]);
        foreach (['awaiting_payment', 'paid'] as $status) $invoice = $workflow->transition($invoice, $status, $admin);
        $this->assertSame(0, Commission::where('invoice_id', $invoice->id)->count());
        $invoice = $workflow->transition($invoice, 'verified', $admin);
        $commission = $affiliate->commissions()->sole();
        $base = ['request_key' => (string) Str::uuid(), 'amount' => 30, 'bank' => 'Test', 'account_name' => 'Fixture', 'account_number' => '12345678'];
        $this->actingAs($owner)->postJson('/api/student/affiliate/withdrawals', $base)->assertUnprocessable();
        app(AffiliateService::class)->transition($commission, ['status' => 'approved']);
        try {
            $results = $this->race($affiliate, $owner, $admin, [
                ['op' => 'request', 'data' => $base],
                ['op' => 'request', 'data' => array_replace($base, ['request_key' => (string) Str::uuid()])],
            ]);
            sort($results); $this->assertSame(['ok', 'rejected'], $results);
            $row = DB::table('affiliate_withdrawals')->where('affiliate_id', $affiliate->id)->sole();
            $retry = array_replace($base, ['request_key' => $row->request_key]);
            $this->assertSame(['ok', 'ok'], $this->race($affiliate, $owner, $admin, [['op' => 'request', 'data' => $retry], ['op' => 'request', 'data' => $retry]]));
            $this->assertSame(1, DB::table('affiliate_withdrawals')->where('affiliate_id', $affiliate->id)->count());
            $legacy = ['request_key' => (string) Str::uuid(), 'affiliate_id' => $affiliate->id, 'commission_ids' => [$commission->id], 'paid_at' => today()->toDateString(), 'note' => 'BANK legacy fixture'];
            $results = $this->race($affiliate, $owner, $admin, [['op' => 'legacy', 'data' => $legacy], ['op' => 'request', 'data' => array_replace($base, ['request_key' => (string) Str::uuid(), 'amount' => 20])]]);
            $this->assertSame(['rejected', 'ok'], $results);
            $this->assertSame(0, DB::table('payouts')->where('affiliate_id', $affiliate->id)->count());
            $service = app(AffiliateWithdrawalService::class);
            $this->assertSame([], $service->available($affiliate));
            $rows = DB::table('affiliate_withdrawals')->where('affiliate_id', $affiliate->id)->orderBy('id')->get();
            foreach ($rows as $position => $request) {
                $service->transition($request->id, ['status' => 'approved']);
                $service->transition($request->id, ['status' => 'processing']);
                $transfer = ['id' => $request->id, 'status' => 'paid', 'transfer_reference' => 'RACE-'.$suffix.'-'.$position];
                $this->assertSame(['ok', 'ok'], $this->race($affiliate, $owner, $admin, [['op' => 'transfer', 'data' => $transfer], ['op' => 'transfer', 'data' => $transfer]]));
                $this->assertSame($position === 0 ? 'approved' : 'paid', $commission->fresh()->status);
            }
            $this->assertSame(50, (int) DB::table('payouts')->where('affiliate_id', $affiliate->id)->sum('amount'));
            $this->assertSame(2, DB::table('payouts')->where('affiliate_id', $affiliate->id)->count());
            $this->assertSame(1, DB::table('payout_commissions')->where('commission_id', $commission->id)->count());
        } finally {
            DB::table('affiliate_settings')->where('id', 1)->update(['withdrawals_enabled' => false]);
        }
    }

    private function race(Affiliate $affiliate, User $owner, User $admin, array $jobs): array
    {
        $connection = config('database.connections.pgsql'); $connection['url'] = null;
        $code = <<<'PHP'
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
config(['database.default' => 'pgsql', 'database.connections.pgsql' => json_decode(getenv('RACE_CONNECTION'), true)]);
Illuminate\Support\Facades\DB::purge();
App\Support\DatabaseSafety::assertTarget(true);
Illuminate\Support\Facades\DB::statement("SET lock_timeout = '15s'");
Illuminate\Support\Facades\DB::select("SELECT set_config('application_name', ?, false)", [getenv('RACE_NAME')]);
$job = json_decode(getenv('RACE_JOB'), true);
auth()->setUser(App\Models\User::findOrFail(getenv('RACE_ADMIN')));
try {
    if ($job['op'] === 'request') app(App\Services\AffiliateWithdrawalService::class)->request(App\Models\User::findOrFail(getenv('RACE_USER')), $job['data']);
    elseif ($job['op'] === 'transfer') app(App\Services\AffiliateWithdrawalService::class)->transition($job['data']['id'], $job['data']);
    else app(App\Http\Controllers\AdminPayoutController::class)->store(Illuminate\Http\Request::create('/api/admin/payouts', 'POST', $job['data']));
    echo 'ok';
} catch (Illuminate\Validation\ValidationException $e) { echo 'rejected'; }
PHP;
        $workers = []; $names = [];
        try {
            DB::beginTransaction();
            Affiliate::whereKey($affiliate->id)->lockForUpdate()->firstOrFail();
            foreach ($jobs as $job) {
                $name = 'affiliate_'.bin2hex(random_bytes(8)); $names[] = $name;
                $worker = new Process([PHP_BINARY, '-r', $code], base_path(), ['APP_ENV' => 'testing', 'DB_DATABASE' => 'hiru_academy_test', 'DB_URL' => '', 'RACE_CONNECTION' => json_encode($connection), 'RACE_NAME' => $name, 'RACE_USER' => (string) $owner->id, 'RACE_ADMIN' => (string) $admin->id, 'RACE_JOB' => json_encode($job)], null, 25);
                $worker->start(); $workers[] = $worker;
            }
            $deadline = microtime(true) + 12;
            do {
                DB::select('SELECT pg_stat_clear_snapshot()');
                $blocked = DB::table('pg_stat_activity')->where('datname', DB::connection()->getDatabaseName())->whereIn('application_name', $names)->where('wait_event_type', 'Lock')->count();
                if ($blocked === count($jobs)) break;
                foreach ($workers as $worker) $this->assertTrue($worker->isRunning(), $worker->getErrorOutput());
                usleep(20000);
            } while (microtime(true) < $deadline);
            $this->assertSame(count($jobs), $blocked, 'Workers must contend for the same affiliate lock.');
            DB::commit();
            foreach ($workers as $worker) $this->assertSame(0, $worker->wait(), $worker->getErrorOutput());
            return array_map(fn ($worker) => $worker->getOutput(), $workers);
        } finally {
            while (DB::transactionLevel() > 0) DB::rollBack();
            foreach ($workers as $worker) if ($worker->isRunning()) $worker->stop();
        }
    }
}
