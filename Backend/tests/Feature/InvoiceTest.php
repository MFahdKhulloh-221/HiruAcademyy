<?php

namespace Tests\Feature;

use App\Models\AccessGrant;
use App\Models\Invoice;
use App\Models\Program;
use App\Models\ProgramOffer;
use App\Models\Promotion;
use App\Models\User;
use App\Services\EntitlementService;
use App\Services\InvoiceWorkflowService;
use Database\Seeders\ProgramOfferSeeder;
use Database\Seeders\ProgramSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use LogicException;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class InvoiceTest extends TestCase
{
    use DatabaseTransactions;

    private const STATES = ['draft', 'awaiting_payment', 'paid', 'verified', 'active'];

    private User $student;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('pgsql', DB::connection()->getDriverName());
        $this->assertSame('hiru_academy_test', DB::connection()->getDatabaseName());
        $this->travelTo(now()->setDate(2026, 10, 4)->setTime(12, 0));
        $this->seed([ProgramSeeder::class, ProgramOfferSeeder::class]);
        $this->student = $this->user('student', '081234567881');
        $this->admin = $this->user('admin', '081234567882', 'admin');
    }

    protected function tearDown(): void
    {
        $this->travelBack();
        parent::tearDown();
    }

    private function user(string $name, string $phone, string $role = 'student'): User
    {
        $user = User::create(['name' => $name, 'email' => $name.'@invoice.example.test', 'whatsapp' => $phone, 'password' => 'Password123!']);
        $user->role = $role;
        $user->save();

        return $user;
    }

    private function offer(string $code = 'n4', string $plan = 'lms'): ProgramOffer
    {
        return ProgramOffer::where('plan_code', $plan)->whereHas('program', fn ($query) => $query->where('code', $code))->firstOrFail();
    }

    private function invoice(?User $user = null, ?ProgramOffer $offer = null, array $metadata = []): Invoice
    {
        return app(InvoiceWorkflowService::class)->create($user ?? $this->student, $offer ?? $this->offer(), $metadata);
    }

    private function advance(Invoice $invoice, string $target = 'active'): Invoice
    {
        while ($invoice->status !== $target) {
            $next = self::STATES[array_search($invoice->status, self::STATES, true) + 1];
            $invoice = app(InvoiceWorkflowService::class)->transition($invoice, $next, $this->admin);
        }

        return $invoice->refresh();
    }

    private function endpoints(Invoice $invoice, bool $admin = false): array
    {
        $root = '/api/'.($admin ? 'admin' : 'student').'/invoices';

        return $admin
            ? [['GET', $root], ['GET', $root.'/'.$invoice->id], ['POST', $root.'/'.$invoice->id.'/transition']]
            : [['GET', $root], ['POST', $root], ['GET', $root.'/'.$invoice->id], ['POST', $root.'/'.$invoice->id.'/submit'], ['POST', $root.'/'.$invoice->id.'/mark-paid']];
    }

    public function test_creation_snapshots_authoritative_fields_and_does_not_grant_access(): void
    {
        $offer = $this->offer();
        $response = $this->actingAs($this->student)->postJson('/api/student/invoices', ['program_offer_id' => $offer->id])
            ->assertCreated()->assertJsonStructure(['data' => [
                'id', 'reference', 'user_id', 'program_offer_id', 'program_id', 'plan_code', 'status',
                'base_price', 'discount_percent', 'discount_amount', 'total_price', 'currency', 'duration_months',
                'due_date', 'note', 'paid_at', 'verified_at', 'activated_at', 'submitted_at', 'created_at', 'updated_at',
            ]]);
        foreach ([
            'user_id' => $this->student->id, 'program_offer_id' => $offer->id, 'program_id' => $offer->program_id,
            'plan_code' => 'lms', 'status' => 'draft', 'base_price' => 99000, 'discount_amount' => 0,
            'total_price' => 99000, 'currency' => 'IDR', 'duration_months' => 6,
            'paid_at' => null, 'verified_at' => null, 'activated_at' => null, 'submitted_at' => null,
        ] as $key => $value) {
            $response->assertJsonPath('data.'.$key, $value);
        }
        $invoice = Invoice::findOrFail($response->json('data.id'));
        $this->assertIsFloat($invoice->discount_percent);
        $this->assertSame(0.0, $invoice->discount_percent);
        $this->assertNotEmpty($invoice->reference);
        $this->assertSame(99000, $offer->fresh()->base_price);
        $this->assertDatabaseCount('invoices', 1);
        $this->assertDatabaseCount('access_grants', 0);
    }

    public function test_sensei_api_purchase_has_one_month_duration_and_n1_remains_unsellable(): void
    {
        $this->actingAs($this->student);
        foreach (['lms', 'sensei'] as $plan) {
            $offer = $this->offer('n1', $plan);
            $this->assertNull($offer->base_price);
            $this->assertSame('inactive', $offer->status);
            $this->postJson('/api/student/invoices', ['program_offer_id' => $offer->id])->assertUnprocessable();
        }
        $offer = $this->offer('n3', 'sensei');
        $response = $this->postJson('/api/student/invoices', ['program_offer_id' => $offer->id])
            ->assertCreated()->assertJsonPath('data.status', 'draft')->assertJsonPath('data.duration_months', 1);
        $offer->update(['base_price' => 200000, 'duration_months' => 6]);
        $invoice = $this->advance(Invoice::findOrFail($response->json('data.id')));
        $grant = AccessGrant::where('source_invoice_id', $invoice->id)->sole();
        $this->assertSame('sensei', $grant->plan_code);
        $this->assertSame('2026-10-04', $grant->starts_at->toDateString());
        $this->assertSame('2026-11-03', $grant->ends_at->toDateString());
        $this->assertSame(1, $invoice->duration_months);
    }

    public function test_references_are_unique_and_metadata_survives_creation(): void
    {
        $first = $this->invoice(metadata: ['due_date' => '2026-10-10', 'note' => 'Manual verification']);
        $second = $this->invoice();
        $this->assertNotSame($first->reference, $second->reference);
        $this->assertSame('2026-10-10', $first->due_date->toDateString());
        $this->assertSame('Manual verification', $first->note);
    }

    public static function prohibitedFields(): array
    {
        return array_map(fn ($field) => [$field], [
            'user_id', 'status', 'base_price', 'discount', 'discount_percent', 'discount_amount',
            'total_price', 'effective_price', 'duration', 'duration_months', 'currency',
        ]);
    }

    #[DataProvider('prohibitedFields')]
    public function test_client_authority_is_rejected_without_persistence(string $field): void
    {
        $this->actingAs($this->student)->postJson('/api/student/invoices', ['program_offer_id' => $this->offer()->id, $field => '1'])
            ->assertUnprocessable()->assertJsonValidationErrors($field);
        $this->assertDatabaseCount('invoices', 0);
        $this->assertDatabaseCount('access_grants', 0);
    }

    public static function invalidOfferIds(): array
    {
        return [[[]], [['program_offer_id' => null]], [['program_offer_id' => 0]], [['program_offer_id' => 'invalid']]];
    }

    #[DataProvider('invalidOfferIds')]
    public function test_creation_requires_existing_offer(array $payload): void
    {
        $this->actingAs($this->student)->postJson('/api/student/invoices', $payload)
            ->assertUnprocessable()->assertJsonValidationErrors('program_offer_id');
        $this->assertDatabaseCount('invoices', 0);
    }

    public static function unavailableOffers(): array
    {
        return [['unpriced'], ['inactive_offer'], ['inactive_program']];
    }

    #[DataProvider('unavailableOffers')]
    public function test_unavailable_offer_is_rejected_by_api_and_service(string $case): void
    {
        $offer = $this->offer();
        match ($case) {
            'unpriced' => $offer->update(['base_price' => null]),
            'inactive_offer' => $offer->update(['status' => 'inactive']),
            'inactive_program' => $offer->program->update(['status' => 'inactive']),
        };
        $this->actingAs($this->student)->postJson('/api/student/invoices', ['program_offer_id' => $offer->id])->assertUnprocessable();
        try {
            $this->invoice(offer: $offer->fresh());
            $this->fail('Service accepted unavailable offer.');
        } catch (ValidationException $exception) {
            $this->assertNotEmpty($exception->errors());
        }
        $this->assertDatabaseCount('invoices', 0);
    }

    public function test_guest_role_and_inactive_middleware_cover_all_endpoints(): void
    {
        $invoice = $this->invoice();
        foreach ([...$this->endpoints($invoice), ...$this->endpoints($invoice, true)] as [$method, $url]) {
            $this->json($method, $url, ['program_offer_id' => $this->offer()->id, 'status' => 'awaiting_payment'])->assertUnauthorized();
        }
        foreach ([[$this->student, true], [$this->admin, false]] as [$user, $admin]) {
            $this->actingAs($user);
            foreach ($this->endpoints($invoice, $admin) as [$method, $url]) {
                $this->json($method, $url, ['status' => 'awaiting_payment'])->assertForbidden();
            }
        }
        foreach ([[$this->student, false], [$this->admin, true]] as [$user, $admin]) {
            $user->account_status = 'inactive';
            $user->save();
            $this->actingAs($user);
            foreach ($this->endpoints($invoice, $admin) as [$method, $url]) {
                $this->json($method, $url, ['status' => 'awaiting_payment'])->assertUnauthorized();
            }
        }
        $this->assertSame('draft', $invoice->fresh()->status);
        $this->assertDatabaseCount('invoices', 1);
        $this->assertDatabaseCount('access_grants', 0);
    }

    public function test_service_requires_active_student_on_creation(): void
    {
        foreach ([$this->admin, $this->student] as $user) {
            if ($user->is($this->student)) {
                $user->account_status = 'inactive';
                $user->save();
            }
            try {
                $this->invoice(user: $user);
                $this->fail('Service accepted non-active student.');
            } catch (ValidationException $exception) {
                $this->assertNotEmpty($exception->errors());
            }
        }
        $this->assertDatabaseCount('invoices', 0);
    }

    public function test_student_list_detail_and_mutations_are_owner_scoped_admin_sees_all(): void
    {
        $own = $this->invoice();
        $otherUser = $this->user('other', '081234567883');
        $other = $this->invoice($otherUser);
        $response = $this->actingAs($this->student)->getJson('/api/student/invoices?user_id='.$otherUser->id)->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame([$own->id], array_column($response->json('data'), 'id'));
        $this->getJson('/api/student/invoices/'.$own->id)->assertOk()->assertJsonPath('data.id', $own->id);
        foreach ([$other->id, 0] as $id) {
            $this->getJson('/api/student/invoices/'.$id)->assertNotFound();
            $this->postJson('/api/student/invoices/'.$id.'/submit')->assertNotFound();
            $this->postJson('/api/student/invoices/'.$id.'/mark-paid')->assertNotFound();
        }
        $adminList = $this->actingAs($this->admin)->getJson('/api/admin/invoices')->assertOk()->assertJsonCount(2, 'data');
        $this->assertEqualsCanonicalizing([$own->id, $other->id], array_column($adminList->json('data'), 'id'));
        $this->getJson('/api/admin/invoices/'.$other->id)->assertOk()->assertJsonPath('data.user_id', $otherUser->id);
        $this->getJson('/api/admin/invoices/0')->assertNotFound();
        $this->postJson('/api/admin/invoices/0/transition', ['status' => 'active'])->assertNotFound();
        $this->assertSame('draft', $other->fresh()->status);
    }

    public static function promotionCases(): array
    {
        return [
            'fraction' => [12.5, 'active', null, null, 12375],
            'zero' => [0, 'active', null, null, 0],
            'full' => [100, 'active', null, null, 99000],
            'start boundary' => [50, 'active', '2026-10-04', null, 49500],
            'end boundary' => [50, 'active', null, '2026-10-04', 49500],
            'future' => [50, 'active', '2026-10-05', null, 0],
            'expired' => [50, 'active', null, '2026-10-03', 0],
            'inactive' => [50, 'inactive', null, null, 0],
            'draft' => [50, 'draft', null, null, 0],
        ];
    }

    #[DataProvider('promotionCases')]
    public function test_promotion_snapshot_uses_applicable_dates_and_decimal_percentage(float $percent, string $status, ?string $start, ?string $end, int $discount): void
    {
        Promotion::create(['program_offer_id' => $this->offer()->id, 'name' => 'Invoice promo', 'discount_percent' => $percent, 'status' => $status, 'starts_at' => $start, 'ends_at' => $end]);
        $invoice = $this->invoice();
        $this->assertSame($discount, $invoice->discount_amount);
        $this->assertSame(99000 - $discount, $invoice->total_price);
        $this->assertSame($discount === 0 ? 0.0 : $percent, $invoice->discount_percent);
        $this->assertSame(99000, $this->offer()->base_price);
    }

    public function test_rounding_and_deleted_promotion_preserve_history_and_new_orders_reprice(): void
    {
        $offer = $this->offer();
        $offer->update(['base_price' => 101]);
        $promo = Promotion::create(['program_offer_id' => $offer->id, 'name' => 'Half up', 'discount_percent' => 50, 'status' => 'active']);
        $invoice = $this->invoice(offer: $offer);
        $this->assertSame(51, $invoice->discount_amount);
        $this->assertSame(50, $invoice->total_price);
        $promo->update(['discount_percent' => 25]);
        $this->assertSame(25, $this->invoice()->discount_amount);
        $promo->delete();
        $offer->update(['base_price' => 200, 'duration_months' => 3]);
        $old = $invoice->fresh();
        $this->assertSame(101, $old->base_price);
        $this->assertSame(50.0, $old->discount_percent);
        $this->assertSame(51, $old->discount_amount);
        $this->assertSame(50, $old->total_price);
        $this->assertSame(6, $old->duration_months);
        $new = $this->invoice();
        $this->assertSame(200, $new->total_price);
        $this->assertSame(0.0, $new->discount_percent);
        $this->assertSame(3, $new->duration_months);
    }

    public static function frozenFields(): array
    {
        return [
            ['reference', 'CHANGED'], ['user_id', 'other'], ['program_offer_id', 'offer'], ['program_id', 'program'],
            ['plan_code', 'sensei'], ['base_price', 100000], ['discount_percent', 10], ['discount_amount', 9900],
            ['total_price', 89100], ['currency', 'USD'], ['duration_months', 3],
        ];
    }

    #[DataProvider('frozenFields')]
    public function test_snapshot_is_immutable_through_model_and_direct_database_write(string $field, mixed $value): void
    {
        $invoice = $this->invoice();
        $value = match ($value) {
            'other' => $this->user('snapshot-other', '081234567884')->id,
            'offer' => $this->offer('n3')->id,
            'program' => Program::where('code', 'n3')->firstOrFail()->id,
            default => $value,
        };
        $before = $invoice->getRawOriginal($field);
        foreach (['model', 'database'] as $path) {
            DB::beginTransaction();
            try {
                if ($path === 'model') {
                    $model = $invoice->fresh();
                    $model->setAttribute($field, $value);
                    $model->save();
                } else {
                    DB::table('invoices')->where('id', $invoice->id)->update([$field => $value]);
                }
                $this->fail('Snapshot write accepted through '.$path.': '.$field);
            } catch (QueryException|LogicException $exception) {
                $this->assertNotEmpty($exception->getMessage());
            } finally {
                DB::rollBack();
            }
            $this->assertSame($before, $invoice->fresh()->getRawOriginal($field));
        }
    }

    public function test_student_submit_and_mark_paid_do_not_activate_and_admin_completes_adjacent_steps(): void
    {
        $invoice = $this->invoice();
        $this->actingAs($this->student)->postJson('/api/student/invoices/'.$invoice->id.'/mark-paid')->assertUnprocessable();
        $this->postJson('/api/student/invoices/'.$invoice->id.'/submit', ['status' => 'active'])->assertOk()->assertJsonPath('data.status', 'awaiting_payment');
        $this->assertNotNull($invoice->fresh()->submitted_at);
        $this->assertNull($invoice->fresh()->paid_at);
        $this->postJson('/api/student/invoices/'.$invoice->id.'/mark-paid')->assertOk()->assertJsonPath('data.status', 'paid');
        $this->assertNotNull($invoice->fresh()->paid_at);
        $this->assertNull($invoice->fresh()->verified_at);
        $this->assertNull($invoice->fresh()->activated_at);
        $this->assertDatabaseCount('access_grants', 0);
        $this->actingAs($this->admin)->postJson('/api/admin/invoices/'.$invoice->id.'/transition', ['status' => 'verified'])->assertOk()->assertJsonPath('data.status', 'verified');
        $this->assertNotNull($invoice->fresh()->verified_at);
        $this->assertDatabaseCount('access_grants', 0);
        $this->postJson('/api/admin/invoices/'.$invoice->id.'/transition', ['status' => 'active'])->assertOk()->assertJsonPath('data.status', 'active');
        $this->assertNotNull($invoice->fresh()->activated_at);
        $this->assertDatabaseCount('access_grants', 1);
    }

    public function test_admin_transition_matrix_rejects_skips_backwards_repeats_and_unknown_targets(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        foreach (self::STATES as $index => $state) {
            $invoice = $this->advance($this->invoice(), $state);
            $this->actingAs($this->admin);
            foreach ([...self::STATES, 'cancelled', '', null] as $target) {
                if ($target === (self::STATES[$index + 1] ?? null) && $target !== null || $state === 'active' && $target === 'active') {
                    continue;
                }
                $before = $invoice->fresh()->getAttributes();
                $count = AccessGrant::count();
                $this->postJson('/api/admin/invoices/'.$invoice->id.'/transition', ['status' => $target])->assertUnprocessable();
                $this->assertSame($before, $invoice->fresh()->getAttributes());
                $this->assertSame($count, AccessGrant::count());
            }
            $this->postJson('/api/admin/invoices/'.$invoice->id.'/transition', [])->assertUnprocessable()->assertJsonValidationErrors('status');
        }
    }

    public function test_student_cannot_replay_steps_or_use_payload_to_verify_or_activate(): void
    {
        foreach (self::STATES as $state) {
            $invoice = $this->advance($this->invoice(), $state);
            $this->actingAs($this->student);
            foreach (['submit' => 'draft', 'mark-paid' => 'awaiting_payment'] as $action => $required) {
                if ($state === $required) {
                    continue;
                }
                $before = $invoice->fresh()->getAttributes();
                $count = AccessGrant::count();
                $this->postJson('/api/student/invoices/'.$invoice->id.'/'.$action, ['status' => 'active', 'user_id' => $this->admin->id])->assertUnprocessable();
                $this->assertSame($before, $invoice->fresh()->getAttributes());
                $this->assertSame($count, AccessGrant::count());
            }
        }
    }

    public function test_service_rejects_student_verification_foreign_ownership_and_inactive_actor(): void
    {
        $other = $this->user('service-other', '081234567885');
        $invoice = $this->advance($this->invoice(), 'paid');
        foreach ([[$this->student, 'verified', 403], [$other, 'awaiting_payment', 404], [$this->admin, 'active', null]] as [$actor, $target, $status]) {
            try {
                app(InvoiceWorkflowService::class)->transition($invoice->fresh(), $target, $actor);
                $this->fail('Service accepted unauthorized or illegal transition.');
            } catch (HttpException $exception) {
                $this->assertSame($status, $exception->getStatusCode());
            } catch (ValidationException $exception) {
                $this->assertNull($status);
                $this->assertArrayHasKey('status', $exception->errors());
            }
            $this->assertSame('paid', $invoice->fresh()->status);
            $this->assertDatabaseCount('access_grants', 0);
        }
        $this->admin->account_status = 'inactive';
        $this->admin->save();
        try {
            app(InvoiceWorkflowService::class)->transition($invoice->fresh(), 'verified', $this->admin);
            $this->fail('Service accepted inactive actor.');
        } catch (HttpException $exception) {
            $this->assertSame(403, $exception->getStatusCode());
        }
        $this->assertSame('paid', $invoice->fresh()->status);
    }

    public function test_activation_uses_frozen_program_and_plan_after_offer_retargeting(): void
    {
        $offer = $this->offer();
        $invoice = $this->invoice(offer: $offer);
        $replacement = $this->offer('n1', 'sensei');
        $replacement->delete();
        $offer->update(['program_id' => $replacement->program_id, 'plan_code' => 'sensei', 'duration_months' => 1]);
        ProgramOffer::create([
            'program_id' => $invoice->program_id, 'plan_code' => $invoice->plan_code,
            'base_price' => $invoice->base_price, 'currency' => $invoice->currency,
            'duration_months' => $invoice->duration_months, 'status' => 'active',
        ]);
        $this->advance($invoice);
        $grant = AccessGrant::where('source_invoice_id', $invoice->id)->sole();
        $this->assertSame($invoice->program_id, $grant->program_id);
        $this->assertSame('n4', $grant->program->code);
        $this->assertSame('lms', $grant->plan_code);
        $this->assertSame('2027-04-03', $grant->ends_at->toDateString());
    }

    public static function activationDates(): array
    {
        return [
            ['2026-10-04', 6, '2027-04-03'], ['2026-01-31', 1, '2026-02-27'],
            ['2028-01-31', 1, '2028-02-28'], ['2026-08-31', 6, '2027-02-27'],
        ];
    }

    #[DataProvider('activationDates')]
    public function test_activation_uses_today_frozen_duration_and_no_month_overflow(string $date, int $months, string $end): void
    {
        $offer = $this->offer();
        $offer->update(['duration_months' => $months]);
        $invoice = $this->invoice(offer: $offer);
        $offer->update(['duration_months' => 2, 'status' => 'inactive']);
        $this->travelTo(now()->setDate(...array_map('intval', explode('-', $date))));
        $this->advance($invoice);
        $grant = AccessGrant::where('source_invoice_id', $invoice->id)->sole();
        $this->assertSame($date, $grant->starts_at->toDateString());
        $this->assertSame($end, $grant->ends_at->toDateString());
        $this->assertSame('active', $grant->status);
        $this->assertSame($this->student->id, $grant->user_id);
        $this->assertSame($invoice->program_id, $grant->program_id);
        $this->assertSame($invoice->plan_code, $grant->plan_code);
    }

    public function test_repeat_activation_with_stale_instance_is_exactly_once_and_preserves_original_dates(): void
    {
        $invoice = $this->advance($this->invoice(), 'verified');
        $stale = $invoice->fresh();
        $this->advance($invoice);
        $before = AccessGrant::where('source_invoice_id', $invoice->id)->sole()->getAttributes();
        $activated = $invoice->fresh()->getRawOriginal('activated_at');
        $this->travelTo(now()->addDays(10));
        app(InvoiceWorkflowService::class)->transition($stale, 'active', $this->admin);
        $this->actingAs($this->admin)->postJson('/api/admin/invoices/'.$invoice->id.'/transition', ['status' => 'active'])->assertOk()->assertJsonPath('data.status', 'active');
        $this->assertDatabaseCount('access_grants', 1);
        $this->assertSame($before, AccessGrant::where('source_invoice_id', $invoice->id)->sole()->getAttributes());
        $this->assertSame($activated, $invoice->fresh()->getRawOriginal('activated_at'));
    }

    public function test_source_invoice_is_unique_nullable_and_foreign_key_enforced(): void
    {
        $invoice = $this->advance($this->invoice());
        $grant = AccessGrant::where('source_invoice_id', $invoice->id)->sole();
        $attributes = array_intersect_key($grant->getAttributes(), array_flip(['user_id', 'program_id', 'plan_code', 'starts_at', 'ends_at', 'status', 'source_invoice_id']));
        foreach ([$invoice->id, 0] as $source) {
            DB::beginTransaction();
            try {
                DB::table('access_grants')->insert(array_replace($attributes, ['source_invoice_id' => $source]));
                $this->fail('Duplicate or missing source invoice accepted.');
            } catch (QueryException $exception) {
                $this->assertNotEmpty($exception->getMessage());
            } finally {
                DB::rollBack();
            }
        }
        foreach ([1, 2] as $unused) {
            AccessGrant::create(array_replace($attributes, ['source_invoice_id' => null]));
        }
        $this->assertSame(2, AccessGrant::whereNull('source_invoice_id')->count());
        $this->assertSame(1, AccessGrant::where('source_invoice_id', $invoice->id)->count());
    }

    public static function entitlements(): array
    {
        return [
            ['n4', 'lms', ['dasar', 'n5', 'n4'], []],
            ['n3', 'sensei', ['dasar', 'n5', 'n4', 'n3'], ['n5', 'n4', 'n3']],
            ['ssw-food', 'lms', ['ssw-food'], []],
            ['interview', 'lms', ['interview'], []],
        ];
    }

    #[DataProvider('entitlements')]
    public function test_invoice_activation_projects_only_expected_learning_and_replay(string $code, string $plan, array $full, array $replay): void
    {
        $invoice = $this->advance($this->invoice(offer: $this->offer($code, $plan)), 'verified');
        $service = app(EntitlementService::class);
        $this->assertSame([], $service->effectiveAccess($this->student)['source_grants']);
        $this->advance($invoice);
        $expected = array_fill_keys(['dasar', 'n5', 'n4', 'n3', 'n2', 'n1'], 'preview') + ['ssw-food' => 'none', 'interview' => 'none'];
        foreach ($full as $level) {
            $expected[$level] = 'full';
        }
        $access = $service->effectiveAccess($this->student);
        $this->assertSame($expected, $access['learning']);
        $this->assertSame($replay, $access['replay_levels']);
        $this->assertCount(1, $access['source_grants']);
        $this->assertSame($code, $access['source_grants'][0]['program_code']);
        $this->assertSame($plan, $access['source_grants'][0]['plan_code']);
    }

    public function test_canonical_seed_creates_no_fake_invoices_and_preserves_existing_history(): void
    {
        $this->assertDatabaseCount('invoices', 0);
        $this->assertDatabaseCount('access_grants', 0);
        $invoice = $this->invoice();
        $before = $invoice->getAttributes();
        $this->seed([ProgramSeeder::class, ProgramOfferSeeder::class]);
        $this->assertDatabaseCount('invoices', 1);
        $this->assertDatabaseCount('access_grants', 0);
        $this->assertSame($before, $invoice->fresh()->getAttributes());
    }
}
