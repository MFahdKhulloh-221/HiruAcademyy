<?php

namespace Tests\Feature;

use App\Models\AccessGrant;
use App\Models\Invoice;
use App\Models\Program;
use App\Models\ProgramOffer;
use App\Models\User;
use App\Services\InvoiceWorkflowService;
use App\Support\DatabaseSafety;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class InvoiceConcurrencyTest extends TestCase
{
    public function test_two_connections_activate_same_committed_invoice_exactly_once(): void
    {
        DatabaseSafety::assertTarget(true);
        $this->assertSame(0, DB::transactionLevel());
        $token = (string) Str::uuid();
        $workers = [];
        $users = [];
        $program = $offer = $invoice = null;
        $workerCode = <<<'PHP'
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (!$app->environment('testing') || $app->configurationIsCached()) {
    throw new RuntimeException('Worker requires uncached testing configuration.');
}
$input = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
config(['database.default' => 'pgsql', 'database.connections.pgsql' => $input['connection']]);
Illuminate\Support\Facades\DB::purge('pgsql');
App\Support\DatabaseSafety::assertTarget(true);
Illuminate\Support\Facades\DB::selectOne("SELECT set_config('application_name', ?, false)", [$input['name']]);
$invoice = App\Models\Invoice::findOrFail($input['invoice']);
$admin = App\Models\User::findOrFail($input['admin']);
$result = app(App\Services\InvoiceWorkflowService::class)->transition($invoice, 'active', $admin);
echo json_encode(['id' => $result->id, 'status' => $result->status, 'activated_at' => $result->getRawOriginal('activated_at'), 'grant' => App\Models\AccessGrant::where('source_invoice_id', $invoice->id)->sole()->getAttributes()], JSON_THROW_ON_ERROR);
PHP;

        try {
            DB::transaction(function () use ($token, &$users, &$program, &$offer, &$invoice) {
                foreach (['student', 'admin'] as $role) {
                    $user = User::create([
                        'name' => $role, 'email' => $role.'-'.$token.'@invoice.example.test',
                        'whatsapp' => '08'.random_int(1000000000, 9999999999), 'password' => 'Password123!',
                    ]);
                    $users[] = $user;
                    $user->role = $role;
                    $user->save();
                }
                $program = Program::create([
                    'code' => 'invoice-'.$token, 'slug' => 'invoice-'.$token, 'name' => 'Invoice concurrency',
                    'family' => 'jlpt', 'cumulative_rank' => 2, 'status' => 'active', 'sort_order' => 1,
                ]);
                $offer = ProgramOffer::create([
                    'program_id' => $program->id, 'plan_code' => 'lms', 'base_price' => 99000,
                    'currency' => 'IDR', 'duration_months' => 6, 'status' => 'active',
                ]);
                $service = app(InvoiceWorkflowService::class);
                $invoice = $service->create($users[0], $offer);
                foreach (['awaiting_payment', 'paid', 'verified'] as $status) {
                    $invoice = $service->transition($invoice, $status, $users[1]);
                }
            });
            $before = $invoice->fresh()->getAttributes();
            $start = today()->toDateString();
            $end = today()->toImmutable()->addMonthsNoOverflow(6)->subDay()->toDateString();
            DB::beginTransaction();
            Invoice::whereKey($invoice->id)->lockForUpdate()->firstOrFail();
            $names = [];
            foreach ([1, 2] as $index) {
                $name = 'invoice-'.$token.'-'.$index;
                $names[] = $name;
                $worker = new Process([PHP_BINARY, '-r', $workerCode], base_path(), [
                    'APP_ENV' => 'testing', 'DB_CONNECTION' => 'pgsql',
                    'DB_DATABASE' => 'hiru_academy_test', 'DB_URL' => '',
                ]);
                $worker->setTimeout(20);
                $worker->setInput(json_encode([
                    'connection' => DB::connection()->getConfig(), 'name' => $name,
                    'invoice' => $invoice->id, 'admin' => $users[1]->id,
                ], JSON_THROW_ON_ERROR));
                $workers[] = $worker;
                $worker->start();
            }
            $deadline = microtime(true) + 10;
            do {
                DB::select('SELECT pg_stat_clear_snapshot()');
                $blocked = DB::selectOne("SELECT count(*) AS total FROM pg_stat_activity WHERE application_name IN (?, ?) AND wait_event_type = 'Lock'", $names)->total;
                if ((int) $blocked === 2) {
                    break;
                }
                foreach ($workers as $worker) {
                    $this->assertTrue($worker->isRunning(), $worker->getErrorOutput());
                }
                usleep(10000);
            } while (microtime(true) < $deadline);
            $this->assertSame(2, (int) $blocked, 'Both independent workers must contend on the locked invoice.');
            DB::commit();
            $results = [];
            foreach ($workers as $worker) {
                $this->assertSame(0, $worker->wait(), $worker->getErrorOutput());
                $results[] = json_decode($worker->getOutput(), true, 512, JSON_THROW_ON_ERROR);
            }
            $this->assertSame($results[0], $results[1]);
            $this->assertSame($invoice->id, $results[0]['id']);
            $this->assertSame('active', $results[0]['status']);
            $this->assertSame(1, AccessGrant::where('source_invoice_id', $invoice->id)->count());
            $grant = AccessGrant::where('source_invoice_id', $invoice->id)->sole();
            $this->assertSame($users[0]->id, $grant->user_id);
            $this->assertSame($program->id, $grant->program_id);
            $this->assertSame('lms', $grant->plan_code);
            $this->assertSame('active', $grant->status);
            $this->assertSame($start, $grant->starts_at->toDateString());
            $this->assertSame($end, $grant->ends_at->toDateString());
            $this->assertSame($grant->getAttributes(), $results[0]['grant']);
            $after = $invoice->fresh()->getAttributes();
            $this->assertNotNull($after['activated_at']);
            $this->assertSame($after['activated_at'], $results[0]['activated_at']);
            unset($before['status'], $before['activated_at'], $before['updated_at'], $after['status'], $after['activated_at'], $after['updated_at']);
            $this->assertSame($before, $after);
        } finally {
            foreach ($workers as $worker) {
                $worker->stop();
            }
            while (DB::transactionLevel() > 0) {
                DB::rollBack();
            }
            DatabaseSafety::assertTarget(true);
            DB::transaction(function () use ($invoice, $offer, $program, $users) {
                if ($invoice !== null) {
                    AccessGrant::where('source_invoice_id', $invoice->id)->delete();
                    Invoice::whereKey($invoice->id)->delete();
                }
                if ($offer !== null) {
                    ProgramOffer::whereKey($offer->id)->delete();
                }
                if ($program !== null) {
                    Program::whereKey($program->id)->delete();
                }
                User::whereKey(array_map(fn (User $user) => $user->id, $users))->delete();
            });
        }
    }
}
