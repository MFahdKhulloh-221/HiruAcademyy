<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TryOut extends Model
{
    protected $fillable = ['program_id', 'title', 'status', 'total_passing_score', 'duration_minutes', 'max_score', 'sort_order', 'session_passing_scores'];

    protected function casts(): array
    {
        return ['program_id' => 'integer', 'total_passing_score' => 'integer', 'duration_minutes' => 'integer', 'max_score' => 'integer', 'sort_order' => 'integer', 'session_passing_scores' => 'array'];
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
