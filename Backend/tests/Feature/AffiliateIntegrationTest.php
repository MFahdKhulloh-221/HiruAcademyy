<?php

namespace Tests\Feature;

use App\Models\Affiliate;
use App\Models\User;
use App\Services\AffiliateService;
use App\Services\AffiliateWithdrawalService;
use App\Services\InvoiceWorkflowService;
use App\Models\Program;
use App\Models\ProgramOffer;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\TestCase;

class AffiliateIntegrationTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('hiru_academy_test', DB::connection()->getDatabaseName());
        if (! Schema::hasTable('affiliate_settings')) (require database_path('migrations/2026_10_29_000030_extend_affiliate_withdrawals.php'))->up();
    }

    private function user(string $name, string $phone): User
    {
        return User::create(['name' => $name, 'email' => strtolower($name).'@affiliate-integration.example.test', 'whatsapp' => $phone, 'password' => 'Password123!']);
    }

    public function test_registration_lazy_collision_idempotency_and_self_referral(): void
    {
        $owner = $this->user('Owner', '081234500001');
        $service = app(AffiliateService::class);
        $first = $service->ensure($owner);
        $owner->update(['name' => 'Changed']);
        $this->assertSame($first->code, $service->ensure($owner)->code);
        $this->assertSame(1, Affiliate::where('user_id', $owner->id)->count());
        $collision = new class extends AffiliateService {
            public string $collision;
            public int $calls = 0;
            protected function generateCode(): string { return ++$this->calls === 1 ? $this->collision : parent::generateCode(); }
        };
        $collision->collision = $first->code;
        $this->assertNotSame($first->code, $collision->ensure($this->user('Other', '081234500002'))->code);
        $this->assertSame(2, $collision->calls);
        $this->actingAs($owner)->postJson('/api/student/affiliate/validate', ['code' => $first->code])->assertUnprocessable();
        $this->postJson('/api/auth/register', ['name' => 'New', 'email' => 'new@affiliate-integration.example.test', 'whatsapp' => '081234500003', 'password' => 'Password123!', 'password_confirmation' => 'Password123!', 'referral_code' => $first->code])->assertCreated();
        $new = User::where('email', 'new@affiliate-integration.example.test')->firstOrFail();
        $this->assertSame($first->id, $new->referrer_affiliate_id);
        $this->assertSame(1, Affiliate::where('user_id', $new->id)->count());
    }

    public function test_withdrawal_reservation_retry_rejection_transfer_and_reversal(): void
    {
        DB::table('affiliate_settings')->where('id', 1)->update(['withdrawals_enabled' => true, 'minimum' => 1, 'fee' => 0, 'waiting_days' => 0]);
        $owner = $this->user('Owner', '081234500001');
        $buyer = $this->user('Buyer', '081234500002');
        $admin = $this->user('Admin', '081234500003');
        $admin->role = 'admin';
        $admin->save();
        $affiliate = app(AffiliateService::class)->ensure($owner);
        $affiliate->update(['rate' => 50]);
        $program = Program::create(['code' => 'affiliate-integration', 'slug' => 'affiliate-integration', 'name' => 'Test', 'family' => 'ssw', 'status' => 'active', 'sort_order' => 99]);
        $offer = ProgramOffer::create(['program_id' => $program->id, 'plan_code' => 'lms', 'base_price' => 100, 'currency' => 'IDR', 'duration_months' => 6, 'status' => 'active']);
        $workflow = app(InvoiceWorkflowService::class);
        $invoice = $workflow->create($buyer, $offer, ['referral_code' => $affiliate->code]);
        $this->assertDatabaseCount('commissions', 0);
        foreach (['awaiting_payment', 'paid', 'verified'] as $status) $invoice = $workflow->transition($invoice, $status, $admin);
        $workflow->transition($invoice, 'verified', $admin);
        $commission = $affiliate->commissions()->sole();
        $this->assertSame(50, $commission->amount);
        $this->actingAs($owner)->postJson('/api/student/affiliate/withdrawals', ['request_key' => (string) Str::uuid(), 'amount' => 1, 'bank' => 'Test', 'account_name' => 'Owner', 'account_number' => '1234567890'])->assertUnprocessable();
        app(AffiliateService::class)->transition($commission, ['status' => 'approved']);
        $payload = ['request_key' => (string) Str::uuid(), 'amount' => 30, 'bank' => 'Test Bank', 'account_name' => 'Owner', 'account_number' => '1234567890'];
        $this->actingAs($owner);
        $id = $this->postJson('/api/student/affiliate/withdrawals', $payload)->assertOk()->json('data.id');
        $this->postJson('/api/student/affiliate/withdrawals', $payload)->assertOk()->assertJsonPath('data.id', $id);
        $this->postJson('/api/student/affiliate/withdrawals', array_replace($payload, ['request_key' => (string) Str::uuid()]))->assertUnprocessable();
        $this->getJson('/api/student/affiliate')->assertJsonPath('data.totals.approved', 20)->assertJsonPath('data.totals.processing', 30);
        $this->assertStringNotContainsString('1234567890', DB::table('affiliate_withdrawals')->find($id)->destination);
        $this->getJson('/api/admin/affiliate-withdrawals/'.$id.'/destination')->assertForbidden();
        $this->actingAs($buyer)->postJson('/api/student/affiliate/withdrawals', $payload)->assertNotFound();
        $this->actingAs($admin)->patchJson('/api/admin/affiliate-withdrawals/'.$id, ['status' => 'rejected', 'reason' => 'Wrong account'])->assertOk();
        $this->actingAs($owner)->getJson('/api/student/affiliate')->assertJsonPath('data.totals.approved', 50);
        $payload['request_key'] = (string) Str::uuid();
        $payload['amount'] = 50;
        $id = $this->postJson('/api/student/affiliate/withdrawals', $payload)->assertOk()->json('data.id');
        $this->actingAs($admin);
        $this->getJson('/api/admin/affiliate-withdrawals/'.$id.'/destination')->assertOk()->assertJsonPath('data.account_number', '1234567890');
        $this->patchJson('/api/admin/affiliate-withdrawals/'.$id, ['status' => 'approved'])->assertOk();
        $this->patchJson('/api/admin/affiliate-withdrawals/'.$id, ['status' => 'processing'])->assertOk();
        $this->patchJson('/api/admin/affiliate-withdrawals/'.$id, ['status' => 'rejected', 'reason' => 'Uncertain'])->assertUnprocessable();
        $this->patchJson('/api/admin/affiliate-withdrawals/'.$id, ['status' => 'paid'])->assertUnprocessable();
        $transfer = ['status' => 'paid', 'transfer_reference' => 'BANK-TEST-123'];
        $this->patchJson('/api/admin/affiliate-withdrawals/'.$id, $transfer)->assertOk();
        $this->patchJson('/api/admin/affiliate-withdrawals/'.$id, $transfer)->assertOk();
        $this->assertDatabaseCount('payouts', 1);
        $this->assertSame('paid', $commission->fresh()->status);
        $this->actingAs($buyer)->getJson('/api/student/affiliate')->assertJsonPath('data.withdrawals', []);
        $this->getJson('/api/admin/affiliate-withdrawals/'.$id.'/destination')->assertForbidden();
        $this->actingAs($admin);

        $this->postJson('/api/admin/commissions/'.$commission->id.'/hold', ['reason' => 'Refund after transfer'])->assertOk();
        $this->assertDatabaseHas('affiliate_audits', ['event' => 'commission.paid_adjustment_required']);
        $this->actingAs($owner)->getJson('/api/student/affiliate')->assertJsonPath('data.totals.approved', 0)->assertJsonPath('data.totals.paid', 50);
    }
    public function test_hold_blocks_reserved_and_legacy_payout_without_releasing_uncertain_money(): void
    {
        $this->assertFalse((bool) app(AffiliateWithdrawalService::class)->settings()->withdrawals_enabled);
        DB::table('affiliate_settings')->where('id', 1)->update(['withdrawals_enabled' => true, 'minimum' => 1, 'fee' => 0, 'waiting_days' => 0]);
        $owner = $this->user('Owner', '081234500001');
        $buyer = $this->user('Buyer', '081234500002');
        $admin = $this->user('Admin', '081234500003');
        $admin->role = 'admin'; $admin->save();
        $affiliate = app(AffiliateService::class)->ensure($owner); $affiliate->update(['rate' => 50]);
        $program = Program::create(['code' => 'hold-test', 'slug' => 'hold-test', 'name' => 'Test', 'family' => 'ssw', 'status' => 'active', 'sort_order' => 99]);
        $offer = ProgramOffer::create(['program_id' => $program->id, 'plan_code' => 'lms', 'base_price' => 100, 'currency' => 'IDR', 'duration_months' => 6, 'status' => 'active']);
        $workflow = app(InvoiceWorkflowService::class);
        $invoice = $workflow->create($buyer, $offer, ['referral_code' => $affiliate->code]);
        foreach (['awaiting_payment', 'paid', 'verified'] as $status) $invoice = $workflow->transition($invoice, $status, $admin);
        $commission = $affiliate->commissions()->sole();
        app(AffiliateService::class)->transition($commission, ['status' => 'approved']);
        $id = $this->actingAs($owner)->postJson('/api/student/affiliate/withdrawals', ['request_key' => (string) Str::uuid(), 'amount' => 20, 'bank' => 'Test', 'account_name' => 'Owner', 'account_number' => '1234567890'])->assertOk()->json('data.id');
        $this->actingAs($admin)->postJson('/api/admin/commissions/'.$commission->id.'/hold', ['reason' => 'Suspected refund'])->assertOk();
        $this->patchJson('/api/admin/affiliate-withdrawals/'.$id, ['status' => 'paid', 'transfer_reference' => 'INVALID-TRANSFER'])->assertUnprocessable();
        $this->patchJson('/api/admin/affiliate-withdrawals/'.$id, ['status' => 'rejected', 'reason' => 'Uncertain'])->assertUnprocessable();
        $this->postJson('/api/admin/payouts', ['request_key' => (string) Str::uuid(), 'affiliate_id' => $affiliate->id, 'commission_ids' => [$commission->id], 'paid_at' => today()->toDateString(), 'note' => 'Blocked refund payout'])->assertUnprocessable();
        $this->getJson('/api/admin/affiliate-audits')->assertOk();
        $this->actingAs($owner)->getJson('/api/student/affiliate')->assertJsonPath('data.totals.approved', 0)->assertJsonPath('data.totals.processing', 20)->assertJsonPath('data.history.0.status', 'held');
        $this->postJson('/api/student/affiliate/withdrawals', ['request_key' => (string) Str::uuid(), 'amount' => 1, 'bank' => 'Test', 'account_name' => 'Owner', 'account_number' => '1234567890'])->assertUnprocessable();
        $this->assertDatabaseCount('payouts', 0);
    }

}
