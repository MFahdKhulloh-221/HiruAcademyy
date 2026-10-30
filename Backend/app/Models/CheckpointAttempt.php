<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CheckpointAttempt extends Model
{
    protected $guarded = ['id'];

    protected $hidden = ['grading_snapshot', 'content_snapshot', 'result_snapshot'];

    protected $dateFormat = 'Y-m-d H:i:s.uP';

    protected static function booted(): void
    {
        static::updating(function (self $attempt) {
            if (isset($attempt->grading_snapshot['max_score']) && ($attempt->isDirty(['user_id', 'checkpoint_package_id', 'content_snapshot', 'grading_snapshot', 'started_at', 'expires_at']) || (($attempt->getOriginal('status') === 'completed' || $attempt->getOriginal('abandoned_at') !== null) && $attempt->isDirty()))) {
                throw new \LogicException('Attempt snapshots and completed attempts are immutable.');
            }
        });
    }

    protected function casts(): array
    {
        return ['user_id' => 'integer', 'checkpoint_package_id' => 'integer', 'content_snapshot' => 'array', 'grading_snapshot' => 'array', 'answers' => 'array', 'result_snapshot' => 'array', 'revision' => 'integer', 'completed_sessions' => 'array', 'current_session' => 'integer', 'abandoned_at' => 'immutable_datetime', 'completed_at' => 'immutable_datetime', 'started_at' => 'immutable_datetime', 'expires_at' => 'immutable_datetime', 'submitted_at' => 'immutable_datetime'];
    }

    public function package(): BelongsTo
    {
        return $this->belongsTo(CheckpointPackage::class, 'checkpoint_package_id');
    }
}
