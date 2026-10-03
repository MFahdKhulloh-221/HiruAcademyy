<?php

namespace Tests\Feature;

use App\Models\AccessGrant;
use App\Models\Program;
use App\Models\ProgramOffer;
use App\Models\User;
use Database\Seeders\ProgramOfferSeeder;
use Database\Seeders\ProgramSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class AccessGrantTest extends TestCase
{
    use DatabaseTransactions;

    private User $admin;

    private User $student;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([ProgramSeeder::class, ProgramOfferSeeder::class]);
        $this->student = User::create(['name' => 'Grant Student', 'email' => 'grant-student@example.test', 'whatsapp' => '081234567894', 'password' => 'Password123!']);
        $this->admin = User::create(['name' => 'Grant Admin', 'email' => 'grant-admin@example.test', 'whatsapp' => '081234567895', 'password' => 'Password123!']);
        $this->admin->role = 'admin';
        $this->admin->save();
    }

    private function payload(string $code = 'n4', array $overrides = []): array
    {
        return array_replace([
            'program_id' => Program::where('code', $code)->firstOrFail()->id,
            'plan_code' => 'lms', 'starts_at' => '2026-10-04', 'ends_at' => '2026-10-04', 'status' => 'active',
        ], $overrides);
    }

    private function url(?User $user = null): string
    {
        return '/api/admin/users/'.($user ?? $this->student)->id.'/access';
    }

    private function grant(): AccessGrant
    {
        return AccessGrant::create(['user_id' => $this->student->id, ...$this->payload()]);
    }

    public static function plans(): array
    {
        return [['lms'], ['sensei']];
    }

    #[DataProvider('plans')]
    public function test_admin_creates_n4_source_grant_with_explicit_dates(string $plan): void
    {
        $response = $this->actingAs($this->admin)->postJson($this->url(), $this->payload(overrides: ['plan_code' => $plan]))
            ->assertCreated()->assertJsonPath('data.user_id', $this->student->id)
            ->assertJsonPath('data.plan_code', $plan)->assertJsonPath('data.starts_at', '2026-10-04')
            ->assertJsonPath('data.ends_at', '2026-10-04')->assertJsonPath('data.status', 'active');
        $grant = AccessGrant::findOrFail($response->json('data.id'));
        $this->assertTrue($grant->user->is($this->student));
        $this->assertSame('n4', $grant->program->code);
    }

    public function test_guest_and_student_cannot_manage_any_grant_endpoint(): void
    {
        $grant = $this->grant();
        $requests = [['GET', $this->url()], ['POST', $this->url()], ['PATCH', '/api/admin/access/'.$grant->id], ['DELETE', '/api/admin/access/'.$grant->id]];
        foreach ($requests as [$method, $url]) {
            $this->json($method, $url, $this->payload())->assertUnauthorized();
        }
        $this->actingAs($this->student);
        foreach ($requests as [$method, $url]) {
            $this->json($method, $url, $this->payload())->assertForbidden();
        }
        $this->assertSame('active', $grant->fresh()->status);
        $this->assertDatabaseCount('access_grants', 1);
    }

    public function test_inactive_admin_is_denied(): void
    {
        $this->admin->account_status = 'inactive';
        $this->admin->save();
        $this->actingAs($this->admin)->postJson($this->url(), $this->payload())->assertUnauthorized();
    }

    public function test_admin_target_is_rejected_on_create_list_and_patch(): void
    {
        $this->actingAs($this->admin)->postJson($this->url($this->admin), $this->payload())
            ->assertUnprocessable()->assertJsonValidationErrors('user_id');
        $this->getJson($this->url($this->admin))->assertUnprocessable()->assertJsonValidationErrors('user_id');
        $grant = $this->grant();
        $this->student->role = 'admin';
        $this->student->save();
        $this->patchJson('/api/admin/access/'.$grant->id, ['status' => 'inactive'])
            ->assertUnprocessable()->assertJsonValidationErrors('user_id');
    }

    public function test_missing_users_and_grants_are_not_found(): void
    {
        $this->actingAs($this->admin)->postJson('/api/admin/users/0/access', $this->payload())->assertNotFound();
        $this->getJson('/api/admin/users/0/access')->assertNotFound();
        $this->patchJson('/api/admin/access/0', ['status' => 'inactive'])->assertNotFound();
        $this->deleteJson('/api/admin/access/0')->assertNotFound();
    }

    public static function unsupportedPairs(): array
    {
        return [['dasar', 'lms'], ['dasar', 'sensei'], ['ssw-food', 'sensei'], ['interview', 'sensei'], ['n4', 'free'], ['n4', 'other']];
    }

    #[DataProvider('unsupportedPairs')]
    public function test_unsupported_program_and_plan_are_rejected_on_create_and_patch(string $code, string $plan): void
    {
        $this->actingAs($this->admin)->postJson($this->url(), $this->payload($code, ['plan_code' => $plan]))
            ->assertUnprocessable()->assertJsonValidationErrors('plan_code');
        $this->assertDatabaseCount('access_grants', 0);
        $grant = $this->grant();
        $this->patchJson('/api/admin/access/'.$grant->id, $this->payload($code, ['plan_code' => $plan]))
            ->assertUnprocessable()->assertJsonValidationErrors('plan_code');
        $this->assertSame('lms', $grant->fresh()->plan_code);
        $this->assertSame($this->payload()['program_id'], $grant->fresh()->program_id);
    }

    #[DataProvider('plans')]
    public function test_n1_manual_grant_ignores_sellability_without_changing_offers(string $plan): void
    {
        $before = ProgramOffer::orderBy('id')->get()->toArray();
        $this->actingAs($this->admin)->postJson($this->url(), $this->payload('n1', ['plan_code' => $plan]))->assertCreated();
        $this->assertSame($before, ProgramOffer::orderBy('id')->get()->toArray());
        $response = $this->getJson('/api/public/offers')->assertOk()->assertJsonCount(10, 'data');
        $this->assertNotContains('n1', array_column(array_column($response->json('data'), 'program'), 'code'));
    }

    public static function invalidPayloads(): array
    {
        return [
            [['program_id' => 0], 'program_id'],
            [['starts_at' => '2026-10-05', 'ends_at' => '2026-10-04'], 'ends_at'],
            [['starts_at' => '2026-10-04T00:00:00Z'], 'starts_at'],
            [['ends_at' => 'invalid'], 'ends_at'],
            [['starts_at' => null], 'starts_at'],
            [['ends_at' => null], 'ends_at'],
            [['status' => 'expired'], 'status'],
            [['status' => null], 'status'],
            [['user_id' => 0], 'user_id'],
        ];
    }

    #[DataProvider('invalidPayloads')]
    public function test_invalid_fields_are_rejected_on_create_and_patch(array $invalid, string $field): void
    {
        $this->actingAs($this->admin)->postJson($this->url(), $this->payload(overrides: $invalid))
            ->assertUnprocessable()->assertJsonValidationErrors($field);
        $this->assertDatabaseCount('access_grants', 0);
        $grant = $this->grant();
        $this->patchJson('/api/admin/access/'.$grant->id, $invalid)->assertUnprocessable()->assertJsonValidationErrors($field);
    }

    public function test_create_requires_all_source_fields(): void
    {
        $this->actingAs($this->admin)->postJson($this->url(), [])->assertUnprocessable()
            ->assertJsonValidationErrors(['program_id', 'plan_code', 'starts_at', 'ends_at', 'status']);
    }

    public function test_patch_validates_dates_against_stored_bound_and_preserves_dates(): void
    {
        $grant = $this->grant();
        $this->actingAs($this->admin)->patchJson('/api/admin/access/'.$grant->id, ['ends_at' => '2026-10-03'])
            ->assertUnprocessable()->assertJsonValidationErrors('ends_at');
        $this->patchJson('/api/admin/access/'.$grant->id, ['starts_at' => '2026-10-05'])
            ->assertUnprocessable()->assertJsonValidationErrors('ends_at');
        $this->patchJson('/api/admin/access/'.$grant->id, ['ends_at' => '2027-03-10'])
            ->assertOk()->assertJsonPath('data.ends_at', '2027-03-10')->assertJsonPath('data.starts_at', '2026-10-04');
    }

    public function test_multiple_records_and_standalone_programs_coexist_and_list_only_target_sources(): void
    {
        $this->actingAs($this->admin);
        foreach (['n4', 'n4', 'ssw-food', 'interview'] as $code) {
            $this->postJson($this->url(), $this->payload($code))->assertCreated();
        }
        $other = User::create(['name' => 'Other Student', 'email' => 'other-grant@example.test', 'whatsapp' => '081234567896', 'password' => 'Password123!']);
        $this->postJson($this->url($other), $this->payload('n5'))->assertCreated();
        $response = $this->getJson($this->url())->assertOk()->assertJsonCount(4, 'data');
        $keys = ['id', 'user_id', 'program_id', 'plan_code', 'starts_at', 'ends_at', 'status', 'source_invoice_id', 'created_at', 'updated_at'];
        sort($keys);
        foreach ($response->json('data') as $row) {
            $actual = array_keys($row);
            sort($actual);
            $this->assertSame($keys, $actual);
            $this->assertSame($this->student->id, $row['user_id']);
        }
        $this->assertDatabaseMissing('access_grants', ['plan_code' => 'free']);
    }

    public function test_patch_and_delete_preserve_offer_values_and_grant_history(): void
    {
        $before = ProgramOffer::orderBy('id')->get()->toArray();
        $grant = $this->grant();
        $this->actingAs($this->admin)->patchJson('/api/admin/access/'.$grant->id, $this->payload('ssw-food', ['status' => 'inactive']))
            ->assertOk()->assertJsonPath('data.status', 'inactive');
        $this->patchJson('/api/admin/access/'.$grant->id, ['status' => 'active'])->assertOk();
        $this->deleteJson('/api/admin/access/'.$grant->id)->assertNoContent();
        $this->deleteJson('/api/admin/access/'.$grant->id)->assertNoContent();
        $this->assertDatabaseCount('access_grants', 1);
        $this->assertSame('inactive', $grant->fresh()->status);
        $this->assertSame($before, ProgramOffer::orderBy('id')->get()->toArray());
    }

    public function test_canonical_seed_does_not_create_paid_grants(): void
    {
        $this->assertDatabaseCount('access_grants', 0);
        $this->seed([ProgramSeeder::class, ProgramOfferSeeder::class]);
        $this->assertDatabaseCount('access_grants', 0);
    }

    public static function invalidDatabaseValues(): array
    {
        return [[['user_id' => 0]], [['plan_code' => 'free']], [['status' => 'expired']], [['starts_at' => '2026-10-05']], [['ends_at' => null]], [['plan_code' => 'sensei', 'program' => 'ssw-food']]];
    }

    #[DataProvider('invalidDatabaseValues')]
    public function test_database_constraints_reject_invalid_source_records(array $invalid): void
    {
        $code = $invalid['program'] ?? 'n4';
        unset($invalid['program']);
        $this->expectException(QueryException::class);
        AccessGrant::create(['user_id' => $this->student->id, ...$this->payload($code, $invalid)]);
    }
}
