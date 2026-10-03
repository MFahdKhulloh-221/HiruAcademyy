<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReadingQuestion extends Model
{
    protected $fillable = ['reading_passage_id', 'question', 'options', 'correct_option', 'explanation', 'sort_order', 'status'];

    protected function casts(): array
    {
        return ['reading_passage_id' => 'integer', 'options' => 'array', 'sort_order' => 'integer'];
    }

    public function readingPassage(): BelongsTo
    {
        return $this->belongsTo(ReadingPassage::class);
    }
}
