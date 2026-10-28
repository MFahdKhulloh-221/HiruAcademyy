<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CheckpointAttempt extends Model
{
    protected $guarded = ['id'];

    protected $hidden = ['grading_snapshot', 'content_snapshot', 'result_snapshot'];

    protected function casts(): array
    {
        return ['user_id' => 'integer', 'checkpoint_package_id' => 'integer', 'content_snapshot' => 'array', 'grading_snapshot' => 'array', 'answers' => 'array', 'result_snapshot' => 'array', 'revision' => 'integer', 'started_at' => 'immutable_datetime', 'expires_at' => 'immutable_datetime', 'submitted_at' => 'immutable_datetime'];
    }

    public function package(): BelongsTo
    {
        return $this->belongsTo(CheckpointPackage::class, 'checkpoint_package_id');
    }
}
