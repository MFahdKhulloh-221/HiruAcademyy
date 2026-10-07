<?php

namespace App\Models;

use App\Support\Identity;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    use HasFactory, Notifiable;

    protected $fillable = ['name', 'email', 'whatsapp', 'password', 'country', 'target_jlpt'];

    protected $hidden = ['password', 'remember_token', 'email_normalized', 'whatsapp_normalized'];

    protected function casts(): array
    {
        return ['email_verified_at' => 'datetime', 'password' => 'hashed'];
    }

    protected static function booted(): void
    {
        static::saving(function (User $user) {
            if ($user->email) {
                $user->email = trim($user->email);
                $user->email_normalized = Identity::email($user->email);
            }
            if ($user->whatsapp) {
                $user->whatsapp = trim($user->whatsapp);
                $user->whatsapp_normalized = Identity::phone($user->whatsapp);
            }
            if (! $user->role) {
                $user->role = 'student';
            }
            if (! $user->account_status) {
                $user->account_status = 'active';
            }
        });
    }

    public function getEmailForPasswordReset(): string
    {
        return $this->email_normalized;
    }

    public function senseiProfile(): HasOne
    {
        return $this->hasOne(SenseiProfile::class);
    }

    public function isSenseiInstructor(): bool
    {
        return $this->role === 'admin' || $this->senseiProfile()->exists();
    }
}
