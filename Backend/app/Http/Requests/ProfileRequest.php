<?php

namespace App\Http\Requests;

use App\Support\Identity;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class ProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $values = [];
        if (is_string($this->input('email'))) {
            $values['email_normalized'] = Identity::email($this->input('email'));
        }
        if (is_string($this->input('whatsapp'))) {
            $values['whatsapp_normalized'] = Identity::phone($this->input('whatsapp'));
        }
        $this->merge($values);
    }

    public function rules(): array
    {
        $update = $this->isMethod('PATCH');
        $presence = $update ? 'sometimes' : 'required';
        $id = $update ? $this->user()?->id : null;

        return [
            'name' => [$presence, 'required', 'string', 'max:255'],
            'email' => [$presence, 'required', 'string', 'email:rfc', 'max:255'],
            'email_normalized' => [$presence, 'required', 'email:rfc', Rule::unique('users')->ignore($id)],
            'whatsapp' => [$presence, 'required', 'string', 'max:32'],
            'whatsapp_normalized' => [$presence, 'required', 'regex:/^[1-9][0-9]{7,14}$/D', Rule::unique('users')->ignore($id)],
            'password' => $update ? ['prohibited'] : ['required', 'string', 'max:72', 'confirmed', Password::min(8)],
            'country' => ['sometimes', 'nullable', 'string', 'max:100'],
            'target_jlpt' => ['sometimes', 'nullable', Rule::in(['N5', 'N4', 'N3', 'N2', 'N1'])],
            'role' => ['prohibited'],
            'account_status' => ['prohibited'],
        ];
    }
}
