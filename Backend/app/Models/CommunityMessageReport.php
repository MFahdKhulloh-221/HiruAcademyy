<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CommunityMessageReport extends Model
{
    protected $fillable = ['message_id', 'reporter_id', 'reason', 'status', 'handled_at', 'handled_by'];

    public function message(): BelongsTo
    {
        return $this->belongsTo(CommunityMessage::class)->withTrashed();
    }

    public function reporter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reporter_id');
    }
}
