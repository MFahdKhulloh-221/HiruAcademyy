<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AudioQuestion extends Model
{
    protected $fillable = ['chapter_id', 'title', 'audio_url', 'question', 'options', 'correct_option', 'explanation', 'sort_order', 'status'];

    protected function casts(): array
    {
        return ['chapter_id' => 'integer', 'options' => 'array', 'sort_order' => 'integer'];
    }

    public function chapter(): BelongsTo
    {
        return $this->belongsTo(Chapter::class);
    }
}
