<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CommunityRoom extends Model
{
    protected $fillable = ['topic_id'];

    public function topic(): BelongsTo
    {
        return $this->belongsTo(CommunityTopic::class, 'topic_id');
    }

    public function messages(): HasMany
    {
        return $this->hasMany(CommunityMessage::class, 'room_id');
    }
}
