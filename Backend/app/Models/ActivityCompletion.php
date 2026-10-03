<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ActivityCompletion extends Model
{
    public $timestamps = false;

    protected $fillable = ['user_id', 'chapter_id', 'type', 'resource_id', 'completed_at'];

    protected function casts(): array
    {
        return ['user_id' => 'integer', 'chapter_id' => 'integer', 'resource_id' => 'integer', 'completed_at' => 'immutable_datetime'];
    }
}
