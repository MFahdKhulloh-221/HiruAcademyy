<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class NotificationRead extends Model
{
    protected $dateFormat = 'Y-m-d H:i:s.uP';

    protected $fillable = ['user_id', 'notification_content_id', 'read_at'];

    protected function casts(): array
    {
        return ['read_at' => 'immutable_datetime'];
    }

    public function notificationContent(): BelongsTo
    {
        return $this->belongsTo(NotificationContent::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
