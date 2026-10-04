<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MiniCheckpointQuestion extends Model
{
    protected $fillable = ['chapter_id', 'question', 'options', 'correct_option', 'explanation', 'sort_order', 'status', 'session', 'part', 'duration_minutes'];

    protected function casts(): array
    {
        return ['chapter_id' => 'integer', 'options' => 'array', 'sort_order' => 'integer', 'session' => 'integer', 'part' => 'integer', 'duration_minutes' => 'integer'];
    }

    public function chapter(): BelongsTo
    {
        return $this->belongsTo(Chapter::class);
    }
}
