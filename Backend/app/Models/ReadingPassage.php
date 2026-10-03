<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ReadingPassage extends Model
{
    protected $fillable = ['chapter_id', 'title', 'body', 'sort_order', 'status'];

    protected function casts(): array
    {
        return ['chapter_id' => 'integer', 'sort_order' => 'integer'];
    }

    public function chapter(): BelongsTo
    {
        return $this->belongsTo(Chapter::class);
    }

    public function questions(): HasMany
    {
        return $this->hasMany(ReadingQuestion::class)->orderBy('sort_order')->orderBy('id');
    }
}
