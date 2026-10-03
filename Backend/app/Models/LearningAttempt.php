<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use LogicException;

class LearningAttempt extends Model
{
    protected $dateFormat = 'Y-m-d H:i:sP';

    protected $guarded = ['id'];

    protected $hidden = ['content_snapshot', 'grading_snapshot', 'result_snapshot', 'answers'];

    protected function casts(): array
    {
        return ['user_id' => 'integer', 'chapter_id' => 'integer', 'revision' => 'integer', 'content_snapshot' => 'array', 'grading_snapshot' => 'array', 'answers' => 'array', 'result_snapshot' => 'array', 'submitted_at' => 'immutable_datetime'];
    }

    protected static function booted(): void
    {
        static::updating(function (self $attempt) {
            if ($attempt->isDirty(['user_id', 'chapter_id', 'kind', 'content_snapshot', 'grading_snapshot']) || ($attempt->getOriginal('status') === 'completed' && $attempt->isDirty())) {
                throw new LogicException('Attempt snapshots and completed attempts are immutable.');
            }
        });
    }
}
