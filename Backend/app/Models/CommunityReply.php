<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CommunityReply extends Model
{
    protected $fillable = ['thread_id', 'user_id', 'content', 'status'];

    public function thread(): BelongsTo
    {
        return $this->belongsTo(CommunityThread::class, 'thread_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
