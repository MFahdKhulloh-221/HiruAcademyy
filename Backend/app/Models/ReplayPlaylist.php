<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ReplayPlaylist extends Model
{
    protected $fillable = ['program_id', 'title', 'description', 'sort_order', 'status'];

    protected function casts(): array
    {
        return ['sort_order' => 'integer'];
    }

    public function program(): BelongsTo
    {
        return $this->belongsTo(Program::class);
    }

    public function videos(): HasMany
    {
        return $this->hasMany(ReplayVideo::class);
    }
}
