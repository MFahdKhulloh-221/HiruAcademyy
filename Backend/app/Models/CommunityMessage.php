<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CommunityMessage extends Model
{
    use \Illuminate\Database\Eloquent\SoftDeletes;

    protected $fillable = ['room_id', 'user_id', 'client_message_id', 'content', 'status'];

    public function room(): BelongsTo
    {
        return $this->belongsTo(CommunityRoom::class, 'room_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
