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
        $originalHash = $user->password;
        $this->getJson('/api/auth/reset-grant')->assertJson(['valid' => false]);
        $this->postJson('/api/auth/reset-password', ['password' => 'NewPassword123!', 'password_confirmation' => 'NewPassword123!'])->assertUnprocessable();
        $this->assertSame($originalHash, $user->fresh()->password);
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
        $this->postJson('/api/auth/reset-password', ['password' => 'AnotherPassword123!', 'password_confirmation' => 'AnotherPassword123!'])->assertUnprocessable();
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
        $this->travel(29)->seconds();
        $this->send();
        $this->assertCount(1, Mail::getSymfonyTransport()->messages());
        $this->travel(1)->seconds();
        $next = $this->send();
        $this->verify($code)->assertUnprocessable();
        $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.20']);
        $this->verify($next)->assertOk();
        $this->travel(11)->minutes();
        $this->getJson('/api/auth/reset-grant')->assertJson(['valid' => false]);
        $this->postJson('/api/auth/reset-password', ['password' => 'NewPassword123!', 'password_confirmation' => 'NewPassword123!'])->assertUnprocessable();
        $expired = $this->send();
        $this->travel(10)->minutes();
        $this->verify($expired)->assertUnprocessable();
    }

    public function test_resend_revokes_existing_session_grant(): void
    {
        $user = User::where('email_normalized', $this->email)->firstOrFail();
        $hash = $user->password;
        $this->verify($this->send())->assertOk();
        $this->travel(61)->seconds();
        $this->send();
        $this->getJson('/api/auth/reset-grant')->assertJson(['valid' => false]);
        $this->postJson('/api/auth/reset-password', ['password' => 'NewPassword123!', 'password_confirmation' => 'NewPassword123!'])->assertUnprocessable();
        $this->assertSame($hash, $user->fresh()->password);
    }

    public function test_daily_wib_limit_and_public_response_across_devices(): void
    {
        $this->travelTo(now('Asia/Jakarta')->setTime(23, 50));
        $registered = [];
        for ($i = 1; $i <= 6; $i++) {
            // New IP and session cannot reset an email's quota.
            $this->flushSession();
            $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.'.$i]);
            $registered[$i] = $this->postJson('/api/auth/forgot-password', ['email' => 'RECOVERY-OTP@example.com'])->assertOk()->json();
            $this->assertSame($i <= 5, $registered[$i]['accepted']);
            $this->assertSame($i >= 5, $registered[$i]['daily_limit_reached']);
            $this->assertSame($i <= 5 ? 'accepted' : 'daily_limit_reached', $registered[$i]['status']);
            $this->assertCount(min($i, 5), Mail::getSymfonyTransport()->messages());
            if ($i === 5) {
                $messages = Mail::getSymfonyTransport()->messages();
                preg_match('/\b[0-9]{6}\b/', $messages->last()->getOriginalMessage()->getTextBody(), $match);
                $lastCode = $match[0];
            }
            $this->travel(31)->seconds();
        }
        $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.50']);
        $this->verify($lastCode)->assertOk();
        for ($i = 1; $i <= 6; $i++) {
            $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.'.(60 + $i)]);
            $this->postJson('/api/auth/forgot-password', ['email' => 'missing@example.com'])->assertOk()->assertExactJson($registered[$i]);
            $this->travel(31)->seconds();
        }
        $this->assertCount(5, Mail::getSymfonyTransport()->messages());
        $this->travelTo(now('Asia/Jakarta')->addDay()->startOfDay());
        $this->postJson('/api/auth/forgot-password', ['email' => $this->email])->assertOk()
            ->assertJson(['status' => 'accepted', 'accepted' => true, 'daily_limit_reached' => false]);
        $this->assertCount(6, Mail::getSymfonyTransport()->messages());
    }

    public function test_cooldown_is_not_daily_limit_and_inactive_account_has_same_quota(): void
    {
        $first = $this->postJson('/api/auth/forgot-password', ['email' => $this->email])->assertOk()->json();
        $this->travel(29)->seconds();
        $this->postJson('/api/auth/forgot-password', ['email' => $this->email])->assertOk()
            ->assertJson(['status' => 'cooldown', 'accepted' => false, 'daily_limit_reached' => false, 'retry_after' => 1]);
        $this->travel(1)->seconds();
        $this->postJson('/api/auth/forgot-password', ['email' => $this->email])->assertOk()->assertExactJson($first);
        $this->assertCount(2, Mail::getSymfonyTransport()->messages());
        User::where('email_normalized', $this->email)->update(['account_status' => 'inactive']);
        for ($i = 3; $i <= 6; $i++) {
            $this->travel(31)->seconds();
            $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.'.(80 + $i)]);
            $this->postJson('/api/auth/forgot-password', ['email' => $this->email])->assertOk()
                ->assertJson(['accepted' => $i <= 5, 'daily_limit_reached' => $i >= 5]);
        }
        $this->assertCount(2, Mail::getSymfonyTransport()->messages());
    }

    public function test_ip_cap_is_shared_across_accounts(): void
    {
        $service = app(RecoveryOtpService::class);
        for ($i = 0; $i < 10; $i++) {
            $service->send("missing{$i}@example.com", '192.0.2.250');
        }
        $result = $service->send($this->email, '192.0.2.250');
        $this->assertSame(['status' => 'ip_limited', 'accepted' => false, 'daily_limit_reached' => false, 'retry_after' => 60], $result);
        $this->assertCount(0, Mail::getSymfonyTransport()->messages());
    }
}
