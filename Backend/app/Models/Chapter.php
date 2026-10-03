<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Chapter extends Model
{
    protected $fillable = ['program_id', 'chapter_number', 'title', 'description', 'sort_order', 'status'];

    protected function casts(): array
    {
        return ['program_id' => 'integer', 'chapter_number' => 'integer', 'sort_order' => 'integer'];
    }

    public function program(): BelongsTo
    {
        return $this->belongsTo(Program::class);
    }

    public function videoLessons(): HasMany
    {
        return $this->hasMany(VideoLesson::class)->orderBy('sort_order')->orderBy('id');
    }

    public function modules(): HasMany
    {
        return $this->hasMany(LearningModule::class)->orderBy('sort_order')->orderBy('id');
    }

    public function flashcards(): HasMany
    {
        return $this->hasMany(Flashcard::class)->orderBy('sort_order')->orderBy('id');
    }

    public function audioQuestions(): HasMany
    {
        return $this->hasMany(AudioQuestion::class)->orderBy('sort_order')->orderBy('id');
    }

    public function readingPassages(): HasMany
    {
        return $this->hasMany(ReadingPassage::class)->orderBy('sort_order')->orderBy('id');
    }

    public function miniCheckpointQuestions(): HasMany
    {
        return $this->hasMany(MiniCheckpointQuestion::class)->orderBy('sort_order')->orderBy('id');
    }
}
