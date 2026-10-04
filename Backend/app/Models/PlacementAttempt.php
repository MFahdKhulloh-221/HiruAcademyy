<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PlacementAttempt extends Model
{
    protected $guarded = ['id'];

    protected $dateFormat = 'Y-m-d H:i:s.uP';

    protected $hidden = ['user_id', 'owner_hash', 'applicant_snapshot', 'config_snapshot', 'content_snapshot', 'grading_snapshot', 'answers', 'result_snapshot'];

    protected static function booted(): void
    {
        static::updating(function (self $attempt) {
            if ($attempt->isDirty(['placement_config_id', 'user_id', 'owner_hash', 'applicant_snapshot', 'config_snapshot', 'content_snapshot', 'grading_snapshot', 'started_at', 'expires_at']) || ($attempt->getOriginal('status') === 'completed' && $attempt->isDirty())) {
                throw new \LogicException('Attempt snapshots and completed attempts are immutable.');
            }
        });
        static::deleting(fn () => throw new \LogicException('Placement attempts are immutable.'));
    }

    protected function casts(): array
    {
        return ['placement_config_id' => 'integer', 'user_id' => 'integer', 'applicant_snapshot' => 'array', 'config_snapshot' => 'array', 'content_snapshot' => 'array', 'grading_snapshot' => 'array', 'answers' => 'array', 'result_snapshot' => 'array', 'started_at' => 'immutable_datetime', 'expires_at' => 'immutable_datetime', 'completed_at' => 'immutable_datetime'];
    }
}
