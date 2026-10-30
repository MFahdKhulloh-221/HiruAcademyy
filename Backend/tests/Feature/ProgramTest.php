<?php

namespace Tests\Feature;

use App\Models\Program;
use App\Models\ProgramOffer;
use App\Models\User;
use Database\Seeders\ProgramSeeder;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class ProgramTest extends TestCase
{
    use DatabaseTransactions;

    public function test_canonical_seed_is_exact_and_repeat_safe(): void
    {
        $this->seed(ProgramSeeder::class);
        $original = Program::orderBy('sort_order')->get()->toArray();
        $this->seed(ProgramSeeder::class);

        $this->assertSame($original, Program::orderBy('sort_order')->get()->toArray());
        $this->assertSame([
            ['dasar', 'dasar', 'DASAR', 'foundation', null, 'active', 1],
            ['n5', 'n5', 'JLPT N5', 'jlpt', 5, 'active', 2],
            ['n4', 'n4', 'JLPT N4', 'jlpt', 4, 'active', 3],
            ['n3', 'n3', 'JLPT N3', 'jlpt', 3, 'active', 4],
            ['n2', 'n2', 'JLPT N2', 'jlpt', 2, 'active', 5],
            ['n1', 'n1', 'JLPT N1', 'jlpt', 1, 'active', 6],
            ['ssw-food', 'ssw-food', 'SSW Pengolahan Makanan', 'ssw', null, 'active', 7],
            ['interview', 'interview', 'Interview', 'interview', null, 'active', 8],
        ], Program::orderBy('sort_order')->get()->map(fn (Program $program) => [
            $program->code, $program->slug, $program->name, $program->family,
            $program->cumulative_rank, $program->status, $program->sort_order,
        ])->all());
    }

    public function test_seed_preserves_existing_data(): void
    {
        $this->seed(ProgramSeeder::class);
        Program::where('code', 'n1')->update(['status' => 'inactive']);
        $extra = Program::create([
            'code' => 'test-existing', 'slug' => 'test-existing', 'name' => 'Existing program',
            'family' => 'foundation', 'status' => 'inactive', 'sort_order' => 9,
        ]);

        $this->seed(ProgramSeeder::class);

        $this->assertSame('inactive', Program::where('code', 'n1')->firstOrFail()->status);
        $this->assertTrue($extra->fresh()->exists);
        $this->assertDatabaseCount('programs', 9);
    }

    public function test_program_code_is_unique(): void
    {
        $this->seed(ProgramSeeder::class);
        $duplicate = Program::where('code', 'dasar')->firstOrFail()->replicate();
        $duplicate->slug = 'different-slug';

        $this->expectException(UniqueConstraintViolationException::class);
        $duplicate->save();
    }

    public function test_program_slug_is_unique(): void
    {
        $this->seed(ProgramSeeder::class);
        $duplicate = Program::where('code', 'dasar')->firstOrFail()->replicate();
        $duplicate->code = 'different-code';

        $this->expectException(UniqueConstraintViolationException::class);
        $duplicate->save();
    }

    public function test_public_catalog_returns_only_active_programs_in_sort_order(): void
    {
        $this->seed(ProgramSeeder::class);
        Program::where('code', 'n1')->update(['status' => 'inactive']);
        Program::where('code', 'interview')->update(['sort_order' => 0]);

        $response = $this->getJson('/api/public/programs')->assertOk()->assertJsonCount(7, 'data');

        $this->assertSame(['interview', 'dasar', 'n5', 'n4', 'n3', 'n2', 'ssw-food'],
            array_column($response->json('data'), 'code'));
        foreach ($response->json('data') as $program) {
            $this->assertSame(['id', 'code', 'slug', 'name', 'family'], array_keys($program));
            $this->assertSame(Program::where('code', $program['code'])->firstOrFail()->id, $program['id']);
        }
    }

    public function test_admin_catalog_requires_authentication(): void
    {
        $this->getJson('/api/admin/programs')->assertUnauthorized();
    }

    public function test_student_cannot_access_admin_catalog(): void
    {
        $this->actingAs($this->createUser())->getJson('/api/admin/programs')->assertForbidden();
    }

    public function test_admin_can_read_all_programs_without_timestamps(): void
    {
        $this->seed(ProgramSeeder::class);
        Program::where('code', 'n1')->update(['status' => 'inactive']);

        $response = $this->actingAs($this->createUser('admin'))
            ->getJson('/api/admin/programs')->assertOk()->assertJsonCount(8, 'data');

        $this->assertSame(['dasar', 'n5', 'n4', 'n3', 'n2', 'n1', 'ssw-food', 'interview'],
            array_column($response->json('data'), 'code'));
        $response->assertJsonPath('data.5.status', 'inactive');
        foreach ($response->json('data') as $program) {
            $this->assertSame(['id', 'code', 'slug', 'name', 'family', 'cumulative_rank', 'status', 'sort_order'],
                array_keys($program));
        }
    }

    public function test_inactive_admin_cannot_access_admin_catalog(): void
    {
        $admin = $this->createUser('admin');
        $admin->account_status = 'inactive';
        $admin->save();

        $this->actingAs($admin)->getJson('/api/admin/programs')->assertUnauthorized();
    }

    public function test_standalone_programs_have_no_jlpt_cumulative_rank(): void
    {
        $this->seed(ProgramSeeder::class);

        foreach (['ssw-food' => 'ssw', 'interview' => 'interview'] as $code => $family) {
            $program = Program::where('code', $code)->firstOrFail();
            $this->assertSame($family, $program->family);
            $this->assertNull($program->cumulative_rank);
        }
    }

    public function test_create_program_saves_draft_with_inactive_offer_for_each_plan(): void
    {
        $this->actingAs($this->createUser('admin'));
        foreach (['lms', 'sensei'] as $plan) {
            $response = $this->postJson('/api/admin/programs', [
                'name' => 'Custom '.$plan, 'slug' => 'custom-'.$plan, 'sort_order' => 9,
                'plan_code' => $plan, 'duration_months' => 7, 'base_price' => 123456,
                'status' => 'active', 'currency' => 'USD',
            ])->assertCreated()->assertJsonPath('data.status', 'draft');
            $id = $response->json('data.id');
            $this->assertDatabaseHas('program_offers', [
                'program_id' => $id, 'plan_code' => $plan, 'duration_months' => 7,
                'base_price' => 123456, 'currency' => 'IDR', 'status' => 'inactive',
            ]);
            $this->assertSame(1, ProgramOffer::where('program_id', $id)->count());
            $offers = $this->getJson('/api/admin/offers')->assertOk()->json('data');
            $this->assertContains('custom-'.$plan, array_column(array_column($offers, 'program'), 'code'));
            $this->assertNotContains($id, array_column($this->getJson('/api/public/programs')->json('data'), 'id'));
            $this->assertNotContains('custom-'.$plan, array_column(array_column($this->getJson('/api/public/offers')->assertOk()->json('data'), 'program'), 'code'));
            $this->patchJson('/api/admin/programs/'.$id, ['status' => 'active'])->assertOk();
            $this->assertSame('inactive', ProgramOffer::where('program_id', $id)->sole()->status);
            $this->assertNotContains('custom-'.$plan, array_column(array_column($this->getJson('/api/public/offers')->assertOk()->json('data'), 'program'), 'code'));
        }
    }

    public function test_create_program_requires_valid_offer_inputs_without_partial_program(): void
    {
        $this->actingAs($this->createUser('admin'));
        $base = ['name' => 'Custom validation', 'slug' => 'custom-validation', 'sort_order' => 9];
        $this->postJson('/api/admin/programs', $base)->assertUnprocessable()
            ->assertJsonValidationErrors(['plan_code', 'duration_months', 'base_price']);
        foreach ([['plan_code' => 'free'], ['duration_months' => 0], ['duration_months' => 32768], ['duration_months' => 1.5], ['base_price' => -1], ['base_price' => 2147483648], ['base_price' => null]] as $invalid) {
            $this->postJson('/api/admin/programs', [...$base, 'plan_code' => 'lms', 'duration_months' => 1, 'base_price' => 0, ...$invalid])
                ->assertUnprocessable()->assertJsonValidationErrors(array_keys($invalid));
        }
        $this->assertDatabaseMissing('programs', ['slug' => 'custom-validation']);
    }

    public function test_offer_failure_rolls_back_new_program(): void
    {
        $this->actingAs($this->createUser('admin'));
        $events = ProgramOffer::getEventDispatcher();
        ProgramOffer::setEventDispatcher(clone $events);
        ProgramOffer::creating(function () {
            throw new \RuntimeException('Offer write failed');
        });
        $this->withoutExceptionHandling();
        try {
            try {
                $this->postJson('/api/admin/programs', [
                    'name' => 'Rollback program', 'slug' => 'rollback-program', 'sort_order' => 9,
                    'plan_code' => 'lms', 'duration_months' => 1, 'base_price' => 0,
                ]);
                $this->fail('Expected offer write failure.');
            } catch (\RuntimeException $error) {
                $this->assertSame('Offer write failed', $error->getMessage());
            }
            $this->assertDatabaseMissing('programs', ['slug' => 'rollback-program']);
        } finally {
            ProgramOffer::setEventDispatcher($events);
        }
    }

    private function createUser(string $role = 'student'): User
    {
        $user = User::create([
            'name' => 'Catalog Test', 'email' => 'catalog@example.test',
            'whatsapp' => '081234567891', 'password' => 'Password123!',
        ]);
        $user->role = $role;
        $user->save();

        return $user;
    }
}
