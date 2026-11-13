<?php

namespace Tests\Feature;

use App\Models\AccessGrant;
use App\Models\Invoice;
use App\Models\Program;
use App\Models\ProgramOffer;
use App\Models\User;
use App\Services\InvoiceWorkflowService;
use App\Services\ReferralCreditService;
use App\Support\DatabaseSafety;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class InvoiceDeletionConcurrencyTest extends TestCase
{
    public static function races(): array
    {
        return ['delete first' => ['delete', 'confirmPayment', 404], 'payment first' => ['confirmPayment', 'delete', 422],
            'cancel first' => ['cancel', 'confirmPayment', 422], 'payment before cancel' => ['confirmPayment', 'cancel', 422]];
    }

    #[DataProvider('races')]
    public function test_payment_and_removal_serialize_on_policy(string $first, string $second, int $expected): void
    {
        DatabaseSafety::assertTarget(true);
        $this->assertSame(0, DB::transactionLevel());
        $token = (string) Str::uuid();
        $users = [];
        $program = $offer = $invoice = $worker = null;
        try {
            DB::transaction(function () use ($token, &$users, &$program, &$offer, &$invoice) {
                foreach (['student', 'admin'] as $role) {
                    $user = User::create(['name' => $role, 'email' => $role.'-'.$token.'@delete-race.example.test', 'whatsapp' => '08'.random_int(1000000000, 9999999999), 'password' => 'Password123!']);
                    $user->role = $role;
                    $user->save();
                    $users[] = $user;
                }
                $program = Program::create(['code' => 'delete-'.$token, 'slug' => 'delete-'.$token, 'name' => 'Delete race', 'family' => 'jlpt', 'cumulative_rank' => 2, 'status' => 'active', 'sort_order' => 1]);
                $offer = ProgramOffer::create(['program_id' => $program->id, 'plan_code' => 'lms', 'base_price' => 99000, 'currency' => 'IDR', 'duration_months' => 6, 'status' => 'active']);
                $service = app(InvoiceWorkflowService::class);
                $invoice = $service->transition($service->create($users[0], $offer), 'awaiting_payment', $users[1]);
            });
            DB::beginTransaction();
            app(ReferralCreditService::class)->policy(true);
            $code = <<<'PHP'
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (!$app->environment('testing') || $app->configurationIsCached()) throw new RuntimeException('Testing configuration required.');
$input = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
config(['database.default' => 'pgsql', 'database.connections.pgsql' => $input['connection']]);
Illuminate\Support\Facades\DB::purge('pgsql');
App\Support\DatabaseSafety::assertTarget(true);
Illuminate\Support\Facades\DB::selectOne("SELECT set_config('application_name', ?, false)", [$input['name']]);
$invoice = App\Models\Invoice::findOrFail($input['invoice']);
$actor = App\Models\User::findOrFail($input['actor']);
try {
    app(App\Services\InvoiceWorkflowService::class)->{$input['action']}($invoice, $actor, 'Race test');
    echo '200';
} catch (Illuminate\Validation\ValidationException $e) {
    echo '422';
} catch (Illuminate\Database\Eloquent\ModelNotFoundException $e) {
    echo '404';
}
PHP;
            $name = 'delete-race-'.$token;
            $worker = new Process([PHP_BINARY, '-r', $code], base_path(), ['APP_ENV' => 'testing', 'DB_CONNECTION' => 'pgsql', 'DB_DATABASE' => 'hiru_academy_test', 'DB_URL' => '']);
            $worker->setTimeout(20);
            $worker->setInput(json_encode(['connection' => DB::connection()->getConfig(), 'name' => $name, 'invoice' => $invoice->id, 'actor' => $users[1]->id, 'action' => $second], JSON_THROW_ON_ERROR));
            $worker->start();
            $deadline = microtime(true) + 10;
            do {
                DB::select('SELECT pg_stat_clear_snapshot()');
                $blocked = (int) DB::selectOne("SELECT count(*) AS total FROM pg_stat_activity WHERE application_name = ? AND wait_event_type = 'Lock'", [$name])->total;
                if ($blocked === 1) break;
                $this->assertTrue($worker->isRunning(), $worker->getErrorOutput());
                usleep(10000);
            } while (microtime(true) < $deadline);
            $this->assertSame(1, $blocked, 'Concurrent operation must wait on policy lock.');
            app(InvoiceWorkflowService::class)->{$first}($invoice, $users[1], 'Race test');
            DB::commit();
            $this->assertSame(0, $worker->wait(), $worker->getErrorOutput());
            $this->assertSame((string) $expected, $worker->getOutput());
            if ($first === 'delete') {
                $this->assertNull($invoice->fresh());
                $this->assertSame(0, AccessGrant::where('source_invoice_id', $invoice->id)->count());
            } elseif ($first === 'cancel') {
                $this->assertSame('awaiting_payment', $invoice->fresh()->status);
                $this->assertDatabaseHas('referral_invoice_controls', ['invoice_id' => $invoice->id, 'status' => 'cancelled']);
                $this->assertSame(0, AccessGrant::where('source_invoice_id', $invoice->id)->count());
            } else {
                $this->assertSame('active', $invoice->fresh()->status);
                $this->assertSame(1, AccessGrant::where('source_invoice_id', $invoice->id)->count());
                $this->assertDatabaseMissing('referral_invoice_controls', ['invoice_id' => $invoice->id]);
            }
        } finally {
            $worker?->stop();
            while (DB::transactionLevel() > 0) DB::rollBack();
            DatabaseSafety::assertTarget(true);
            DB::transaction(function () use ($invoice, $offer, $program, $users) {
                if ($invoice) {
                    // Test fixture cleanup only; production removal never removes related rows.
                    DB::table('referral_invoice_controls')->where('invoice_id', $invoice->id)->delete();
                    DB::table('affiliate_audits')->where('subject', (string) $invoice->id)->where('event', 'credit.cancel')->delete();
                    AccessGrant::where('source_invoice_id', $invoice->id)->delete();
                    Invoice::whereKey($invoice->id)->delete();
                }
                if ($offer) $offer->delete();
                if ($program) $program->delete();
                User::whereKey(array_map(fn ($user) => $user->id, $users))->delete();
            });
        }
    }
}
