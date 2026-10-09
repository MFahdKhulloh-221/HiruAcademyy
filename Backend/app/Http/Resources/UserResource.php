<?php

namespace App\Http\Resources;

use App\Services\MediaService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $avatarUrl = null;
        if ($this->avatar) {
            try {
                $avatarUrl = app(MediaService::class)->url($this->avatar);
            } catch (\Throwable $exception) {
                report($exception);
            }
        }

        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'whatsapp' => $this->whatsapp,
            'role' => $this->role,
            'country' => $this->country,
            'target_jlpt' => $this->target_jlpt,
            'account_status' => $this->account_status,
            'avatar' => $this->avatar ?: null,
            'avatar_resolved_url' => $avatarUrl,
        ];
    }
}
