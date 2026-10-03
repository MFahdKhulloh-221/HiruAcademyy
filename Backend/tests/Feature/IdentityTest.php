<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class IdentityTest extends TestCase
{
    use DatabaseTransactions;

    private function payload(array $overrides = []): array
    {
        return array_replace([
            'name' => 'Student Test',
            'email' => 'Student@Example.com',
            'whatsapp' => '081234567890',
            'password' => 'Password123!',
            'password_confirmation' => 'Password123!',
            'target_jlpt' => 'N4',
            'country' => 'Indonesia',
        ], $overrides);
    }

    private function createUser(array $overrides = []): User
    {
        return User::create($this->payload($overrides))->refresh();
    }

    // 1. Student can register
    // 2. Role is always student
    // 3. Password stored hashed
    // 7. Client cannot register as admin
    // 8. Invalid password confirmation rejected
    public function test_registration_and_validation(): void
    {
        // Invalid password confirmation
        $this->postJson('/api/auth/register', $this->payload([
            'password_confirmation' => 'Mismatch123!',
        ]))->assertUnprocessable();

        // 7. Client cannot register as admin
        $this->postJson('/api/auth/register', $this->payload([
            'role' => 'admin',
        ]))->assertUnprocessable();

        // Normal student registration
        $response = $this->postJson('/api/auth/register', $this->payload());

        $response->assertCreated()
            ->assertJsonPath('data.name', 'Student Test')
            ->assertJsonPath('data.email', 'Student@Example.com')
            ->assertJsonPath('data.whatsapp', '081234567890')
            ->assertJsonPath('data.role', 'student')
            ->assertJsonPath('data.account_status', 'active')
            ->assertJsonPath('data.target_jlpt', 'N4')
            ->assertJsonMissingPath('data.password')
            ->assertJsonMissingPath('data.email_normalized')
            ->assertJsonMissingPath('data.whatsapp_normalized');

        $user = User::where('email_normalized', 'student@example.com')->firstOrFail();
        $this->assertSame('student', $user->role);
        $this->assertSame('active', $user->account_status);
        $this->assertTrue(Hash::check('Password123!', $user->password));
    }

    // 4. Duplicate normalized email rejected
    // 5. Duplicate normalized WhatsApp rejected
    // 6. 0812... and +62812... collide after normalization
    public function test_duplicate_normalized_identities_rejected(): void
    {
        $this->createUser();

        // Duplicate email with different case and spaces
        $this->postJson('/api/auth/register', $this->payload([
            'email' => '  STUDENT@example.COM  ',
            'whatsapp' => '089876543210',
        ]))->assertUnprocessable();

        // Duplicate whatsapp: 081234567890 vs +6281234567890 collision
        $this->postJson('/api/auth/register', $this->payload([
            'email' => 'different@example.com',
            'whatsapp' => '+6281234567890',
        ]))->assertUnprocessable();

        // Duplicate whatsapp: 081234567890 vs 6281234567890 collision
        $this->postJson('/api/auth/register', $this->payload([
            'email' => 'different2@example.com',
            'whatsapp' => '6281234567890',
        ]))->assertUnprocessable();
    }

    // 9. Login with email succeeds
    // 10. Login with WhatsApp succeeds
    // 11. Equivalent normalized WhatsApp succeeds
    // 12. Wrong password returns generic failure
    // 13. Unknown account returns same generic failure
    // 14. Inactive account cannot authenticate
    // 15. Successful login regenerates/authenticates session
    public function test_login_flows_and_generic_errors(): void
    {
        $user = $this->createUser();

        // 9. Login with email
        $resEmail = $this->postJson('/api/auth/login', [
            'identity' => 'Student@Example.com',
            'password' => 'Password123!',
        ]);
        $resEmail->assertOk()
            ->assertJsonPath('data.id', $user->id)
            ->assertJsonPath('data.role', 'student');

        $this->postJson('/api/auth/logout')->assertNoContent();

        // 10. Login with original WhatsApp
        $resWa1 = $this->postJson('/api/auth/login', [
            'identity' => '081234567890',
            'password' => 'Password123!',
        ]);
        $resWa1->assertOk()->assertJsonPath('data.id', $user->id);

        $this->postJson('/api/auth/logout')->assertNoContent();

        // 11. Login with normalized equivalent +62 812-3456-7890
        $resWa2 = $this->postJson('/api/auth/login', [
            'identity' => '+62 812-3456-7890',
            'password' => 'Password123!',
        ]);
        $resWa2->assertOk()->assertJsonPath('data.id', $user->id);

        $this->postJson('/api/auth/logout')->assertNoContent();

        // 12. Wrong password
        $resWrong = $this->postJson('/api/auth/login', [
            'identity' => 'student@example.com',
            'password' => 'WrongPassword!',
        ]);
        $resWrong->assertStatus(422)
            ->assertJsonPath('message', 'Email/WhatsApp atau kata sandi tidak sesuai.');

        // 13. Unknown account returns exact same generic error
        $resUnknown = $this->postJson('/api/auth/login', [
            'identity' => 'unknown@example.com',
            'password' => 'Password123!',
        ]);
        $resUnknown->assertStatus(422)
            ->assertJsonPath('message', 'Email/WhatsApp atau kata sandi tidak sesuai.');

        $this->assertSame($resWrong->json('message'), $resUnknown->json('message'));

        // 14. Inactive account cannot authenticate, returns exact same generic error
        $user->account_status = 'inactive';
        $user->save();

        $resInactive = $this->postJson('/api/auth/login', [
            'identity' => 'student@example.com',
            'password' => 'Password123!',
        ]);
        $resInactive->assertStatus(422)
            ->assertJsonPath('message', 'Email/WhatsApp atau kata sandi tidak sesuai.');

        $this->assertSame($resWrong->json('message'), $resInactive->json('message'));
    }

    // 16. Guest /api/me returns 401
    // 17. Authenticated /api/me returns safe fields
    // 18. Sensitive fields absent
    // 19. Authenticated logout works
    // 20. Session is no longer authenticated afterward
    public function test_me_endpoint_and_logout(): void
    {
        // Guest
        $this->getJson('/api/me')->assertStatus(401)
            ->assertJsonPath('message', 'Silakan masuk untuk melanjutkan.');

        $user = $this->createUser();

        // Login to establish session
        $this->postJson('/api/auth/login', [
            'identity' => $user->email,
            'password' => 'Password123!',
        ])->assertOk();

        // Authenticated /api/me
        $meRes = $this->getJson('/api/me');
        $meRes->assertOk()
            ->assertJsonPath('data.id', $user->id)
            ->assertJsonPath('data.name', $user->name)
            ->assertJsonPath('data.email', $user->email)
            ->assertJsonPath('data.whatsapp', $user->whatsapp)
            ->assertJsonPath('data.role', 'student')
            ->assertJsonPath('data.country', 'Indonesia')
            ->assertJsonPath('data.target_jlpt', 'N4')
            ->assertJsonPath('data.account_status', 'active')
            ->assertJsonMissingPath('data.password')
            ->assertJsonMissingPath('data.email_normalized')
            ->assertJsonMissingPath('data.whatsapp_normalized')
            ->assertJsonMissingPath('data.remember_token');

        // Prohibited fields in PATCH /api/me (role escalation, status tampering) are rejected
        $this->patchJson('/api/me', [
            'role' => 'admin',
            'account_status' => 'inactive',
        ])->assertUnprocessable();

        // Valid PATCH /api/me
        $this->patchJson('/api/me', [
            'name' => 'Updated Name',
            'target_jlpt' => 'N3',
            'country' => 'Japan',
        ])->assertOk()
            ->assertJsonPath('data.name', 'Updated Name')
            ->assertJsonPath('data.target_jlpt', 'N3')
            ->assertJsonPath('data.country', 'Japan')
            ->assertJsonPath('data.role', 'student')
            ->assertJsonPath('data.account_status', 'active');

        $this->assertSame('student', $user->fresh()->role);
        $this->assertSame('active', $user->fresh()->account_status);
        $this->assertSame('Updated Name', $user->fresh()->name);

        // 19. Logout
        $resLogout = $this->postJson('/api/auth/logout');
        $resLogout->assertNoContent();

        // 20. Session is no longer authenticated
        $resAfterLogout = $this->getJson('/api/me');
        $resAfterLogout->assertStatus(401);
    }

    // 21. Student rejected by admin-only authorization
    // 22. Admin accepted by admin-only authorization
    public function test_authorization_role_and_active_gates(): void
    {
        Route::middleware(['web', 'auth:sanctum', 'active', 'role:admin'])->get('/api/test-admin', fn () => response()->json(['ok' => true]));
        Route::middleware(['web', 'auth:sanctum', 'active', 'role:student'])->get('/api/test-student', fn () => response()->json(['ok' => true]));

        $student = $this->createUser(['role' => 'student']);

        // Student tries to access admin route
        $this->actingAs($student)->getJson('/api/test-admin')->assertStatus(403)
            ->assertJsonPath('message', 'Akun kamu belum memiliki akses ke fitur ini.');

        // Student accesses student route
        $this->actingAs($student)->getJson('/api/test-student')->assertOk();

        // Switch to admin
        $admin = $this->createUser([
            'email' => 'admin@hiru.test',
            'whatsapp' => '081234567899',
        ]);
        $admin->role = 'admin';
        $admin->save();

        $this->actingAs($admin)->getJson('/api/test-admin')->assertOk();
        $this->actingAs($admin)->getJson('/api/test-student')->assertStatus(403);

        // Inactive admin cannot access
        $admin->account_status = 'inactive';
        $admin->save();
        $this->actingAs($admin)->getJson('/api/test-admin')->assertStatus(401);
    }

    // 23. Forgot-password response does not enumerate users
    // 24. Valid reset changes password
    // 25. Used/invalid token cannot be reused where testable safely
    public function test_password_recovery_and_reset(): void
    {
        Notification::fake();
        $user = $this->createUser();

        // Known email
        $resKnown = $this->postJson('/api/auth/forgot-password', ['email' => $user->email]);
        $resKnown->assertOk()->assertJsonPath('message', 'Jika akun tersedia, tautan reset kata sandi akan dikirim.');

        // Unknown email returns identical generic message
        $resUnknown = $this->postJson('/api/auth/forgot-password', ['email' => 'notfound@example.com']);
        $resUnknown->assertOk()->assertJsonPath('message', 'Jika akun tersedia, tautan reset kata sandi akan dikirim.');

        $token = null;
        Notification::assertSentTo($user, ResetPassword::class, function ($notification) use (&$token) {
            $token = $notification->token;

            return true;
        });

        $this->assertNotNull($token);

        // Valid reset
        $resetRes = $this->postJson('/api/auth/reset-password', [
            'email' => $user->email,
            'token' => $token,
            'password' => 'BrandNewPassword123!',
            'password_confirmation' => 'BrandNewPassword123!',
        ]);
        $resetRes->assertOk()->assertJsonPath('message', 'Kata sandi berhasil direset.');

        // Verify password changed
        $this->assertTrue(Hash::check('BrandNewPassword123!', $user->fresh()->password));

        // Reusing token fails
        $reuseRes = $this->postJson('/api/auth/reset-password', [
            'email' => $user->email,
            'token' => $token,
            'password' => 'AnotherPassword123!',
            'password_confirmation' => 'AnotherPassword123!',
        ]);
        $reuseRes->assertStatus(422);
    }

    public function test_admin_creation_artisan_command(): void
    {
        $this->artisan('hiru:admin:create')
            ->expectsQuestion('Nama', 'Super Admin')
            ->expectsQuestion('Email', 'superadmin@hiru.test')
            ->expectsQuestion('WhatsApp', '081299999999')
            ->expectsQuestion('Kata sandi', 'AdminSecret123!')
            ->expectsQuestion('Ulangi kata sandi', 'AdminSecret123!')
            ->assertSuccessful();

        $admin = User::where('email_normalized', 'superadmin@hiru.test')->firstOrFail();
        $this->assertSame('admin', $admin->role);
        $this->assertSame('active', $admin->account_status);
        $this->assertSame('6281299999999', $admin->whatsapp_normalized);
        $this->assertTrue(Hash::check('AdminSecret123!', $admin->password));
    }
}
