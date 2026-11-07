<?php

namespace App\Http\Controllers;

use App\Http\Requests\ProfileRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\AffiliateService;
use App\Services\NotificationService;
use App\Services\RecoveryOtpService;
use App\Support\Identity;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function register(ProfileRequest $request)
    {
        $user = new User($request->safe()->only(['name', 'email', 'whatsapp', 'password', 'country', 'target_jlpt']));
        $user->role = 'student';
        $user->account_status = 'active';
        try {
            DB::transaction(function () use ($user, $request) {
                $user->save();
                app(AffiliateService::class)->ensure($user);
                if ($request->filled('referral_code')) {
                    $referrer = app(AffiliateService::class)->validateReferral($user, $request->input('referral_code'));
                    $user->referrer_affiliate_id = $referrer->id;
                    $user->save();
                }
                app(NotificationService::class)->welcome($user);
            });
        } catch (UniqueConstraintViolationException $exception) {
            if (User::where('whatsapp_normalized', Identity::phone($user->whatsapp))->exists()) {
                throw ValidationException::withMessages(['whatsapp' => 'Nomor WhatsApp sudah digunakan. Silakan gunakan nomor lain.']);
            }
            throw $exception;
        }
        Auth::guard('web')->login($user);
        $request->session()->regenerate();

        return (new UserResource($user))->response()->setStatusCode(201);
    }

    public function login(Request $request)
    {
        $rawIdentity = $request->input('identity') ?? $request->input('identifier');
        $request->merge(['identity' => $rawIdentity]);
        $data = $request->validate([
            'identity' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string', 'max:72'],
        ]);

        $email = str_contains($data['identity'], '@');
        $normalized = $email ? Identity::email($data['identity']) : Identity::phone($data['identity']);
        $user = User::where($email ? 'email_normalized' : 'whatsapp_normalized', $normalized)->first();

        $dummy = Hash::make(Str::random(32));
        $valid = Hash::check($data['password'], $user?->password ?? $dummy);

        if (! $user || ! $valid || $user->account_status !== 'active') {
            return response()->json(['message' => 'Email/WhatsApp atau kata sandi tidak sesuai.'], 422);
        }

        app(NotificationService::class)->welcome($user);
        Auth::guard('web')->login($user);
        $request->session()->regenerate();
        $request->session()->put('password_hash_web', $user->password);

        return new UserResource($user);
    }

    public function me(Request $request)
    {
        return new UserResource($request->user());
    }

    public function update(ProfileRequest $request)
    {
        $user = $request->user();
        $user->fill($request->safe()->only(['name', 'email', 'whatsapp', 'country', 'target_jlpt']));
        if ($user->isDirty('email')) {
            $user->email_verified_at = null;
        }
        $user->save();

        return new UserResource($user);
    }

    public function logout(Request $request)
    {
        Auth::guard('web')->logout();
        try {
            Auth::guard('sanctum')->setUser(null);
        } catch (\Throwable) {
        }
        auth()->forgetGuards();
        $request->setUserResolver(fn () => null);
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->noContent();
    }

    public function forgot(Request $request, RecoveryOtpService $otp)
    {
        $data = $request->validate(['email' => ['required', 'string', 'email:rfc', 'max:255']]);
        $result = $otp->send(Identity::email($data['email']), $request->ip());

        return response()->json(['message' => RecoveryOtpService::MESSAGE, ...$result]);
    }

    public function verifyOtp(Request $request, RecoveryOtpService $otp)
    {
        $data = $request->validate([
            'email' => ['required', 'string', 'email:rfc', 'max:255'],
            'otp' => ['required', 'string', 'regex:/^[0-9]{6}$/D'],
        ]);
        $email = Identity::email($data['email']);
        $token = $otp->verify($email, $data['otp'], $request->ip());
        if (! $token) {
            return response()->json(['message' => 'Kode tidak valid atau kedaluwarsa.'], 422);
        }
        $request->session()->regenerate();
        $request->session()->put('recovery_grant', compact('email', 'token'));

        return response()->json(['message' => 'OTP terverifikasi.']);
    }

    public function resetGrant(Request $request, RecoveryOtpService $otp)
    {
        return response()->json(['valid' => $otp->grant($request->session()->get('recovery_grant', []))]);
    }

    public function reset(Request $request, RecoveryOtpService $otp)
    {
        $data = $request->validate([
            'password' => ['required', 'string', 'max:72', 'confirmed', PasswordRule::min(8)],
        ]);
        if (! $otp->grant($request->session()->get('recovery_grant', []), $data['password'])) {
            return response()->json(['message' => 'Verifikasi OTP diperlukan.'], 422);
        }
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['message' => 'Kata sandi berhasil direset. Silakan login kembali.']);
    }

    public function updatePassword(Request $request)
    {
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'max:72', 'confirmed', PasswordRule::min(8)],
        ]);

        $user = $request->user();
        if (! Hash::check($data['current_password'], $user->password)) {
            return response()->json(['message' => 'Kata sandi saat ini tidak sesuai.'], 422);
        }

        $user->password = $data['password'];
        $user->save();

        return response()->json(['message' => 'Kata sandi berhasil diperbarui.']);
    }
}
