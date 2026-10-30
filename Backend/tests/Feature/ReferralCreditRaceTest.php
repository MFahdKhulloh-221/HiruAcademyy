<?php

namespace Tests\Feature;

use App\Models\Invoice;
use App\Models\Program;
use App\Models\ProgramOffer;
use App\Models\User;
use App\Services\AffiliateService;
use App\Services\InvoiceWorkflowService;
use App\Services\ReferralCreditService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class ReferralCreditRaceTest extends TestCase
{
    public function test_double_spend_duplicate_reward_retry_and_hold_settlement_serialize(): void
    {
        $this->assertSame('hiru_academy_test', DB::connection()->getDatabaseName());
        $this->assertStringStartsWith('hiru_backend_test_referral_credit_', (string) getenv('HIRU_TEST_SCHEMA'));
        $owner = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $friend = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $admin = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $admin->role = 'admin'; $admin->save();
        $suffix = strtolower(Str::random(12));
        $program = Program::create(['code' => 'credit-'.$suffix, 'slug' => 'credit-'.$suffix, 'name' => 'Credit race', 'family' => 'ssw', 'status' => 'active', 'sort_order' => 99]);
        $offer = ProgramOffer::create(['program_id' => $program->id, 'plan_code' => 'lms', 'base_price' => 50000, 'currency' => 'IDR', 'duration_months' => 6, 'status' => 'active']);
        $code = app(AffiliateService::class)->ensure($owner);
        $workflow = app(InvoiceWorkflowService::class);
        $source = $workflow->create($friend, $offer, ['referral_code' => $code->code]);
        foreach (['awaiting_payment', 'paid'] as $status) $workflow->transition($source, $status, $admin);
        $job = ['op' => 'verify', 'data' => ['invoice' => $source->id]];
        $this->assertSame(['ok', 'ok'], $this->race($owner, $admin, [$job, $job]));
        $this->assertSame(1, DB::table('referral_learning_credits')->where('source_invoice_id', $source->id)->count());
        $jobs = [];
        foreach (range(1, 2) as $_) $jobs[] = ['op' => 'create', 'data' => ['offer' => $offer->id, 'metadata' => ['use_credit' => true, 'credit_request_key' => (string) Str::uuid()]]];
        $this->assertSame(['ok', 'ok'], $this->race($owner, $admin, $jobs));
        $this->assertSame(25000, (int) Invoice::where('user_id', $owner->id)->sum('credit_discount'));
        $this->assertSame(25000, app(ReferralCreditService::class)->student($owner)['totals']['reserved']);
        $job = $jobs[0];
        $this->assertSame(['ok', 'ok'], $this->race($owner, $admin, [$job, $job]));
        $this->assertSame(2, Invoice::where('user_id', $owner->id)->count());
        $purchase = Invoice::where('user_id', $owner->id)->where('credit_discount', '>', 0)->sole();
        foreach (['awaiting_payment', 'paid'] as $status) $workflow->transition($purchase, $status, $admin);
        $results = $this->race($owner, $admin, [['op' => 'hold', 'data' => ['invoice' => $source->id]], ['op' => 'verify', 'data' => ['invoice' => $purchase->id]]]);
        $this->assertSame('ok', $results[0]);
        $this->assertContains($results[1], ['ok', 'rejected']);
        $totals = app(ReferralCreditService::class)->student($owner)['totals'];
        $this->assertSame(0, $totals['available']);
        $this->assertSame(25000, $totals['used'] + $totals['reserved']);
        $this->assertSame($results[1] === 'ok' ? 25000 : 0, $totals['used']);
    }

    private function race(User $owner, User $admin, array $jobs): array
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
    if ($job['op'] === 'create') app(App\Services\InvoiceWorkflowService::class)->create(App\Models\User::findOrFail(getenv('RACE_USER')), App\Models\ProgramOffer::findOrFail($job['data']['offer']), $job['data']['metadata']);
    elseif ($job['op'] === 'verify') app(App\Services\InvoiceWorkflowService::class)->transition(App\Models\Invoice::findOrFail($job['data']['invoice']), 'verified', auth()->user());
    else app(App\Services\ReferralCreditService::class)->control(App\Models\Invoice::findOrFail($job['data']['invoice']), 'hold', 'Concurrent review');
    echo 'ok';
} catch (Illuminate\Validation\ValidationException $e) { echo 'rejected'; }
PHP;
        $workers = []; $names = [];
        try {
            DB::beginTransaction();
            app(ReferralCreditService::class)->policy(true);
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
