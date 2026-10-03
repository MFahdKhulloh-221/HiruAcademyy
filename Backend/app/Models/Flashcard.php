<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Flashcard extends Model
{
    protected $fillable = ['chapter_id', 'japanese', 'reading', 'meaning', 'example', 'sort_order', 'status'];

    protected function casts(): array
    {
        return ['chapter_id' => 'integer', 'sort_order' => 'integer'];
    }

    public function chapter(): BelongsTo
    {
        return $this->belongsTo(Chapter::class);
    }
}
