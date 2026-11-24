<?php

namespace App\Models;

use App\Services\TryOutService;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TryOut extends Model
{
    protected $fillable = ['access_type', 'program_id', 'title', 'status', 'total_passing_score', 'duration_minutes', 'max_score', 'sort_order', 'session_passing_scores', 'session_duration_minutes', 'break_duration_minutes'];

    protected function casts(): array
    {
        return ['program_id' => 'integer', 'total_passing_score' => 'integer', 'duration_minutes' => 'integer', 'max_score' => 'integer', 'sort_order' => 'integer', 'session_passing_scores' => 'array', 'session_duration_minutes' => 'array', 'break_duration_minutes' => 'integer'];
    }

    protected function sessionDurationMinutes(): Attribute
    {
        return Attribute::make(get: fn ($value) => $value === null
            ? array_fill_keys(array_keys(TryOutService::SESSIONS), 30)
            : $this->fromJson($value));
    }

    protected function breakDurationMinutes(): Attribute
    {
        return Attribute::make(get: fn ($value) => $value === null ? 5 : (int) $value);
    }

    public function program(): BelongsTo
    {
        return $this->belongsTo(Program::class);
    }

    public function questions(): HasMany
    {
        return $this->hasMany(TryOutQuestion::class);
    }
}
