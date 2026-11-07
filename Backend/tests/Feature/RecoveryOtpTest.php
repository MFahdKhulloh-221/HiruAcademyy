<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\RecoveryOtpService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class RecoveryOtpTest extends TestCase
{
    use DatabaseTransactions;

    private string $email = 'recovery-otp@example.com';

    protected function setUp(): void
    {
        parent::setUp();
        config(['session.driver' => 'database', 'mail.default' => 'array']);
        User::create(['name' => 'Recovery', 'email' => $this->email, 'whatsapp' => '081992221001', 'password' => 'OldPassword123!']);
    }

    private function send(): string
    {
        $this->postJson('/api/auth/forgot-password', ['email' => $this->email])->assertOk();
        $messages = Mail::getSymfonyTransport()->messages();
        preg_match('/\b[0-9]{6}\b/', $messages->last()->getOriginalMessage()->getTextBody(), $match);

        return $match[0];
    }

    private function verify(string $code)
    {
        return $this->postJson('/api/auth/verify-recovery-otp', ['email' => $this->email, 'otp' => $code]);
    }

    public function test_valid_once_grant_reset_and_old_sessions(): void
    {
        $user = User::where('email_normalized', $this->email)->firstOrFail();
        DB::table('sessions')->insert(['id' => 'old-recovery-session', 'user_id' => $user->id, 'payload' => '', 'last_activity' => time()]);
        $this->getJson('/api/auth/reset-grant')->assertJson(['valid' => false]);
        $this->postJson('/api/auth/reset-password', ['password' => 'NewPassword123!', 'password_confirmation' => 'NewPassword123!'])->assertUnprocessable();
        $code = $this->send();
        $this->verify($code)->assertOk();
        $this->verify($code)->assertUnprocessable();
        $this->travel(61)->seconds();
        $this->getJson('/api/auth/reset-grant')->assertJson(['valid' => true]);
        $this->postJson('/api/auth/reset-password', ['password' => 'OldPassword123!', 'password_confirmation' => 'OldPassword123!'])->assertUnprocessable();
        $this->postJson('/api/auth/reset-password', ['password' => 'NewPassword123!', 'password_confirmation' => 'NewPassword123!'])->assertOk();
        $this->assertDatabaseMissing('sessions', ['id' => 'old-recovery-session']);
        $this->assertTrue(Hash::check('NewPassword123!', $user->fresh()->password));
        $this->assertFalse(Hash::check('OldPassword123!', $user->fresh()->password));
        $this->getJson('/api/auth/reset-grant')->assertJson(['valid' => false]);
        $this->postJson('/api/auth/login', ['identity' => $this->email, 'password' => 'OldPassword123!'])->assertUnprocessable();
        $this->postJson('/api/auth/login', ['identity' => $this->email, 'password' => 'NewPassword123!'])->assertOk();
    }

    public function test_wrong_attempts_expiry_replacement_and_cooldown(): void
    {
        $code = $this->send();
        $this->send();
        $this->assertCount(1, Mail::getSymfonyTransport()->messages());
        for ($i = 0; $i < 5; $i++) {
            // Separate IPs isolate per-OTP attempt cap from IP middleware.
            $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.'.($i + 1)]);
            $this->verify('000000')->assertUnprocessable();
        }
        $this->verify($code)->assertUnprocessable();
        $this->travel(61)->seconds();
        $next = $this->send();
        $this->verify($next)->assertOk();
        $this->travel(11)->minutes();
        $this->getJson('/api/auth/reset-grant')->assertJson(['valid' => false]);
        $expired = $this->send();
        $this->travel(10)->minutes();
        $this->verify($expired)->assertUnprocessable();
    }

    public function test_daily_wib_limit_and_public_response(): void
    {
        $this->travelTo(now('Asia/Jakarta')->setTime(23, 50));
        $expected = $this->postJson('/api/auth/forgot-password', ['email' => $this->email])->assertOk()->json();
        for ($i = 0; $i < 6; $i++) {
            $this->travel(61)->seconds();
            $this->postJson('/api/auth/forgot-password', ['email' => $this->email])->assertOk()->assertExactJson($expected);
        }
        $this->assertCount(5, Mail::getSymfonyTransport()->messages());
        $this->postJson('/api/auth/forgot-password', ['email' => 'missing@example.com'])->assertOk()->assertExactJson($expected);
        User::where('email_normalized', $this->email)->update(['account_status' => 'inactive']);
        $this->travelTo(now('Asia/Jakarta')->addDay()->startOfDay());
        $this->postJson('/api/auth/forgot-password', ['email' => $this->email])->assertOk()->assertExactJson($expected);
        $this->assertCount(5, Mail::getSymfonyTransport()->messages());
        User::where('email_normalized', $this->email)->update(['account_status' => 'active']);
        $this->travel(61)->seconds();
        $this->send();
        $this->assertCount(6, Mail::getSymfonyTransport()->messages());
    }

    public function test_ip_cap_is_shared_across_accounts(): void
    {
        $service = app(RecoveryOtpService::class);
        for ($i = 0; $i < 10; $i++) {
            $service->send("missing{$i}@example.com", '192.0.2.250');
        }
        $service->send($this->email, '192.0.2.250');
        $this->assertCount(0, Mail::getSymfonyTransport()->messages());
    }
}
