<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TryOutQuestion extends Model
{
    protected $fillable = ['try_out_id', 'session', 'question', 'options', 'correct_option', 'explanation', 'point_value', 'reading_passage', 'audio_url', 'sort_order', 'status'];

    protected $hidden = ['correct_option', 'explanation'];

    protected function casts(): array
    {
        return ['try_out_id' => 'integer', 'options' => 'array', 'point_value' => 'integer', 'sort_order' => 'integer'];
    }

    public function tryOut(): BelongsTo
    {
        return $this->belongsTo(TryOut::class);
    }
}
