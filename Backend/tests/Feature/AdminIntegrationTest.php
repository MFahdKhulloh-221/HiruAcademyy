<?php

namespace Tests\Feature;

use App\Models\Program;
use App\Models\ProgramOffer;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class AdminIntegrationTest extends TestCase
{
    use DatabaseTransactions;

    public function test_user_listing_is_admin_only_and_never_exposes_credentials(): void
    {
        $student = User::create(['name' => 'Integration Student', 'email' => 'integration.student@example.test', 'whatsapp' => '6281999111001', 'password' => 'Password123!']);
        $this->getJson('/api/admin/users')->assertUnauthorized();
        $this->actingAs($student)->getJson('/api/admin/users')->assertForbidden();
        $admin = User::create(['name' => 'Integration Admin', 'email' => 'integration.admin@example.test', 'whatsapp' => '6281999111002', 'password' => 'Password123!']);
        $admin->forceFill(['role' => 'admin'])->save();
        $this->actingAs($admin)->getJson('/api/admin/users?search=integration.student')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $student->id)->assertJsonMissingPath('data.0.password')->assertJsonMissingPath('data.0.remember_token');
    }

    public function test_settings_are_admin_only_validated_and_persist_without_profile_mutation(): void
    {
        $user = User::create(['name' => 'Settings Admin', 'email' => 'integration.settings@example.test', 'whatsapp' => '6281999111005', 'password' => 'Password123!']);
        $this->actingAs($user)->getJson('/api/admin/settings')->assertForbidden();
        $user->forceFill(['role' => 'admin'])->save();
        $this->actingAs($user)->patchJson('/api/admin/settings', ['section' => 'adminProfile', 'value' => ['displayName' => 'Changed']])->assertUnprocessable();
        $this->actingAs($user)->patchJson('/api/admin/settings', ['section' => 'branding', 'value' => ['logoUrl' => 'javascript:alert(1)', 'companyLabel' => 'HIRU']])->assertUnprocessable();
        $payload = ['section' => 'general', 'value' => ['siteName' => 'HIRU Test', 'locale' => 'id-ID', 'timezone' => 'Asia/Jakarta']];
        $this->actingAs($user)->patchJson('/api/admin/settings', $payload)->assertOk()->assertJsonPath('data.general.siteName', 'HIRU Test');
        $this->actingAs($user)->getJson('/api/admin/settings')->assertOk()->assertJsonPath('data.general.timezone', 'Asia/Jakarta');
        $this->assertSame('Settings Admin', $user->fresh()->name);
    }

    public function test_admin_invoice_uses_selected_active_student_and_server_price(): void
    {
        $student = User::create(['name' => 'Invoice Student', 'email' => 'integration.invoice@example.test', 'whatsapp' => '6281999111003', 'password' => 'Password123!']);
        $admin = User::create(['name' => 'Invoice Admin', 'email' => 'integration.invoice.admin@example.test', 'whatsapp' => '6281999111004', 'password' => 'Password123!']);
        $admin->forceFill(['role' => 'admin'])->save();
        $program = Program::create(['code' => 'integration-test', 'slug' => 'integration-test', 'name' => 'Test', 'family' => 'foundation', 'status' => 'active', 'sort_order' => 99]);
        $offer = ProgramOffer::create(['program_id' => $program->id, 'plan_code' => 'lms', 'base_price' => 10000, 'currency' => 'IDR', 'duration_months' => 6, 'status' => 'active']);
        $payload = ['user_id' => $student->id, 'program_offer_id' => $offer->id];
        $this->actingAs($student)->postJson('/api/admin/invoices', $payload)->assertForbidden();
        $this->actingAs($admin)->postJson('/api/admin/invoices', $payload + ['total_price' => 1])->assertUnprocessable();
        $this->actingAs($admin)->postJson('/api/admin/invoices', ['user_id' => $admin->id, 'program_offer_id' => $offer->id])->assertUnprocessable();
        $this->actingAs($admin)->postJson('/api/admin/invoices', $payload)->assertCreated()->assertJsonPath('data.user_id', $student->id)->assertJsonPath('data.total_price', 10000)->assertJsonPath('data.status', 'draft');
    }
}
