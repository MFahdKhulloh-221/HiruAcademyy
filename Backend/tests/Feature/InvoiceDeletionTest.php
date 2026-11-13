<?php

namespace Tests\Feature;

use App\Models\AccessGrant;
use App\Models\Invoice;
use App\Models\ProgramOffer;
use App\Models\User;
use App\Services\InvoiceWorkflowService;
use Database\Seeders\ProgramOfferSeeder;
use Database\Seeders\ProgramSeeder;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class InvoiceDeletionTest extends TestCase
{
    use DatabaseTransactions;

    private User $admin;
    private User $student;
    private Invoice $invoice;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        $this->seed([ProgramSeeder::class, ProgramOfferSeeder::class]);
        foreach (['admin', 'student'] as $role) {
            $user = User::create(['name' => $role, 'email' => Str::uuid().'@delete.example.test', 'whatsapp' => '08'.random_int(1000000000, 9999999999), 'password' => 'Password123!']);
            $user->role = $role;
            $user->save();
            $this->{$role} = $user;
        }
        $offer = ProgramOffer::where('plan_code', 'lms')->whereHas('program', fn ($q) => $q->where('code', 'n4'))->firstOrFail();
        $this->invoice = app(InvoiceWorkflowService::class)->create($this->student, $offer);
    }

    public function test_admin_can_delete_unpaid_invoice_and_preserve_reminder(): void
    {
        $reminders = DB::table('notification_contents')->where('event_key', 'invoice-confirmation:'.$this->invoice->id)->get();
        $this->assertCount(1, $reminders);
        $this->actingAs($this->admin, 'sanctum')->getJson('/api/admin/invoices/'.$this->invoice->id)->assertOk()->assertJsonPath('data.can_delete', true);
        app(InvoiceWorkflowService::class)->transition($this->invoice, 'awaiting_payment', $this->admin);
        $this->deleteJson('/api/admin/invoices/'.$this->invoice->id)->assertNoContent();
        $this->assertDatabaseMissing('invoices', ['id' => $this->invoice->id]);
        $this->assertEquals($reminders, DB::table('notification_contents')->where('event_key', 'invoice-confirmation:'.$this->invoice->id)->get());
    }

    public function test_delete_and_cancel_require_active_admin(): void
    {
        $url = '/api/admin/invoices/'.$this->invoice->id;
        $this->deleteJson($url)->assertUnauthorized();
        foreach (['student'] as $role) {
            $this->student->role = $role;
            $this->student->save();
            $this->actingAs($this->student, 'sanctum')->deleteJson($url)->assertForbidden();
            $this->postJson($url.'/cancel', ['reason' => 'Mistake', 'confirmation' => true])->assertForbidden();
        }
        $this->admin->account_status = 'inactive';
        $this->admin->save();
        $this->actingAs($this->admin, 'sanctum')->deleteJson($url)->assertUnauthorized();
        $this->postJson($url.'/cancel', ['reason' => 'Mistake', 'confirmation' => true])->assertUnauthorized();
        $this->assertDatabaseHas('invoices', ['id' => $this->invoice->id]);
    }

    public function test_paid_states_deny_delete_and_cancel(): void
    {
        $this->actingAs($this->admin, 'sanctum');
        foreach (['awaiting_payment', 'paid', 'verified', 'active'] as $status) {
            $this->invoice = app(InvoiceWorkflowService::class)->transition($this->invoice, $status, $this->admin);
            if ($status === 'awaiting_payment') continue;
            $this->deleteJson('/api/admin/invoices/'.$this->invoice->id)->assertUnprocessable()->assertJsonValidationErrors('invoice');
            $this->postJson('/api/admin/invoices/'.$this->invoice->id.'/cancel', ['reason' => 'Mistake', 'confirmation' => true])->assertUnprocessable();
        }
        $this->assertSame(1, AccessGrant::where('source_invoice_id', $this->invoice->id)->count());
    }

    public function test_cancelled_controls_are_terminal_and_invoice_stays_archived(): void
    {
        $url = '/api/admin/invoices/'.$this->invoice->id;
        $body = ['reason' => 'Duplicate order', 'confirmation' => true];
        $this->actingAs($this->admin, 'sanctum')->postJson($url.'/cancel', $body)->assertOk();
        $before = DB::table('referral_invoice_controls')->where('invoice_id', $this->invoice->id)->first();
        $audits = DB::table('affiliate_audits')->where('subject', (string) $this->invoice->id)->count();
        foreach (['hold', 'reverse', 'cancel'] as $action) {
            try {
                app(\App\Services\ReferralCreditService::class)->control($this->invoice, $action, 'Must not overwrite');
                $this->fail('Cancelled control must reject '.$action);
            } catch (\Illuminate\Validation\ValidationException $exception) {
                $this->assertArrayHasKey('credit', $exception->errors());
            }
            $this->assertEquals($before, DB::table('referral_invoice_controls')->where('invoice_id', $this->invoice->id)->first());
        }
        $this->postJson($url.'/cancel', $body)->assertOk()->assertJsonPath('data.status', 'cancelled');
        $this->assertSame($audits, DB::table('affiliate_audits')->where('subject', (string) $this->invoice->id)->count());
        $this->getJson('/api/admin/invoices')->assertJsonMissing(['id' => $this->invoice->id, 'reference' => $this->invoice->reference]);
        $this->getJson('/api/admin/invoices?archived=1')->assertJsonFragment(['id' => $this->invoice->id, 'status' => 'cancelled']);
    }

    public function test_cancelled_idempotent_checkout_projects_cancelled_without_mutating_snapshot(): void
    {
        $key = (string) Str::uuid();
        $offer = ProgramOffer::findOrFail($this->invoice->program_offer_id);
        $invoice = app(InvoiceWorkflowService::class)->create($this->student, $offer, ['credit_request_key' => $key]);
        $this->actingAs($this->admin, 'sanctum')->postJson('/api/admin/invoices/'.$invoice->id.'/cancel', ['reason' => 'Duplicate order', 'confirmation' => true])->assertOk();
        $this->actingAs($this->student, 'sanctum')->postJson('/api/student/invoices', ['program_offer_id' => $offer->id, 'credit_request_key' => $key])->assertCreated()->assertJsonPath('data.id', $invoice->id)->assertJsonPath('data.status', 'cancelled');
        $this->assertSame('draft', $invoice->fresh()->status);
    }

    public function test_foreign_key_final_guard_returns_validation_error_without_removing_relations(): void
    {
        AccessGrant::create(['source_invoice_id' => $this->invoice->id, 'user_id' => $this->student->id,
            'program_id' => $this->invoice->program_id, 'plan_code' => $this->invoice->plan_code,
            'status' => 'active', 'starts_at' => today(), 'ends_at' => today()->addMonth()]);
        $this->actingAs($this->admin, 'sanctum')->getJson('/api/admin/invoices/'.$this->invoice->id)->assertJsonPath('data.can_delete', false);
        $this->partialMock(InvoiceWorkflowService::class, function ($mock) {
            $mock->shouldReceive('canDelete')->once()->andReturn(true);
        });
        $this->deleteJson('/api/admin/invoices/'.$this->invoice->id)->assertUnprocessable()->assertJsonValidationErrors('invoice');
        $this->assertDatabaseHas('invoices', ['id' => $this->invoice->id]);
        $this->assertDatabaseHas('access_grants', ['source_invoice_id' => $this->invoice->id]);
    }

    public function test_stale_unpaid_status_with_payment_timestamp_is_not_removable(): void
    {
        $this->invoice->update(['status' => 'awaiting_payment', 'paid_at' => now()]);
        $url = '/api/admin/invoices/'.$this->invoice->id;
        $this->actingAs($this->admin, 'sanctum')->getJson($url)->assertJsonPath('data.can_delete', false);
        $this->deleteJson($url)->assertUnprocessable();
        $this->postJson($url.'/cancel', ['reason' => 'Mistake', 'confirmation' => true])->assertUnprocessable();
        $this->assertDatabaseHas('invoices', ['id' => $this->invoice->id]);
    }

    public static function creditUseStates(): array
    {
        return ['reserved' => ['reserved'], 'released' => ['released']];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('creditUseStates')]
    public function test_credit_relation_blocks_delete_and_cancel_archives_without_deleting_rows(string $useStatus): void
    {
        $source = $this->invoice->replicate();
        $source->reference = (string) Str::uuid();
        $source->save();
        $credit = DB::table('referral_learning_credits')->insertGetId(['reference' => (string) Str::uuid(), 'user_id' => $this->student->id, 'source_invoice_id' => $source->id, 'amount' => 100, 'status' => 'available']);
        DB::table('referral_credit_uses')->insert(['invoice_id' => $this->invoice->id, 'credit_id' => $credit, 'amount' => 100, 'status' => $useStatus]);
        $url = '/api/admin/invoices/'.$this->invoice->id;
        $this->actingAs($this->admin, 'sanctum')->getJson($url)->assertJsonPath('data.can_delete', false);
        $this->deleteJson($url)->assertUnprocessable();
        $this->postJson($url.'/cancel', [])->assertUnprocessable()->assertJsonValidationErrors(['reason', 'confirmation']);
        $this->postJson($url.'/cancel', ['reason' => 'Order mistake', 'confirmation' => true])->assertOk()->assertJsonPath('data.status', 'cancelled')->assertJsonPath('data.can_delete', false);
        $this->deleteJson($url)->assertUnprocessable();
        $this->getJson('/api/admin/invoices')->assertJsonMissing(['id' => $this->invoice->id, 'reference' => $this->invoice->reference]);
        $this->getJson('/api/admin/invoices?archived=1')->assertJsonFragment(['id' => $this->invoice->id, 'status' => 'cancelled']);
        $this->assertDatabaseHas('invoices', ['id' => $this->invoice->id, 'status' => 'draft']);
        $this->assertDatabaseHas('referral_credit_uses', ['invoice_id' => $this->invoice->id, 'credit_id' => $credit, 'status' => 'released']);
        $this->assertDatabaseHas('affiliate_audits', ['event' => 'credit.cancel', 'subject' => (string) $this->invoice->id]);
        $this->actingAs($this->student, 'sanctum')->getJson('/api/student/invoices/'.$this->invoice->id)->assertOk()->assertJsonPath('data.status', 'cancelled');
        $this->getJson('/api/student/invoices')->assertJsonFragment(['id' => $this->invoice->id, 'status' => 'cancelled']);
        $this->postJson('/api/student/invoices/'.$this->invoice->id.'/submit')->assertUnprocessable();
    }
}
