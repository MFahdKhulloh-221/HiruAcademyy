<?php

namespace App\Http\Controllers;

use App\Http\Requests\ProfileRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Support\Identity;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;

class AuthController extends Controller
{
    public function register(ProfileRequest $request)
    {
        $user = new User($request->safe()->only(['name', 'email', 'whatsapp', 'password', 'country', 'target_jlpt']));
        $user->role = 'student';
        $user->account_status = 'active';
        $user->save();
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

        Auth::guard('web')->login($user);
        $request->session()->regenerate();

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

    public function forgot(Request $request)
    {
        $data = $request->validate(['email' => ['required', 'string', 'email:rfc', 'max:255']]);
        Password::sendResetLink(['email_normalized' => Identity::email($data['email']), 'account_status' => 'active']);

        return response()->json(['message' => 'Jika akun tersedia, tautan reset kata sandi akan dikirim.']);
    }

    public function reset(Request $request)
    {
        $data = $request->validate([
            'email' => ['required', 'string', 'email:rfc', 'max:255'],
            'token' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string', 'max:72', 'confirmed', PasswordRule::min(8)],
        ]);
        $status = Password::reset([
            'email_normalized' => Identity::email($data['email']),
            'account_status' => 'active',
            'token' => $data['token'],
            'password' => $data['password'],
        ], function (User $user, string $password) {
            $user->password = $password;
            $user->setRememberToken(Str::random(60));
            $user->save();
            event(new PasswordReset($user));
        });

        return response()->json([
            'message' => $status === Password::PASSWORD_RESET
                ? 'Kata sandi berhasil direset.'
                : 'Tautan reset tidak valid atau kedaluwarsa.',
        ], $status === Password::PASSWORD_RESET ? 200 : 422);
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
