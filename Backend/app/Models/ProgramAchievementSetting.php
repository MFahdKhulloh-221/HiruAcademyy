<?php

namespace App\Models;

use App\Services\MediaService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Validation\ValidationException;

class ProgramAchievementSetting extends Model
{
    protected $fillable = ['program_id', 'automatic_enabled', 'title', 'description', 'background_image', 'presentation_version'];

    protected $attributes = ['automatic_enabled' => true, 'presentation_version' => 1];

    protected function casts(): array
    {
        return ['program_id' => 'integer', 'automatic_enabled' => 'boolean', 'presentation_version' => 'integer'];
    }

    protected static function booted(): void
    {
        static::saving(function (self $setting) {
            if ($setting->background_image !== null && (! is_string($setting->background_image) || ! app(MediaService::class)->valid($setting->background_image, 'image'))) {
                throw ValidationException::withMessages(['background_image' => 'Use a safe image media reference.']);
            }
        });
    }

    public function program(): BelongsTo
    {
        return $this->belongsTo(Program::class);
    }
}
