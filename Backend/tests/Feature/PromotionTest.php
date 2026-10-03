<?php

namespace Tests\Feature;

use App\Models\ProgramOffer;
use App\Models\Promotion;
use App\Models\User;
use Database\Seeders\ProgramOfferSeeder;
use Database\Seeders\ProgramSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class PromotionTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(now()->setDate(2026, 10, 4)->setTime(12, 0));
        $this->seed([ProgramSeeder::class, ProgramOfferSeeder::class]);
    }

    protected function tearDown(): void
    {
        $this->travelBack();
        parent::tearDown();
    }

    private function offer(string $code = 'n5'): ProgramOffer
    {
        return ProgramOffer::where('plan_code', 'lms')->whereHas('program', fn ($q) => $q->where('code', $code))->firstOrFail();
    }

    private function attributes(array $overrides = []): array
    {
        return array_replace([
            'program_offer_id' => $this->offer()->id, 'name' => 'Managed promo',
            'discount_percent' => 12.5, 'status' => 'active',
            'starts_at' => now()->subDay()->toDateString(),
            'ends_at' => now()->addDay()->toDateString(), 'note' => 'Internal only',
        ], $overrides);
    }

    private function admin(): User
    {
        $user = User::create(['name' => 'Promo Admin', 'email' => 'promo@example.test', 'whatsapp' => '081234567893', 'password' => 'Password123!']);
        $user->role = 'admin';
        $user->save();

        return $user;
    }

    public function test_promotion_belongs_to_offer_and_rounds_half_up_without_mutating_base(): void
    {
        $offer = $this->offer();
        $offer->update(['base_price' => 101]);
        $promo = Promotion::create($this->attributes(['discount_percent' => 50]));
        $this->assertTrue($promo->programOffer->is($offer));
        $this->assertTrue($offer->promotions->first()->is($promo));
        $this->assertSame(51, $offer->pricing()['discount_amount']);
        $this->assertSame(50, $offer->pricing()['effective_price']);
        $this->assertSame(101, $offer->fresh()->base_price);
    }

    public static function inactiveCases(): array
    {
        return [['inactive'], ['draft'], ['future'], ['expired'], ['inactive_offer']];
    }

    #[DataProvider('inactiveCases')]
    public function test_nonapplicable_promotions_are_hidden(string $case): void
    {
        $data = match ($case) {
            'future' => ['starts_at' => now()->addDay()->toDateString()],
            'expired' => ['starts_at' => now()->subDays(2)->toDateString(), 'ends_at' => now()->subDay()->toDateString()],
            'inactive_offer' => [],
            default => ['status' => $case],
        };
        Promotion::create($this->attributes($data));
        $offer = $this->offer();
        if ($case === 'inactive_offer') {
            $offer->update(['status' => 'inactive']);
        }
        $this->assertNull($offer->pricing()['promotion']);
        $this->assertSame(0, $offer->pricing()['discount_amount']);
        $this->assertSame(99000, $offer->pricing()['effective_price']);
        $response = $this->getJson('/api/public/offers')->assertOk();
        foreach ($response->json('data') as $row) {
            $this->assertNull($row['promotion']);
            $this->assertArrayNotHasKey('note', $row);
        }
    }

    public function test_public_and_admin_offers_share_correct_effective_pricing(): void
    {
        Promotion::create($this->attributes());
        $response = $this->getJson('/api/public/offers')->assertOk();
        $response->assertJsonPath('data.0.base_price', 99000)
            ->assertJsonPath('data.0.promotion.discount_percent', 12.5)
            ->assertJsonPath('data.0.discount_amount', 12375)
            ->assertJsonPath('data.0.effective_price', 86625);
        $this->assertSame(['discount_percent'], array_keys($response->json('data.0.promotion')));
        $this->assertSame(99000, $this->offer()->fresh()->base_price);
        $this->actingAs($this->admin())->getJson('/api/admin/offers')->assertOk()
            ->assertJsonPath('data.0.effective_price', 86625);
    }

    public function test_null_bounds_and_exact_boundaries_are_applicable(): void
    {
        $promo = Promotion::create($this->attributes(['starts_at' => null, 'ends_at' => null]));
        $this->assertSame(86625, $this->offer()->pricing()['effective_price']);
        $promo->update(['starts_at' => today()->toDateString(), 'ends_at' => today()->toDateString()]);
        $this->assertSame(today()->toDateString(), $promo->fresh()->toArray()['starts_at']);
        $this->assertSame(today()->toDateString(), $promo->fresh()->toArray()['ends_at']);
        $this->travelTo(now()->startOfDay());
        $this->assertSame(86625, $this->offer()->pricing()['effective_price']);
        $this->travelTo(now()->endOfDay());
        $this->assertSame(86625, $this->offer()->pricing()['effective_price']);
        $this->travelTo(now()->addDay()->startOfDay());
        $this->assertSame(99000, $this->offer()->pricing()['effective_price']);
    }

    public function test_zero_and_full_discount_remain_nonnegative(): void
    {
        $promo = Promotion::create($this->attributes(['discount_percent' => 0]));
        $this->assertSame(99000, $this->offer()->pricing()['effective_price']);
        $promo->update(['discount_percent' => 100]);
        $this->assertSame(99000, $this->offer()->pricing()['discount_amount']);
        $this->assertSame(0, $this->offer()->pricing()['effective_price']);
    }

    public function test_n1_null_price_never_becomes_publicly_sellable(): void
    {
        $offer = $this->offer('n1');
        $offer->update(['status' => 'active']);
        Promotion::create($this->attributes(['program_offer_id' => $offer->id, 'discount_percent' => 100]));
        $this->assertNull($offer->pricing()['effective_price']);
        $this->assertNull($offer->pricing()['promotion']);
        $response = $this->getJson('/api/public/offers')->assertOk()->assertJsonCount(10, 'data');
        $this->assertNotContains('n1', array_column(array_column($response->json('data'), 'program'), 'code'));
    }

    public static function invalidPayloads(): array
    {
        return [
            [['discount_percent' => -1], 'discount_percent'],
            [['discount_percent' => 101], 'discount_percent'],
            [['discount_percent' => 'NaN'], 'discount_percent'],
            [['program_offer_id' => 0], 'program_offer_id'],
            [['status' => 'published'], 'status'],
            [['name' => ''], 'name'],
            [['starts_at' => 'invalid'], 'starts_at'],
            [['starts_at' => '2026-10-10', 'ends_at' => '2026-10-09'], 'ends_at'],
            [['starts_at' => '2026-10-04T00:00:00Z'], 'starts_at'],
        ];
    }

    #[DataProvider('invalidPayloads')]
    public function test_admin_validation_rejects_invalid_values(array $invalid, string $field): void
    {
        $this->actingAs($this->admin())->postJson('/api/admin/promotions', $this->attributes($invalid))
            ->assertUnprocessable()->assertJsonValidationErrors($field);
        $this->assertDatabaseCount('promotions', 0);
    }

    public function test_patch_validates_range_against_stored_other_bound(): void
    {
        $promo = Promotion::create($this->attributes());
        $this->actingAs($this->admin())->patchJson('/api/admin/promotions/'.$promo->id, ['ends_at' => now()->subDays(2)->toDateString()])
            ->assertUnprocessable()->assertJsonValidationErrors('ends_at');
        $this->patchJson('/api/admin/promotions/'.$promo->id, ['starts_at' => now()->addDays(2)->toDateString()])
            ->assertUnprocessable()->assertJsonValidationErrors('ends_at');
    }

    public function test_admin_can_crud_and_delete_without_changing_base_price(): void
    {
        $this->actingAs($this->admin());
        $created = $this->postJson('/api/admin/promotions', $this->attributes())->assertCreated();
        $id = $created->json('data.id');
        $this->getJson('/api/admin/promotions')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.note', 'Internal only');
        $this->patchJson('/api/admin/promotions/'.$id, ['name' => 'Updated', 'discount_percent' => 25, 'status' => 'inactive', 'note' => null])
            ->assertOk()->assertJsonPath('data.name', 'Updated')->assertJsonPath('data.status', 'inactive');
        $this->deleteJson('/api/admin/promotions/'.$id)->assertNoContent();
        $this->assertDatabaseCount('promotions', 0);
        $this->assertSame(99000, $this->offer()->base_price);
        $this->patchJson('/api/admin/promotions/'.$id, ['status' => 'active'])->assertNotFound();
    }

    public function test_students_and_guests_cannot_access_any_admin_promotion_operation(): void
    {
        $promo = Promotion::create($this->attributes());
        $user = $this->admin();
        $user->role = 'student';
        $user->save();
        foreach ([['GET', '/api/admin/promotions'], ['POST', '/api/admin/promotions'], ['PATCH', '/api/admin/promotions/'.$promo->id], ['DELETE', '/api/admin/promotions/'.$promo->id]] as [$method, $url]) {
            $this->json($method, $url, $this->attributes())->assertUnauthorized();
        }
        $this->actingAs($user);
        foreach ([['GET', '/api/admin/promotions'], ['POST', '/api/admin/promotions'], ['PATCH', '/api/admin/promotions/'.$promo->id], ['DELETE', '/api/admin/promotions/'.$promo->id]] as [$method, $url]) {
            $this->json($method, $url, $this->attributes())->assertForbidden();
        }
    }

    public function test_inactive_admin_is_denied(): void
    {
        $admin = $this->admin();
        $admin->account_status = 'inactive';
        $admin->save();
        $this->actingAs($admin)->getJson('/api/admin/promotions')->assertUnauthorized();
    }

    public function test_seed_creates_zero_promotions_and_preserves_managed_values(): void
    {
        $this->assertDatabaseCount('promotions', 0);
        $promo = Promotion::create($this->attributes());
        $fields = ['program_offer_id', 'name', 'discount_percent', 'starts_at', 'ends_at', 'status', 'note'];
        $original = array_intersect_key($promo->toArray(), array_flip($fields));
        $this->seed([ProgramSeeder::class, ProgramOfferSeeder::class]);
        $this->seed([ProgramSeeder::class, ProgramOfferSeeder::class]);
        $managed = array_intersect_key($promo->fresh()->toArray(), array_flip($fields));
        ksort($original);
        ksort($managed);
        $this->assertSame($original, $managed);
        $this->assertDatabaseCount('promotions', 1);
    }

    public function test_admin_cannot_create_activate_or_retarget_second_active_promotion(): void
    {
        Promotion::create($this->attributes());
        $draft = Promotion::create($this->attributes(['status' => 'draft']));
        $other = Promotion::create($this->attributes(['program_offer_id' => $this->offer('n4')->id]));
        $this->actingAs($this->admin());
        $this->postJson('/api/admin/promotions', $this->attributes(['starts_at' => null, 'ends_at' => null]))
            ->assertUnprocessable()->assertJsonValidationErrors('status');
        $this->patchJson('/api/admin/promotions/'.$draft->id, ['status' => 'active'])
            ->assertUnprocessable()->assertJsonValidationErrors('status');
        $this->patchJson('/api/admin/promotions/'.$other->id, ['program_offer_id' => $this->offer()->id])
            ->assertUnprocessable()->assertJsonValidationErrors('status');
        $this->assertSame('draft', $draft->fresh()->status);
    }

    public function test_database_prevents_duplicate_active_promotions(): void
    {
        Promotion::create($this->attributes());
        $this->expectException(UniqueConstraintViolationException::class);
        Promotion::create($this->attributes(['starts_at' => null, 'ends_at' => null]));
    }

    public static function invalidDatabaseValues(): array
    {
        return [[['discount_percent' => -1]], [['discount_percent' => 101]], [['starts_at' => '2026-10-10', 'ends_at' => '2026-10-09']], [['program_offer_id' => 0]], [['status' => 'other']]];
    }

    #[DataProvider('invalidDatabaseValues')]
    public function test_database_constraints_reject_invalid_values(array $invalid): void
    {
        $this->expectException(QueryException::class);
        Promotion::create($this->attributes($invalid));
    }
}
