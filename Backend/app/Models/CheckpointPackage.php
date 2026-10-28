<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class CheckpointPackage extends Model
{
    protected $fillable = ['program_id', 'title', 'access_type', 'status', 'duration_minutes', 'passing_score'];

    protected function casts(): array
    {
        return ['program_id' => 'integer', 'duration_minutes' => 'integer', 'passing_score' => 'integer'];
    }

    public function program(): BelongsTo
    {
        return $this->belongsTo(Program::class);
    }

    public function questions(): BelongsToMany
    {
        return $this->belongsToMany(CheckpointQuestion::class, 'checkpoint_package_questions')->withPivot(['session', 'audio_url', 'reading_passage', 'sort_order'])->orderByPivot('sort_order')->orderBy('checkpoint_questions.id');
    }
}
