<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CheckpointPackage extends Model
{
    protected $fillable = ['access_type', 'program_id', 'title', 'status', 'total_passing_score', 'duration_minutes', 'max_score', 'sort_order', 'session_passing_scores'];

    protected function casts(): array
    {
        return ['program_id' => 'integer', 'total_passing_score' => 'integer', 'duration_minutes' => 'integer', 'max_score' => 'integer', 'sort_order' => 'integer', 'session_passing_scores' => 'array'];
    }

    public function program(): BelongsTo
    {
        return $this->belongsTo(Program::class);
    }

    public function legacyQuestions(): \Illuminate\Database\Eloquent\Relations\BelongsToMany
    {
        return $this->belongsToMany(CheckpointQuestion::class, 'checkpoint_package_questions')->withPivot(['session', 'audio_url', 'reading_passage', 'sort_order'])->orderByPivot('sort_order')->orderBy('checkpoint_questions.id');
    }

    public function questions(): HasMany
    {
        return $this->hasMany(CheckpointStudioQuestion::class);
    }
}
