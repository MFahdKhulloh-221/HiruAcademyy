<?php

namespace Tests\Feature;

use App\Models\Program;
use App\Models\ProgramOffer;
use App\Models\User;
use Database\Seeders\ProgramOfferSeeder;
use Database\Seeders\ProgramSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ProgramOfferTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([ProgramSeeder::class, ProgramOfferSeeder::class]);
    }

    public function test_seed_prices_combinations_and_durations_are_exact_and_repeat_safe(): void
    {
        $original = ProgramOffer::orderBy('id')->get()->toArray();
        $this->seed(ProgramOfferSeeder::class);
        $this->assertSame($original, ProgramOffer::orderBy('id')->get()->toArray());
        $this->assertSame([
            ['n5', 'lms', 99000, 'IDR', 6, 'active'],
            ['n5', 'sensei', 350000, 'IDR', 1, 'active'],
            ['n4', 'lms', 99000, 'IDR', 6, 'active'],
            ['n4', 'sensei', 350000, 'IDR', 1, 'active'],
            ['n3', 'lms', 199000, 'IDR', 6, 'active'],
            ['n3', 'sensei', 450000, 'IDR', 1, 'active'],
            ['n2', 'lms', 249000, 'IDR', 6, 'active'],
            ['n2', 'sensei', 550000, 'IDR', 1, 'active'],
            ['n1', 'lms', null, 'IDR', 6, 'inactive'],
            ['n1', 'sensei', null, 'IDR', 1, 'inactive'],
            ['ssw-food', 'lms', 299000, 'IDR', 6, 'active'],
            ['interview', 'lms', 199000, 'IDR', 6, 'active'],
        ], ProgramOffer::with('program')->orderBy('id')->get()->map(fn (ProgramOffer $offer) => [
            $offer->program->code, $offer->plan_code, $offer->base_price,
            $offer->currency, $offer->duration_months, $offer->status,
        ])->all());
    }

    public function test_seed_preserves_managed_price_and_availability(): void
    {
        $offer = ProgramOffer::firstOrFail();
        $offer->update(['base_price' => 123000, 'duration_months' => 12, 'status' => 'inactive']);
        $this->seed(ProgramOfferSeeder::class);
        $this->assertSame(123000, $offer->fresh()->base_price);
        $this->assertSame(12, $offer->fresh()->duration_months);
        $this->assertSame('inactive', $offer->fresh()->status);
    }

    public function test_program_and_plan_pair_is_unique(): void
    {
        $this->expectException(UniqueConstraintViolationException::class);
        ProgramOffer::firstOrFail()->replicate()->save();
    }

    public function test_ssw_and_interview_have_no_sensei_offer(): void
    {
        foreach (['ssw-food', 'interview'] as $code) {
            $this->assertDatabaseMissing('program_offers', [
                'program_id' => Program::where('code', $code)->firstOrFail()->id,
                'plan_code' => 'sensei',
            ]);
        }
    }

    public function test_no_standalone_dasar_or_free_paid_offer_is_seeded(): void
    {
        $this->assertDatabaseMissing('program_offers', [
            'program_id' => Program::where('code', 'dasar')->firstOrFail()->id,
        ]);
        $this->assertDatabaseMissing('program_offers', ['plan_code' => 'free']);
    }

    public function test_unknown_n1_is_not_publicly_purchasable_even_if_marked_active(): void
    {
        ProgramOffer::whereHas('program', fn ($query) => $query->where('code', 'n1'))
            ->update(['status' => 'active']);
        $response = $this->getJson('/api/public/offers')->assertOk()->assertJsonCount(10, 'data');
        $this->assertNotContains('n1', array_column(array_column($response->json('data'), 'program'), 'code'));
    }

    public function test_public_endpoint_returns_only_sellable_offers_and_required_fields(): void
    {
        ProgramOffer::where('plan_code', 'sensei')->whereHas('program', fn ($query) => $query->where('code', 'n5'))
            ->update(['status' => 'inactive']);
        Program::where('code', 'n4')->update(['status' => 'inactive']);
        $response = $this->getJson('/api/public/offers')->assertOk()->assertJsonCount(7, 'data');
        $response->assertJsonPath('data.0.program', ['code' => 'n5', 'slug' => 'n5', 'name' => 'JLPT N5'])
            ->assertJsonPath('data.0.base_price', 99000)
            ->assertJsonPath('data.0.duration_months', 6);
        foreach ($response->json('data') as $offer) {
            $this->assertSame(['program', 'plan_code', 'base_price', 'currency', 'duration_months', 'promotion', 'discount_percent', 'discount_amount', 'effective_price'], array_keys($offer));
            $this->assertSame(['code', 'slug', 'name'], array_keys($offer['program']));
            $this->assertIsInt($offer['base_price']);
            $this->assertSame('IDR', $offer['currency']);
            $this->assertNotContains($offer['program']['code'], ['n1', 'n4', 'dasar']);
            $this->assertFalse($offer['program']['code'] === 'n5' && $offer['plan_code'] === 'sensei');
        }
    }

    public function test_guest_cannot_access_admin_offers(): void
    {
        $this->getJson('/api/admin/offers')->assertUnauthorized();
    }

    public function test_student_cannot_access_admin_offers(): void
    {
        $this->actingAs($this->createUser())->getJson('/api/admin/offers')->assertForbidden();
    }

    public function test_admin_can_access_inactive_and_unpriced_offers(): void
    {
        $response = $this->actingAs($this->createUser('admin'))
            ->getJson('/api/admin/offers')->assertOk()->assertJsonCount(12, 'data');
        $response->assertJsonPath('data.8.program.code', 'n1')
            ->assertJsonPath('data.8.base_price', null)
            ->assertJsonPath('data.8.status', 'inactive')
            ->assertJsonStructure(['data' => [['id', 'program_id', 'program', 'plan_code', 'base_price', 'currency', 'duration_months', 'status']]]);
        $this->assertArrayNotHasKey('created_at', $response->json('data.0'));
    }

    public function test_inactive_admin_cannot_access_admin_offers(): void
    {
        $admin = $this->createUser('admin');
        $admin->account_status = 'inactive';
        $admin->save();
        $this->actingAs($admin)->getJson('/api/admin/offers')->assertUnauthorized();
    }

    public function test_program_schema_has_no_commercial_fields(): void
    {
        $columns = Schema::getColumnListing('programs');
        sort($columns);
        $this->assertSame(['code', 'created_at', 'cumulative_rank', 'family', 'id', 'name', 'slug', 'sort_order', 'status', 'updated_at'], $columns);
    }

    public function test_negative_price_is_rejected(): void
    {
        $this->expectException(QueryException::class);
        ProgramOffer::firstOrFail()->update(['base_price' => -1]);
    }

    public function test_nonpositive_duration_is_rejected(): void
    {
        $this->expectException(QueryException::class);
        ProgramOffer::firstOrFail()->update(['duration_months' => 0]);
    }

    public function test_offer_requires_existing_program(): void
    {
        $this->expectException(QueryException::class);
        ProgramOffer::firstOrFail()->update(['program_id' => 0]);
    }

    private function createUser(string $role = 'student'): User
    {
        $user = User::create([
            'name' => 'Offers Test', 'email' => 'offers@example.test',
            'whatsapp' => '081234567892', 'password' => 'Password123!',
        ]);
        $user->role = $role;
        $user->save();

        return $user;
    }
}
