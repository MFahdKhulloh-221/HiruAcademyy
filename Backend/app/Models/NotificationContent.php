<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class NotificationContent extends Model
{
    protected $dateFormat = 'Y-m-d H:i:s.uP';

    protected $fillable = ['type', 'title', 'body', 'cta_label', 'preset', 'path', 'audience', 'level', 'status', 'time'];

    protected $attributes = ['preset' => 'None', 'audience' => 'All', 'status' => 'draft'];

    protected function casts(): array
    {
        return ['time' => 'immutable_datetime'];
    }

    public function reads(): HasMany
    {
        return $this->hasMany(NotificationRead::class);
    }
}
