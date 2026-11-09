<?php

namespace Tests\Feature;

use App\Http\Controllers\ProgramController;
use App\Models\Program;
use App\Models\ProgramOffer;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Tests\TestCase;

class ProgramOrderTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        $admin = User::create(['name' => 'Program Order Admin', 'email' => 'program-order@example.test', 'whatsapp' => '081993338888', 'password' => 'Password123!']);
        $admin->role = 'admin';
        $admin->save();
        $this->actingAs($admin);
    }

    private function legacyPrograms(): array
    {
        // Existing test fixtures remain global siblings, restored by DatabaseTransactions.
        Program::query()->update(['sort_order' => 100]);
        $ids = [];
        foreach ([1, 2, 2, 4, 5] as $index => $position) {
            $ids[] = Program::create([
                'code' => 'order-'.$index, 'slug' => 'order-'.$index, 'name' => 'Order '.$index,
                'family' => 'interview', 'status' => ['active', 'inactive'][$index % 2],
                'sort_order' => $position,
            ])->id;
        }

        return $ids;
    }

    private function orderedIds(): array
    {
        return Program::orderBy('sort_order')->orderBy('id')->pluck('id')->all();
    }

    private function assertOrder(array $ids): void
    {
        $this->assertSame($ids, $this->orderedIds());
        $this->assertSame(range(0, count($ids) - 1), Program::orderBy('sort_order')->orderBy('id')->pluck('sort_order')->all());
    }

    private function payload(int $position): array
    {
        return ['name' => 'Inserted Program', 'slug' => 'inserted-program', 'sort_order' => $position,
            'plan_code' => 'lms', 'duration_months' => 1, 'base_price' => 0];
    }

    public function test_moves_normalize_legacy_duplicates_globally_and_status_does_not_reorder(): void
    {
        $ids = $this->legacyPrograms();
        $expected = $this->orderedIds();
        $before = Program::orderBy('id')->get()->toArray();
        $this->patchJson('/api/admin/programs/'.$expected[1], ['status' => 'inactive'])->assertOk();
        $this->assertSame(array_column($before, 'sort_order'), Program::orderBy('id')->pluck('sort_order')->all());

        $last = $ids[4];
        $expected = array_values(array_diff($expected, [$last]));
        array_unshift($expected, $last);
        $this->patchJson('/api/admin/programs/'.$last, ['sort_order' => 0])->assertOk()->assertJsonPath('data.sort_order', 0);
        $this->assertOrder($expected);

        array_shift($expected);
        $expected[] = $last;
        $this->patchJson('/api/admin/programs/'.$last, ['sort_order' => count($expected) - 1])->assertOk();
        $this->assertOrder($expected);

        $middle = array_pop($expected);
        array_splice($expected, 2, 0, [$middle]);
        $this->patchJson('/api/admin/programs/'.$middle, ['sort_order' => 2])->assertOk();
        $this->assertOrder($expected);
    }

    public function test_create_inserts_and_successful_delete_compacts(): void
    {
        $ids = $this->legacyPrograms();
        $expected = $this->orderedIds();
        $new = $this->postJson('/api/admin/programs', $this->payload(2))->assertCreated()->json('data.id');
        array_splice($expected, 2, 0, [$new]);
        $this->assertOrder($expected);
        $this->assertDatabaseHas('program_offers', ['program_id' => $new, 'plan_code' => 'lms', 'status' => 'inactive']);

        $this->deleteJson('/api/admin/programs/'.$ids[1])->assertOk();
        $this->assertOrder(array_values(array_diff($expected, [$ids[1]])));
    }

    public function test_successful_delete_compacts_legacy_siblings(): void
    {
        $ids = $this->legacyPrograms();
        $expected = array_values(array_diff($this->orderedIds(), [$ids[2]]));
        $this->deleteJson('/api/admin/programs/'.$ids[2])->assertOk();
        $this->assertOrder($expected);
    }

    public function test_bad_bounds_and_restricted_delete_leave_all_rows_unchanged(): void
    {
        $ids = $this->legacyPrograms();
        ProgramOffer::create(['program_id' => $ids[0], 'plan_code' => 'lms', 'duration_months' => 1, 'base_price' => 0, 'currency' => 'IDR', 'status' => 'inactive']);
        $before = Program::orderBy('id')->get()->toArray();
        $count = Program::count();
        foreach ([-1, $count, 32768] as $position) {
            $this->patchJson('/api/admin/programs/'.$ids[0], ['sort_order' => $position, 'status' => 'active'])->assertUnprocessable()->assertJsonValidationErrors('sort_order');
        }
        foreach ([-1, $count + 1, 32768] as $position) {
            $this->postJson('/api/admin/programs', $this->payload($position))->assertUnprocessable()->assertJsonValidationErrors('sort_order');
        }
        $this->deleteJson('/api/admin/programs/'.$ids[0])->assertUnprocessable()->assertJsonValidationErrors('program');
        $this->assertSame($before, Program::orderBy('id')->get()->toArray());
    }

    public function test_offer_failure_rolls_back_insert_and_order(): void
    {
        $this->legacyPrograms();
        $before = Program::orderBy('id')->get()->toArray();
        $dispatcher = ProgramOffer::getEventDispatcher();
        ProgramOffer::setEventDispatcher(clone $dispatcher);
        $this->withoutExceptionHandling();
        try {
            ProgramOffer::creating(function () {
                throw new \RuntimeException('Program offer creation rejected for rollback test.');
            });
            try {
                $this->postJson('/api/admin/programs', $this->payload(0));
                $this->fail('Expected offer creation failure.');
            } catch (\RuntimeException $error) {
                $this->assertSame('Program offer creation rejected for rollback test.', $error->getMessage());
            }
        } finally {
            ProgramOffer::setEventDispatcher($dispatcher);
        }
        $this->assertSame($before, Program::orderBy('id')->get()->toArray());
    }

    public function test_stale_bound_model_status_update_does_not_overwrite_new_position(): void
    {
        $ids = $this->legacyPrograms();
        $stale = Program::findOrFail($ids[4]);
        $this->patchJson('/api/admin/programs/'.$stale->id, ['sort_order' => 0])->assertOk();
        $expected = $this->orderedIds();
        app(ProgramController::class)->update(Request::create('/', 'PATCH', ['status' => 'inactive']), $stale);
        $this->assertOrder($expected);
        $this->assertSame('inactive', $stale->fresh()->status);
    }

    public function test_empty_and_singleton_insert_bounds(): void
    {
        if (Program::exists()) {
            $this->markTestSkipped('Empty-list case requires existing test DB with no programs; no fixtures deleted.');
        }
        $this->postJson('/api/admin/programs', $this->payload(1))->assertUnprocessable();
        $id = $this->postJson('/api/admin/programs', $this->payload(0))->assertCreated()->json('data.id');
        $this->assertOrder([$id]);
        $this->patchJson('/api/admin/programs/'.$id, ['sort_order' => 0])->assertOk();
        $this->patchJson('/api/admin/programs/'.$id, ['sort_order' => 1])->assertUnprocessable();
        $second = $this->postJson('/api/admin/programs', [...$this->payload(1), 'name' => 'Second Program', 'slug' => 'second-program'])->assertCreated()->json('data.id');
        $this->assertOrder([$id, $second]);
    }
}
