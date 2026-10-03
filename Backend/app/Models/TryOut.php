<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TryOut extends Model
{
    protected $fillable = ['program_id', 'title', 'status', 'total_passing_score'];

    protected function casts(): array
    {
        return ['program_id' => 'integer', 'total_passing_score' => 'integer'];
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
