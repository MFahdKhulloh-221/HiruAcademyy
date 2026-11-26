<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MiniCheckpointQuestion extends Model
{
    protected $fillable = ['chapter_id', 'category', 'instruction', 'image_url', 'image_alt', 'image_position', 'audio_url', 'passage', 'question', 'options', 'correct_option', 'explanation', 'sort_order', 'status', 'session', 'part', 'duration_minutes', 'passing_score'];

    protected function casts(): array
    {
        return ['chapter_id' => 'integer', 'options' => 'array', 'passage' => 'array', 'sort_order' => 'integer', 'session' => 'integer', 'part' => 'integer', 'duration_minutes' => 'integer', 'passing_score' => 'integer'];
    }

    public function chapter(): BelongsTo
    {
        return $this->belongsTo(Chapter::class);
    }
}
