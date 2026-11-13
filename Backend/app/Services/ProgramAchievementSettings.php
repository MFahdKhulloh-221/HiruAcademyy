<?php

namespace App\Services;

use App\Models\Program;
use App\Models\ProgramAchievementSetting;

class ProgramAchievementSettings
{
    public function resolve(Program $program): array
    {
        $setting = ProgramAchievementSetting::query()->where('program_id', $program->id)->first();

        return [
            'automatic_enabled' => $setting?->automatic_enabled ?? true,
            'title' => $setting?->title ?? 'Sertifikat Penyelesaian Program',
            'description' => $setting?->description,
            'background_image' => $setting?->background_image,
            'presentation_version' => $setting?->presentation_version ?? 1,
        ];
    }
}
