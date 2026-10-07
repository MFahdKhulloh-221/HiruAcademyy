<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CommunityThread extends Model
{
    protected $fillable = ['topic_id', 'user_id', 'title', 'content', 'is_ask_sensei', 'status'];

    protected $casts = [
        'is_ask_sensei' => 'boolean',
    ];

    public function topic(): BelongsTo
    {
        return $this->belongsTo(CommunityTopic::class, 'topic_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function replies(): HasMany
    {
        return $this->hasMany(CommunityReply::class, 'thread_id');
    }
}
