<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProgramAchievementResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $presentation = $this->presentation_snapshot ?? [];
        $text = static fn ($value): ?string => is_string($value) ? trim(strip_tags($value)) : null;

        return [
            'id' => $this->id,
            'program_id' => $this->program_id,
            'student_name_snapshot' => $text($this->student_name_snapshot),
            'program_name_snapshot' => $text($this->program_name_snapshot),
            'program_code_snapshot' => $text($this->program_code_snapshot),
            'learning_type_snapshot' => $this->learning_type_snapshot,
            'presentation_snapshot' => [
                'title' => $text($presentation['title'] ?? null),
                'description' => $text($presentation['description'] ?? null),
                // ponytail: no retained achievement media references; enable after media lifecycle support.
                'background_image' => null,
                'presentation_version' => (int) ($presentation['presentation_version'] ?? 1),
                'issuer' => $text($presentation['issuer'] ?? null),
                'signature_data_url' => \App\Services\CertificateIssuerSettings::safeDataUrl($presentation['signature_data_url'] ?? null),
                'signature_position' => ($presentation['signature_position'] ?? null) === 'bottom-left' ? 'bottom-left' : 'bottom-right',
            ],
            'issued_at' => $this->issued_at?->utc()->toIso8601String(),
        ];
    }
}
