<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Support\Identity;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;

class CreateAdmin extends Command
{
    protected $signature = 'hiru:admin:create';

    protected $description = 'Buat administrator melalui input interaktif tersembunyi';

    public function handle(): int
    {
        if (! $this->input->isInteractive()) {
            $this->error('Input interaktif wajib.');

            return self::FAILURE;
        }
        $data = [
            'name' => $this->secret('Nama', false),
            'email' => $this->secret('Email', false),
            'whatsapp' => $this->secret('WhatsApp', false),
            'password' => $this->secret('Kata sandi', false),
            'password_confirmation' => $this->secret('Ulangi kata sandi', false),
        ];
        $data['email_normalized'] = Identity::email((string) $data['email']);
        $data['whatsapp_normalized'] = Identity::phone((string) $data['whatsapp']);
        $validator = Validator::make($data, [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email:rfc', 'max:255'],
            'email_normalized' => ['required', 'unique:users,email_normalized'],
            'whatsapp' => ['required', 'string', 'max:32'],
            'whatsapp_normalized' => ['required', 'regex:/^[1-9][0-9]{7,14}$/D', 'unique:users,whatsapp_normalized'],
            'password' => ['required', 'string', 'max:72', 'confirmed', Password::min(8)],
        ]);
        if ($validator->fails()) {
            $this->error('Data tidak valid atau sudah digunakan.');

            return self::FAILURE;
        }
        try {
            $user = new User(array_intersect_key($data, array_flip(['name', 'email', 'whatsapp', 'password'])));
            $user->role = 'admin';
            $user->account_status = 'active';
            $user->save();
        } catch (\Throwable) {
            $this->error('Administrator tidak dapat dibuat.');

            return self::FAILURE;
        }
        $this->info('Administrator berhasil dibuat.');

        return self::SUCCESS;
    }
}
