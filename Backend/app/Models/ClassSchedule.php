<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ClassSchedule extends Model
{
    protected $fillable = ['program_id', 'title', 'description', 'scheduled_at', 'duration_minutes', 'meeting_url', 'status', 'sort_order', 'chapter', 'session', 'sensei_name'];

    protected $hidden = ['meeting_url'];

    protected $dateFormat = 'Y-m-d H:i:s.uP';

    protected function casts(): array
    {
        return ['scheduled_at' => 'immutable_datetime', 'duration_minutes' => 'integer', 'sort_order' => 'integer'];
    }

    public function program(): BelongsTo
    {
        return $this->belongsTo(Program::class);
    }
}
