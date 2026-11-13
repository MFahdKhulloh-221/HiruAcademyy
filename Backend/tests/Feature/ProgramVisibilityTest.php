<?php

namespace Tests\Feature;

use App\Models\Program;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class ProgramVisibilityTest extends TestCase
{
    use DatabaseTransactions;

    public function test_admin_can_hide_and_restore_catalog_program_without_changing_journey(): void
    {
        $program = Program::create([
            'code' => 'visibility-test', 'slug' => 'visibility-test', 'name' => 'Visibility test',
            'family' => 'interview', 'status' => 'active', 'sort_order' => 0,
        ])->refresh();
        $this->assertTrue($program->show_on_programs);
        $admin = $this->user('visibility-admin@example.test', 'admin');
        $student = $this->user('visibility-student@example.test', 'student');
        $endpoint = '/api/admin/programs/'.$program->id;

        $this->actingAs($student, 'sanctum')->patchJson($endpoint, ['show_on_programs' => false])->assertForbidden();
        $this->actingAs($admin, 'sanctum')->patchJson($endpoint, ['show_on_programs' => 'invalid'])
            ->assertUnprocessable()->assertJsonValidationErrors('show_on_programs');

        foreach ([false, true] as $visible) {
            $this->actingAs($admin, 'sanctum')->patchJson($endpoint, ['show_on_programs' => $visible])
                ->assertOk()->assertJsonPath('data.show_on_programs', $visible)
                ->assertJsonPath('data.status', 'active');
            $ids = array_column($this->getJson('/api/public/programs?catalog=programs')->assertOk()->json('data'), 'id');
            $this->assertSame($visible, in_array($program->id, $ids, true));
            $this->assertContains($program->id, array_column($this->getJson('/api/public/programs')->assertOk()->json('data'), 'id'));
            $this->actingAs($student, 'sanctum');
            $this->assertContains($program->id, array_column($this->getJson('/api/student/dashboard')->assertOk()->json('data.programs'), 'id'));
        }
    }

    public function test_admin_can_create_hidden_draft_program(): void
    {
        $this->actingAs($this->user('visibility-create@example.test', 'admin'))
            ->postJson('/api/admin/programs', [
                'name' => 'Hidden draft', 'slug' => 'hidden-draft', 'sort_order' => Program::count(),
                'plan_code' => 'lms', 'duration_months' => 1, 'base_price' => 0,
                'show_on_programs' => false,
            ])->assertCreated()->assertJsonPath('data.show_on_programs', false)->assertJsonPath('data.status', 'draft');
    }

    private function user(string $email, string $role): User
    {
        $user = User::create([
            'name' => 'Visibility test', 'email' => $email,
            'whatsapp' => $role === 'admin' ? '081234567891' : '081234567892', 'password' => 'Password123!',
        ]);
        $user->role = $role;
        $user->save();

        return $user;
    }
}
