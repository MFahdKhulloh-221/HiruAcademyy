<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CheckpointStudioQuestion extends Model
{
    protected $fillable = ['checkpoint_package_id', 'passage_id', 'session', 'question', 'options', 'correct_option', 'explanation', 'point_value', 'reading_passage', 'audio_url', 'sort_order', 'status', 'instruction', 'japanese'];

    protected $hidden = ['correct_option', 'explanation'];

    protected function casts(): array
    {
        return ['checkpoint_package_id' => 'integer', 'options' => 'array', 'japanese' => 'array', 'point_value' => 'integer', 'sort_order' => 'integer'];
    }

    public function package(): BelongsTo
    {
        return $this->belongsTo(CheckpointPackage::class, 'checkpoint_package_id');
    }
}
