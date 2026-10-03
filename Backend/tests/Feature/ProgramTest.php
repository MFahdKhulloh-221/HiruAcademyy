<?php

namespace Tests\Feature;

use App\Models\Program;
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
            $this->assertSame(['code', 'slug', 'name', 'family'], array_keys($program));
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
