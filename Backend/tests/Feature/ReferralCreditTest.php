<?php

namespace Tests\Feature;

use App\Models\Invoice;
use App\Models\Program;
use App\Models\ProgramOffer;
use App\Models\User;
use App\Services\AffiliateService;
use App\Services\InvoiceWorkflowService;
use App\Services\ReferralCreditService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class ReferralCreditTest extends TestCase
{
    use DatabaseTransactions;

    private function student(): User
    {
        return User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
    }

    private function offer(int $amount = 100000, string $code = 'n5'): ProgramOffer
    {
        $suffix = strtolower(Str::random(10));
        $program = Program::create(['code' => $code, 'slug' => $suffix, 'name' => 'Credit '.$code, 'family' => 'jlpt', 'status' => 'active', 'sort_order' => 99]);
        return ProgramOffer::create(['program_id' => $program->id, 'plan_code' => 'lms', 'base_price' => $amount, 'currency' => 'IDR', 'duration_months' => 6, 'status' => 'active']);
    }

    private function verify(Invoice $invoice, User $admin): Invoice
    {
        foreach (['awaiting_payment', 'paid', 'verified'] as $status) $invoice = app(InvoiceWorkflowService::class)->transition($invoice, $status, $admin);
        return $invoice;
    }

    public function test_double_sided_snapshot_retry_credit_purchase_upgrade_renewal_and_limits(): void
    {
        $this->assertSame('hiru_academy_test', DB::connection()->getDatabaseName());
        $owner = $this->student(); $friend = $this->student(); $admin = $this->student(); $admin->role = 'admin'; $admin->save();
        $affiliates = app(AffiliateService::class); $workflow = app(InvoiceWorkflowService::class); $credits = app(ReferralCreditService::class);
        $code = $affiliates->ensure($owner); $this->assertSame($code->id, $affiliates->ensure($owner)->id);
        $this->assertMatchesRegularExpression('/^HIRU-[A-Z0-9]+-[A-Z0-9]+$/D', $code->code);
        $offer = $this->offer();
        $metadata = ['referral_code' => $code->code, 'credit_request_key' => (string) Str::uuid()];
        $invoice = $workflow->create($friend, $offer, $metadata);
        $this->assertSame(10000, $invoice->referral_discount); $this->assertSame(90000, $invoice->total_price);
        $this->assertSame($invoice->id, $workflow->create($friend, $offer, $metadata)->id);
        $this->assertSame(0, DB::table('referral_learning_credits')->where('source_invoice_id', $invoice->id)->count());
        $workflow->transition($invoice, 'awaiting_payment', $admin); $workflow->transition($invoice, 'paid', $admin);
        $this->assertSame(0, DB::table('referral_learning_credits')->where('source_invoice_id', $invoice->id)->count());
        DB::table('referral_credit_settings')->where('id', 1)->update(['inviter_reward' => 30000, 'friend_discount' => 5000]);
        $invoice = $workflow->transition($invoice, 'verified', $admin);
        $workflow->transition($invoice, 'verified', $admin);
        $this->assertSame(25000, $credits->student($owner)['totals']['available']);
        $this->assertSame(0, $credits->student($friend)['totals']['available']);
        $this->assertSame(1, DB::table('referral_learning_credits')->where('source_invoice_id', $invoice->id)->count());
        $this->assertSame(0, DB::table('commissions')->where('invoice_id', $invoice->id)->count());
        $second = $workflow->create($friend, $offer, ['referral_code' => $code->code]); $this->assertSame(0, $second->referral_discount);
        $smallOffer = $this->offer(10000, 'n4');
        $purchase = $workflow->create($owner, $smallOffer, ['use_credit' => true, 'credit_request_key' => (string) Str::uuid()]);
        $this->assertSame(0, $purchase->total_price); $this->assertSame(10000, $purchase->credit_discount);
        $this->assertSame(15000, $credits->student($owner)['totals']['available']);
        $this->assertSame(10000, $credits->student($owner)['totals']['reserved']);
        $this->assertSame('draft', $purchase->fresh()->status);
        $this->actingAs($owner)->postJson('/api/admin/invoices/'.$purchase->id.'/transition', ['status' => 'verified'])->assertForbidden();
        $this->assertNull($purchase->fresh()->verified_at);
        $this->assertDatabaseMissing('access_grants', ['source_invoice_id' => $purchase->id]);
        $this->verify($purchase, $admin); $workflow->transition($purchase, 'active', $admin);
        $renew = $workflow->create($owner, $smallOffer, ['use_credit' => true]);
        $this->assertNotNull($renew->renewal_grant_id); $this->assertSame(10000, $renew->credit_discount);
        $credits->control($renew, 'cancel', 'Customer cancelled before payment');
        $this->assertSame(15000, $credits->student($owner)['totals']['available']);
        $large = $workflow->create($owner, $offer, ['use_credit' => true]);
        $this->assertSame(15000, $large->credit_discount); $this->assertSame(85000, $large->total_price);
        $this->verify($large, $admin);
        $this->assertSame(25000, $credits->student($owner)['totals']['used']);
        $this->assertSame(0, $credits->student($owner)['totals']['available']);
        $this->assertSame(25000, (int) DB::table('referral_learning_credits')->where('source_invoice_id', $invoice->id)->value('amount'));
    }

    public function test_hold_blocks_reserved_settlement_new_credit_and_reversal_preserves_balance(): void
    {
        $owner = $this->student(); $friend = $this->student(); $admin = $this->student(); $admin->role = 'admin'; $admin->save();
        $code = app(AffiliateService::class)->ensure($owner); $offer = $this->offer(); $workflow = app(InvoiceWorkflowService::class);
        $source = $this->verify($workflow->create($friend, $offer, ['referral_code' => $code->code]), $admin);
        $purchase = $workflow->create($owner, $offer, ['use_credit' => true]);
        $this->actingAs($admin)->postJson('/api/admin/referral-program/invoices/'.$source->id.'/control', ['action' => 'hold', 'reason' => 'Refund under review', 'confirmed' => true])->assertOk();
        $this->actingAs($owner)->postJson('/api/student/invoices/'.$purchase->id.'/submit')->assertUnprocessable();
        $this->getJson('/api/student/affiliate')->assertJsonPath('data.totals.available', 0)->assertJsonPath('data.totals.reserved', 25000);
        $new = $workflow->create($owner, $offer, ['use_credit' => true]); $this->assertSame(0, $new->credit_discount);
        $this->actingAs($admin)->postJson('/api/admin/referral-program/invoices/'.$source->id.'/control', ['action' => 'reverse', 'reason' => 'Confirmed invalid referral', 'confirmed' => true])->assertOk();
        $this->actingAs($owner)->postJson('/api/student/invoices/'.$purchase->id.'/submit')->assertUnprocessable();
        $this->actingAs($admin)->postJson('/api/admin/referral-program/invoices/'.$purchase->id.'/control', ['action' => 'cancel', 'reason' => 'Release unused reservation', 'confirmed' => true])->assertOk();
        $this->actingAs($owner)->getJson('/api/student/affiliate')->assertJsonPath('data.totals.available', 0)->assertJsonPath('data.totals.reserved', 0);
        $this->actingAs($friend)->getJson('/api/student/invoices/'.$purchase->id)->assertNotFound();
        $this->getJson('/api/admin/referral-program')->assertForbidden();
    }

    public function test_self_referral_cash_endpoints_and_admin_validation(): void
    {
        $owner = $this->student(); $code = app(AffiliateService::class)->ensure($owner); $offer = $this->offer();
        $this->actingAs($owner)->postJson('/api/student/referral-quote', ['program_offer_id' => $offer->id, 'referral_code' => $code->code])->assertUnprocessable();
        $this->postJson('/api/student/affiliate/withdrawals', [])->assertNotFound();
        $admin = $this->student(); $admin->role = 'admin'; $admin->save();
        $this->actingAs($admin)->postJson('/api/admin/payouts', [])->assertStatus(405);
        $this->patchJson('/api/admin/affiliate-withdrawals/1', ['status' => 'paid'])->assertNotFound();
        $this->patchJson('/api/admin/referral-program', ['inviter_reward' => -1])->assertUnprocessable();
        $this->assertFalse((bool) DB::table('affiliate_settings')->where('id', 1)->value('withdrawals_enabled'));
        $this->assertSame(0, DB::table('referral_learning_credits')->where('user_id', $owner->id)->count());
    }
    public function test_promo_policy_limits_expiry_and_prospective_settings(): void
    {
        $owner = $this->student(); $friend = $this->student(); $admin = $this->student(); $admin->role = 'admin'; $admin->save();
        $offer = $this->offer();
        \App\Models\Promotion::create(['program_offer_id' => $offer->id, 'name' => 'Promo', 'discount_percent' => 20, 'status' => 'active']);
        $code = app(AffiliateService::class)->ensure($owner); $credits = app(ReferralCreditService::class);
        $quote = $credits->price($friend, $offer, ['referral_code' => $code->code]);
        $this->assertSame(0, $quote['promo_discount']); $this->assertSame(90000, $quote['total_price']);
        $settings = ['enabled' => true, 'inviter_reward' => 35000, 'friend_discount' => 12000, 'minimum_purchase' => 0, 'credit_limit' => 5000, 'expiry_days' => 7, 'combine_promo' => true, 'program_ids' => [$offer->program_id], 'reason' => 'Approved policy', 'confirmed' => true];
        $this->actingAs($admin)->patchJson('/api/admin/referral-program', $settings)->assertOk()->assertJsonPath('data.program_ids.0', $offer->program_id);
        $quote = $credits->price($friend, $offer, ['referral_code' => $code->code]);
        $this->assertSame(20000, $quote['promo_discount']); $this->assertSame(68000, $quote['total_price']);
        $workflow = app(InvoiceWorkflowService::class);
        $invoice = $this->verify($workflow->create($friend, $offer, ['referral_code' => $code->code]), $admin);
        $credit = DB::table('referral_learning_credits')->where('source_invoice_id', $invoice->id)->sole();
        $this->assertSame(35000, $credit->amount); $this->assertNotNull($credit->expires_at);
        $excluded = $this->offer(100000, 'n4');
        $excludedQuote = $credits->price($owner, $excluded, ['use_credit' => true]);
        $this->assertSame(0, $excludedQuote['credit_discount']);
        $this->assertSame(0, $credits->price($this->student(), $excluded, ['referral_code' => $code->code])['referral_discount']);
        $purchase = $workflow->create($owner, $offer, ['use_credit' => true]);
        $this->assertSame(5000, $purchase->credit_discount);
        $this->verify($purchase, $admin);
        $this->postJson('/api/admin/referral-program/invoices/'.$invoice->id.'/control', ['action' => 'reverse', 'reason' => 'Already spent', 'confirmed' => true])->assertUnprocessable();
        $this->assertSame(30000, $credits->student($owner)['totals']['available']);
        $this->travel(8)->days();
        $this->assertSame(0, $credits->student($owner)['totals']['available']);
        $this->travelBack();
    }

}
