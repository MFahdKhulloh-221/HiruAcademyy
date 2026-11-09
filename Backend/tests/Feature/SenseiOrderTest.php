<?php

namespace Tests\Feature;

use App\Models\SenseiProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class SenseiOrderTest extends TestCase
{
    use DatabaseTransactions;

    public function test_move_append_normalize_status_delete_and_public_bio(): void
    {
        $admin = User::create(['name' => 'Admin Sensei', 'email' => 'sensei-order@example.test', 'whatsapp' => '081993339999', 'password' => 'Password123!']);
        $admin->role = 'admin';
        $admin->save();
        $this->actingAs($admin);
        $base = ['name' => 'Sensei A', 'role' => 'Pengajar', 'bio' => 'Bio lengkap tetap tersimpan.', 'expertise' => ['Kaiwa'], 'active' => true];
        $ids = [];
        foreach (['A', 'B', 'C'] as $name) {
            $ids[] = $this->postJson('/api/admin/sensei-profiles', [...$base, 'name' => 'Sensei '.$name])->assertCreated()->json('data.id');
            $this->assertSame(end($ids), SenseiProfile::orderByDesc('sort_order')->first()->id);
        }
        // Fixtures use existing rows too; verify relative positions using server-assigned order.
        $this->patchJson('/api/admin/sensei-profiles/'.$ids[2], ['sort_order' => 1])->assertOk();
        $rows = SenseiProfile::orderBy('sort_order')->orderBy('id')->get();
        $this->assertSame($ids[2], $rows->first()->id);
        $this->assertSame(range(1, $rows->count()), $rows->pluck('sort_order')->all());
        $this->assertLessThan($rows->search(fn ($row) => $row->id === $ids[1]), $rows->search(fn ($row) => $row->id === $ids[0]));
        $this->getJson('/api/admin/sensei-profiles')->assertOk()->assertJsonPath('data.0.id', $ids[2]);
        $this->getJson('/api/sensei-profiles')->assertOk()->assertJsonPath('data.0.bio', $base['bio']);
        SenseiProfile::whereIn('id', $ids)->update(['sort_order' => 1]);
        $this->patchJson('/api/admin/sensei-profiles/'.$ids[1], ['sort_order' => 1, 'active' => false])->assertOk();
        $this->assertSame($ids[1], SenseiProfile::orderBy('sort_order')->first()->id);
        $this->deleteJson('/api/admin/sensei-profiles/'.$ids[1])->assertNoContent();
        $rows = SenseiProfile::orderBy('sort_order')->get();
        $this->assertSame(range(1, $rows->count()), $rows->pluck('sort_order')->all());
        $this->patchJson('/api/admin/sensei-profiles/'.$ids[0], ['sort_order' => 0])->assertUnprocessable();
        $this->patchJson('/api/admin/sensei-profiles/'.$ids[0], ['sort_order' => 2147483647])->assertUnprocessable();
    }
}
