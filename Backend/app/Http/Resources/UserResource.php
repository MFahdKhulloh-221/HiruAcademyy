<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'whatsapp' => $this->whatsapp,
            'role' => $this->role,
            'country' => $this->country,
            'target_jlpt' => $this->target_jlpt,
            'account_status' => $this->account_status,
        ];
    }
}
