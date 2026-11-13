<?php

namespace App\Models;

class DailyPracticeAttempt extends TryOutAttempt
{
    protected $table = 'daily_practice_attempts';

    protected static function booted(): void
    {
        static::updating(function (self $attempt) {
            if ($attempt->isDirty(['user_id', 'daily_practice_id', 'content_snapshot', 'grading_snapshot', 'started_at', 'expires_at']) || ($attempt->getOriginal('status') === 'completed' && $attempt->isDirty())) {
                throw new \LogicException('Attempt snapshots and completed attempts are immutable.');
            }
        });
    }

    protected function casts(): array
    {
        return parent::casts() + ['daily_practice_id' => 'integer'];
    }
}
