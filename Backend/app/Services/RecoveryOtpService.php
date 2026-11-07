<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class RecoveryOtpService
{
    public const MESSAGE = 'Jika akun tersedia, kode OTP dikirim melalui email. Tunggu 60 detik sebelum meminta ulang.';

    private function key(string $value): string
    {
        return hash_hmac('sha256', $value, config('app.key'));
    }

    // Existing broker table holds compact recovery state, not plaintext codes.
    private function locked(string $key, callable $action): mixed
    {
        return DB::transaction(function () use ($key, $action) {
            $table = DB::table(config('auth.passwords.users.table'));
            $table->insertOrIgnore(['email' => $key, 'token' => '{}', 'created_at' => now()]);
            $row = (clone $table)->where('email', $key)->lockForUpdate()->first();
            $state = json_decode($row->token, true, flags: JSON_THROW_ON_ERROR);
            $result = $action($state);
            (clone $table)->where('email', $key)->update(['token' => json_encode($state, JSON_THROW_ON_ERROR), 'created_at' => now()]);

            return $result;
        }, 3);
    }

    private function ipAllowed(string $ip): bool
    {
        return $this->locked('otp-ip:'.$this->key($ip), function (&$state) {
            $minute = intdiv(now()->timestamp, 60);
            $state = ($state['m'] ?? null) === $minute ? $state : ['m' => $minute, 'n' => 0];

            return ++$state['n'] <= 10;
        });
    }

    public function send(string $email, string $ip): void
    {
        if (! $this->ipAllowed($ip)) {
            return;
        }
        $code = (string) random_int(100000, 999999);
        $accepted = $this->locked('otp:'.$this->key($email), function (&$state) use ($email, $code) {
            $day = now('Asia/Jakarta')->format('Y-m-d');
            if (($state['d'] ?? '') !== $day) {
                $state['d'] = $day;
                $state['n'] = 0;
            }
            if (($state['n'] ?? 0) >= 5 || now()->timestamp - ($state['s'] ?? 0) < 60) {
                return false;
            }
            $state = ['d' => $day, 'n' => ($state['n'] ?? 0) + 1, 's' => now()->timestamp,
                'h' => $this->key($email.':'.$code), 'e' => now()->addMinutes(10)->timestamp, 'a' => 0];

            return true;
        });
        $user = User::where('email_normalized', $email)->where('account_status', 'active')->first();
        if ($accepted && $user) {
            try {
                Mail::raw("Kode pemulihan HiruAcademy: {$code}\nBerlaku 10 menit. Jangan bagikan kode ini.", fn ($mail) => $mail->to($user->email)->subject('Kode OTP pemulihan akun'));
            } catch (\Throwable) {
                // Do not expose transport errors or account existence, nor log OTP/secrets.
                logger()->error('Recovery OTP mail delivery failed.');
            }
        }
    }

    public function verify(string $email, string $code, string $ip): ?string
    {
        if (! $this->ipAllowed($ip)) {
            return null;
        }

        return $this->locked('otp:'.$this->key($email), function (&$state) use ($email, $code) {
            if (! isset($state['h']) || ($state['e'] ?? 0) <= now()->timestamp || ($state['a'] ?? 0) >= 5) {
                return null;
            }
            $state['a']++;
            if (! hash_equals($state['h'], $this->key($email.':'.$code))
                || ! User::where('email_normalized', $email)->where('account_status', 'active')->exists()) {
                return null;
            }
            unset($state['h']);
            $grant = Str::random(64);
            $state['g'] = hash('sha256', $grant);
            $state['e'] = now()->addMinutes(10)->timestamp;

            return $grant;
        });
    }

    public function grant(array $grant, ?string $password = null): bool
    {
        if (! isset($grant['email'], $grant['token'])) {
            return false;
        }

        return $this->locked('otp:'.$this->key($grant['email']), function (&$state) use ($grant, $password) {
            if (($state['e'] ?? 0) <= now()->timestamp || ! isset($state['g'])
                || ! hash_equals($state['g'], hash('sha256', $grant['token']))) {
                return false;
            }
            $user = User::where('email_normalized', $grant['email'])->where('account_status', 'active')->lockForUpdate()->first();
            if (! $user) {
                return false;
            }
            if ($password !== null) {
                // Fail closed: revocation requires existing shared database sessions.
                if (config('session.driver') !== 'database' || config('session.connection') && config('session.connection') !== config('database.default')) {
                    throw new \RuntimeException('Recovery requires database sessions on the user database.');
                }
                if (Hash::check($password, $user->password)) {
                    throw ValidationException::withMessages(['password' => 'Gunakan kata sandi berbeda dari kata sandi lama.']);
                }
                $user->password = $password;
                $user->setRememberToken(Str::random(60));
                $user->save();
                DB::table(config('session.table'))->where('user_id', $user->id)->delete();
                unset($state['g']);
                event(new PasswordReset($user));
            }

            return true;
        });
    }
}
