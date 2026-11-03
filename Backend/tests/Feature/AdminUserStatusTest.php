<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class AdminUserStatusTest extends TestCase
{
    use DatabaseTransactions;

    private function account(string $role, int $number): User
    {
        $user = new User(['name' => 'Status Test', 'email' => "status{$number}@example.com", 'whatsapp' => '08123456780'.$number, 'password' => 'Password123!']);
        $user->role = $role;
        $user->account_status = 'active';
        $user->save();

        return $user;
    }

    public function test_admin_can_disable_and_reenable_student_without_deleting_account(): void
    {
        $admin = $this->account('admin', 1);
        $student = $this->account('student', 2);
        $url = "/api/admin/users/{$student->id}/status";
        $this->actingAs($admin)->patchJson($url, ['account_status' => 'inactive'])->assertOk()->assertJsonPath('data.account_status', 'inactive');
        $this->assertDatabaseHas('users', ['id' => $student->id, 'account_status' => 'inactive']);
        $this->actingAs($student->fresh())->getJson('/api/me')->assertUnauthorized();
        $this->actingAs($admin)->patchJson($url, ['account_status' => 'active'])->assertOk()->assertJsonPath('data.account_status', 'active');
        $this->actingAs($student->fresh())->getJson('/api/me')->assertOk();
    }

    public function test_status_endpoint_rejects_students_admin_targets_and_invalid_status(): void
    {
        $admin = $this->account('admin', 3);
        $student = $this->account('student', 4);
        $url = "/api/admin/users/{$student->id}/status";
        $this->patchJson($url, ['account_status' => 'inactive'])->assertUnauthorized();
        $this->actingAs($student)->patchJson($url, ['account_status' => 'inactive'])->assertForbidden();
        $this->actingAs($admin)->patchJson("/api/admin/users/{$admin->id}/status", ['account_status' => 'inactive'])->assertNotFound();
        $this->patchJson($url, ['account_status' => 'deleted'])->assertUnprocessable();
        $this->assertDatabaseHas('users', ['id' => $student->id, 'account_status' => 'active']);
    }
}
