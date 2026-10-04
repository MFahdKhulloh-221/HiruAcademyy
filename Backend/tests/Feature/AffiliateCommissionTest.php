<?php

namespace Tests\Feature;

use App\Models\AccessGrant;
use App\Models\Affiliate;
use App\Models\Commission;
use App\Models\Invoice;
use App\Models\InvoiceAttribution;
use App\Models\Program;
use App\Models\ProgramOffer;
use App\Models\User;
use App\Services\AffiliateService;
use App\Services\InvoiceWorkflowService;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class AffiliateCommissionTest extends TestCase
{
    use DatabaseTransactions;

    private User $student;

    private User $admin;

    private ProgramOffer $offer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('pgsql', DB::connection()->getDriverName());
        $this->assertSame('hiru_academy_test', DB::connection()->getDatabaseName());
        $this->student = User::create(['name' => 'Student', 'email' => 'student@affiliate.example.test', 'whatsapp' => '081234569001', 'password' => 'Password123!']);
        $this->admin = User::create(['name' => 'Admin', 'email' => 'admin@affiliate.example.test', 'whatsapp' => '081234569002', 'password' => 'Password123!']);
        $this->admin->role = 'admin';
        $this->admin->save();
        $program = Program::create(['code' => 'affiliate-test', 'slug' => 'affiliate-test', 'name' => 'Test', 'family' => 'ssw', 'status' => 'active', 'sort_order' => 99]);
        $this->offer = ProgramOffer::create(['program_id' => $program->id, 'plan_code' => 'lms', 'base_price' => 101, 'currency' => 'IDR', 'duration_months' => 6, 'status' => 'active']);
    }

    private function affiliate(mixed $rate = '50', array $extra = []): Affiliate
    {
        return app(AffiliateService::class)->save(array_merge(['name' => 'Affiliate', 'code' => 'test_code', 'rate' => $rate, 'status' => 'active'], $extra));
    }

    private function invoice(string $state = 'verified', array $metadata = []): Invoice
    {
        $workflow = app(InvoiceWorkflowService::class);
        $invoice = $workflow->create($this->student, $this->offer, $metadata);
        foreach (['awaiting_payment', 'paid', 'verified', 'active'] as $next) {
            if ($invoice->status === $state) {
                break;
            }
            $invoice = $workflow->transition($invoice, $next, $this->admin);
        }

        return $invoice;
    }

    public function test_full_snapshot_payout_is_atomic_server_priced_and_repeat_safe(): void
    {
        $affiliate = $this->affiliate();
        $invoice = $this->invoice('active');
        $snapshot = $invoice->getAttributes();
        $commission = app(AffiliateService::class)->createCommission($invoice, $affiliate);
        $payload = ['request_key' => (string) Str::uuid(), 'affiliate_id' => $affiliate->id, 'commission_ids' => [$commission->id], 'paid_at' => today()->toDateString()];
        $this->actingAs($this->student)->postJson('/api/admin/payouts', $payload)->assertForbidden();
        $this->actingAs($this->admin)->postJson('/api/admin/payouts', $payload)->assertUnprocessable();
        app(AffiliateService::class)->transition($commission, ['status' => 'approved']);
        $this->postJson('/api/admin/payouts', $payload + ['amount' => 1])->assertUnprocessable();
        $response = $this->postJson('/api/admin/payouts', $payload)->assertOk()->assertJsonPath('data.amount', $commission->amount);
        $this->postJson('/api/admin/payouts', $payload)->assertOk()->assertJsonPath('data.id', $response->json('data.id'));
        $this->postJson('/api/admin/payouts', array_replace($payload, ['affiliate_id' => (string) $affiliate->id, 'commission_ids' => [(string) $commission->id]]))->assertOk()->assertJsonPath('data.id', $response->json('data.id'));
        $this->postJson('/api/admin/payouts', array_replace($payload, ['request_key' => (string) Str::uuid()]))->assertUnprocessable();
        $other = $this->affiliate('25', ['code' => 'OTHER_PAYOUT']);
        $this->postJson('/api/admin/payouts', array_replace($payload, ['affiliate_id' => $other->id]))->assertUnprocessable();
        $this->postJson('/api/admin/payouts', array_replace($payload, ['commission_ids' => [$commission->id, $commission->id]]))->assertUnprocessable();
        $this->assertDatabaseCount('payouts', 1);
        $this->assertDatabaseCount('payout_commissions', 1);
        $this->assertSame('paid', $commission->fresh()->status);
        $this->assertSame($snapshot, $invoice->fresh()->getAttributes());
        $this->assertDatabaseCount('access_grants', 1);
    }

    public function test_normalization_crud_unique_contacts_and_no_affiliate_role(): void
    {
        $this->actingAs($this->admin);
        $response = $this->postJson('/api/admin/affiliates', ['name' => 'Partner', 'code' => ' safe_code-1 ', 'email' => ' PARTNER@example.test ', 'user_id' => $this->student->id, 'rate' => null, 'status' => 'active'])
            ->assertCreated()->assertJsonPath('data.code', 'SAFE_CODE-1')->assertJsonPath('data.email', 'partner@example.test')->assertJsonPath('data.rate', null);
        $id = $response->json('data.id');
        $this->getJson('/api/admin/affiliates')->assertOk();
        $this->getJson('/api/admin/affiliates/'.$id)->assertOk();
        foreach ([['code' => 'safe_code-1'], ['email' => 'PARTNER@EXAMPLE.TEST'], ['user_id' => $this->student->id]] as $duplicate) {
            $this->postJson('/api/admin/affiliates', array_merge(['name' => 'Other', 'code' => 'OTHER', 'status' => 'active'], $duplicate))->assertUnprocessable();
        }
        foreach ([-1, 101, 'NaN', '1e1'] as $rate) {
            $this->patchJson('/api/admin/affiliates/'.$id, ['rate' => $rate])->assertUnprocessable();
        }
        $this->patchJson('/api/admin/affiliates/'.$id, ['code' => 'bad code'])->assertUnprocessable();
        $this->patchJson('/api/admin/affiliates/'.$id, ['rate' => 100, 'status' => 'inactive'])->assertOk();
        $this->assertSame('student', $this->student->fresh()->role);
        $this->deleteJson('/api/admin/affiliates/'.$id)->assertNoContent();
    }

    public static function states(): array
    {
        return [['draft', false], ['awaiting_payment', false], ['paid', false], ['verified', true], ['active', true]];
    }

    #[DataProvider('states')]
    public function test_eligibility_and_idempotency(string $state, bool $eligible): void
    {
        $affiliate = $this->affiliate();
        $invoice = $this->invoice($state);
        $snapshot = $invoice->getAttributes();
        $this->actingAs($this->admin);
        $attributionUrl = '/api/admin/invoices/'.$invoice->id.'/affiliate-attribution';
        if (! $eligible) {
            $this->postJson($attributionUrl, ['affiliate_id' => $affiliate->id])->assertUnprocessable();
            $this->postJson('/api/admin/commissions', ['invoice_id' => $invoice->id, 'affiliate_id' => $affiliate->id])->assertUnprocessable();
            $this->assertDatabaseCount('invoice_attributions', 0);
            $this->assertDatabaseCount('commissions', 0);

            return;
        }
        $first = $this->postJson($attributionUrl, ['affiliate_id' => $affiliate->id])->assertCreated();
        $this->postJson($attributionUrl, ['affiliate_id' => $affiliate->id])->assertOk()->assertJsonPath('data.id', $first->json('data.id'));
        $commission = $this->postJson('/api/admin/commissions', ['invoice_id' => $invoice->id])->assertCreated()->assertJsonPath('data.amount', 51);
        $this->postJson('/api/admin/commissions', ['invoice_id' => $invoice->id, 'affiliate_id' => $affiliate->id])->assertOk()->assertJsonPath('data.id', $commission->json('data.id'));
        $other = $this->affiliate(extra: ['code' => 'OTHER']);
        $this->postJson($attributionUrl, ['affiliate_id' => $other->id])->assertUnprocessable();
        $this->postJson('/api/admin/commissions', ['invoice_id' => $invoice->id, 'affiliate_id' => $other->id])->assertUnprocessable();
        $this->deleteJson('/api/admin/affiliates/'.$affiliate->id)->assertUnprocessable();
        $this->assertSame($snapshot, $invoice->fresh()->getAttributes());
        $this->assertDatabaseCount('invoice_attributions', 1);
        $this->assertDatabaseCount('commissions', 1);
    }

    public static function rates(): array
    {
        return [['0', 0], ['100', 101], ['50', 51], ['12.5', 13], ['0.49504950495049504950495049', 0], ['0.49504950495049504950495050', 1]];
    }

    #[DataProvider('rates')]
    public function test_exact_decimal_half_up(string $rate, int $amount): void
    {
        $affiliate = $this->affiliate($rate);
        $commission = app(AffiliateService::class)->createCommission($this->invoice(), $affiliate);
        $this->assertSame($amount, $commission->amount);
        $this->assertEquals($rate, $commission->rate);
    }

    public function test_null_and_inactive_rates_fail_without_partial_attribution(): void
    {
        $affiliate = $this->affiliate(null);
        $invoice = $this->invoice();
        $this->actingAs($this->admin);
        $this->postJson('/api/admin/commissions', ['invoice_id' => $invoice->id, 'affiliate_id' => $affiliate->id])->assertUnprocessable()->assertJsonValidationErrors('rate');
        $this->assertDatabaseCount('invoice_attributions', 0);
        app(AffiliateService::class)->save(['rate' => 10, 'status' => 'inactive'], $affiliate);
        $this->postJson('/api/admin/invoices/'.$invoice->id.'/affiliate-attribution', ['affiliate_id' => $affiliate->id])->assertUnprocessable();
        $this->postJson('/api/admin/commissions', ['invoice_id' => $invoice->id])->assertUnprocessable();
        $this->assertDatabaseCount('commissions', 0);
    }

    public function test_workflow_external_date_rate_lock_and_historical_snapshot(): void
    {
        $affiliate = $this->affiliate();
        $invoice = $this->invoice();
        $service = app(AffiliateService::class);
        $commission = $service->createCommission($invoice, $affiliate, 'Original');
        $service->save(['rate' => 25], $affiliate);
        $this->offer->update(['base_price' => 1000]);
        $duplicate = $service->createCommission($invoice, $affiliate, 'Overwrite');
        $this->assertSame(51, $duplicate->amount);
        $this->assertSame('50', $duplicate->rate);
        $this->assertSame('Original', $duplicate->note);
        $url = '/api/admin/commissions/'.$commission->id.'/status';
        $this->actingAs($this->admin);
        $this->getJson('/api/admin/commissions')->assertOk();
        $this->getJson('/api/admin/commissions/'.$commission->id)->assertOk();
        $this->patchJson($url, ['status' => 'paid', 'paid_at' => today()->toDateString()])->assertUnprocessable();
        $this->patchJson($url, ['status' => 'approved'])->assertOk();
        $this->patchJson($url, ['status' => 'pending'])->assertUnprocessable();
        $this->patchJson($url, ['status' => 'paid'])->assertUnprocessable();
        $this->patchJson($url, ['status' => 'paid', 'paid_at' => '2026-10-04T12:00:00+07:00'])->assertUnprocessable()->assertJsonValidationErrors('paid_at');
        $this->patchJson($url, ['status' => 'paid', 'paid_at' => today()->addDay()->toDateString()])->assertUnprocessable();
        $this->patchJson($url, ['status' => 'paid', 'paid_at' => today()->toDateString(), 'note' => 'Paid externally'])->assertOk()->assertJsonPath('data.status', 'paid');
        $this->patchJson($url, ['status' => 'approved'])->assertUnprocessable();
        $this->patchJson('/api/admin/affiliates/'.$affiliate->id, ['rate' => 30])->assertUnprocessable();
        $this->patchJson('/api/admin/affiliates/'.$affiliate->id, ['rate' => '25.00'])->assertOk();
        $this->patchJson('/api/admin/affiliates/'.$affiliate->id, ['rate' => null])->assertUnprocessable();
        $workflow = app(InvoiceWorkflowService::class);
        $active = $workflow->transition($invoice, 'active', $this->admin);
        $workflow->transition($active, 'active', $this->admin);
        $this->assertSame(1, AccessGrant::where('source_invoice_id', $invoice->id)->count());
        $this->assertSame(1, Commission::where('invoice_id', $invoice->id)->count());
        $this->assertSame(101, $invoice->fresh()->total_price);
    }

    public function test_checkout_referral_no_discount_no_automatic_commission_and_private_projection(): void
    {
        $affiliate = $this->affiliate(extra: ['user_id' => $this->student->id, 'email' => 'private@example.test', 'whatsapp' => '081234569009']);
        $this->actingAs($this->student);
        $response = $this->postJson('/api/student/invoices', ['program_offer_id' => $this->offer->id, 'referral_code' => ' test_code '])->assertCreated()->assertJsonPath('data.total_price', 101);
        $invoice = Invoice::findOrFail($response->json('data.id'));
        $this->assertSame($affiliate->id, InvoiceAttribution::where('invoice_id', $invoice->id)->sole()->affiliate_id);
        $this->assertDatabaseCount('commissions', 0);
        foreach (['bad code', 'UNKNOWN'] as $code) {
            $this->postJson('/api/student/invoices', ['program_offer_id' => $this->offer->id, 'referral_code' => $code])->assertUnprocessable();
        }
        $this->postJson('/api/student/invoices', ['program_offer_id' => $this->offer->id, 'affiliate_id' => $affiliate->id])->assertUnprocessable();
        $affiliate->update(['status' => 'inactive']);
        $this->postJson('/api/student/invoices', ['program_offer_id' => $this->offer->id, 'referral_code' => 'TEST_CODE'])->assertUnprocessable();
        $affiliate->update(['status' => 'active']);
        $workflow = app(InvoiceWorkflowService::class);
        foreach (['awaiting_payment', 'paid', 'verified', 'active'] as $state) {
            $invoice = $workflow->transition($invoice, $state, $this->admin);
            $this->assertDatabaseCount('commissions', 0);
        }
        app(AffiliateService::class)->createCommission($invoice);
        $projection = $this->getJson('/api/student/affiliate?user_id='.$this->admin->id.'&affiliate_id=999')->assertOk()->assertJsonPath('data.code', 'TEST_CODE')->assertJsonPath('data.totals.pending', 51);
        $this->assertArrayNotHasKey('email', $projection->json('data.affiliate'));
        $this->assertArrayNotHasKey('whatsapp', $projection->json('data.affiliate'));
        $other = User::create(['name' => 'Other', 'email' => 'other@affiliate.example.test', 'whatsapp' => '081234569003', 'password' => 'Password123!']);
        $this->actingAs($other)->getJson('/api/student/affiliate?user_id='.$this->student->id)->assertOk()->assertJsonPath('data.affiliate', null)->assertJsonPath('data.code', null)->assertJsonPath('data.totals.pending', 0);
        $this->assertDatabaseCount('invoices', 1);
    }

    public function test_guards_and_student_cannot_mutate(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $affiliate = $this->affiliate();
        $invoice = $this->invoice();
        $commission = app(AffiliateService::class)->createCommission($invoice, $affiliate);
        $endpoints = [
            ['GET', '/api/admin/affiliates'], ['POST', '/api/admin/affiliates'],
            ['GET', '/api/admin/affiliates/'.$affiliate->id], ['PATCH', '/api/admin/affiliates/'.$affiliate->id], ['DELETE', '/api/admin/affiliates/'.$affiliate->id],
            ['POST', '/api/admin/invoices/'.$invoice->id.'/affiliate-attribution'],
            ['GET', '/api/admin/commissions'], ['POST', '/api/admin/commissions'],
            ['GET', '/api/admin/commissions/'.$commission->id], ['PATCH', '/api/admin/commissions/'.$commission->id.'/status'],
        ];
        foreach ($endpoints as [$method, $url]) {
            $this->json($method, $url)->assertUnauthorized();
        }
        $this->getJson('/api/student/affiliate')->assertUnauthorized();
        $this->actingAs($this->student);
        foreach ($endpoints as [$method, $url]) {
            $this->json($method, $url)->assertForbidden();
        }
        $this->actingAs($this->admin)->getJson('/api/student/affiliate')->assertForbidden();
        $this->admin->account_status = 'inactive';
        $this->admin->save();
        foreach ($endpoints as [$method, $url]) {
            $this->json($method, $url)->assertUnauthorized();
        }
        $this->student->account_status = 'inactive';
        $this->student->save();
        $this->actingAs($this->student)->getJson('/api/student/affiliate')->assertUnauthorized();
    }

    public function test_timestamp_serialization_preserves_instants_and_payment_date_stays_date_only(): void
    {
        foreach ([new Affiliate, new Commission, new InvoiceAttribution] as $model) {
            $model->created_at = '2026-10-04T12:00:00+07:00';
            $model->updated_at = '2026-10-04T05:00:00+00:00';
            $this->assertStringEndsWith('+07:00', $model->getAttributes()['created_at']);
            $this->assertSame($model->created_at->getTimestamp(), $model->updated_at->getTimestamp());
            $this->assertSame('2026-10-04T05:00:00.000000Z', $model->toArray()['created_at']);
        }
        $commission = new Commission(['paid_at' => '2026-10-04']);
        $this->assertSame('2026-10-04', $commission->toArray()['paid_at']);
    }

    public function test_database_unique_constraints_and_immutable_monetary_records(): void
    {
        $affiliate = $this->affiliate();
        $invoice = $this->invoice();
        $commission = app(AffiliateService::class)->createCommission($invoice, $affiliate);
        $attribution = InvoiceAttribution::where('invoice_id', $invoice->id)->sole();
        $writes = [
            fn () => InvoiceAttribution::create(['invoice_id' => $invoice->id, 'affiliate_id' => $affiliate->id]),
            fn () => Commission::create(['invoice_id' => $invoice->id, 'affiliate_id' => $affiliate->id, 'rate' => 50, 'amount' => 51, 'status' => 'pending']),
            fn () => DB::table('commissions')->where('id', $commission->id)->update(['amount' => 999]),
            fn () => DB::table('commissions')->where('id', $commission->id)->update(['rate' => 99]),
            fn () => DB::table('commissions')->where('id', $commission->id)->delete(),
            fn () => DB::table('invoice_attributions')->where('id', $attribution->id)->delete(),
            fn () => DB::table('affiliates')->where('id', $affiliate->id)->delete(),
            fn () => Affiliate::create(['name' => 'Duplicate', 'code' => 'test_code', 'status' => 'active']),
        ];
        foreach ($writes as $write) {
            try {
                DB::transaction($write);
                $this->fail('Unsafe database write succeeded.');
            } catch (QueryException) {
                $this->assertSame(51, $commission->fresh()->amount);
            }
        }
        $this->assertDatabaseCount('commissions', 1);
        $this->assertDatabaseCount('invoice_attributions', 1);
    }
}
