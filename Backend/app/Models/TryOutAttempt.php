<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TryOutAttempt extends Model
{
    protected $guarded = ['id'];

    protected $dateFormat = 'Y-m-d H:i:s.uP';

    protected $hidden = ['content_snapshot', 'grading_snapshot', 'result_snapshot', 'answers'];

    protected static function booted(): void
    {
        static::updating(function (self $attempt) {
            if ($attempt->isDirty(['user_id', 'try_out_id', 'content_snapshot', 'grading_snapshot', 'started_at']) || ($attempt->getOriginal('status') === 'completed' && $attempt->isDirty())) {
                throw new \LogicException('Attempt snapshots and completed attempts are immutable.');
            }
        });
    }

    protected function casts(): array
    {
        return ['user_id' => 'integer', 'try_out_id' => 'integer', 'content_snapshot' => 'array', 'grading_snapshot' => 'array', 'result_snapshot' => 'array', 'answers' => 'array', 'completed_sessions' => 'array', 'current_session' => 'integer', 'revision' => 'integer', 'started_at' => 'datetime', 'completed_at' => 'datetime'];
    }
}
