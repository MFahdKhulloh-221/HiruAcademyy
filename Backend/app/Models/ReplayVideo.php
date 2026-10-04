<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReplayVideo extends Model
{
    protected $fillable = ['replay_playlist_id', 'title', 'video_url', 'description', 'recorded_at', 'sort_order', 'status', 'chapter', 'session', 'sensei_name'];

    protected $hidden = ['video_url'];

    protected function casts(): array
    {
        return ['recorded_at' => 'immutable_date', 'sort_order' => 'integer'];
    }

    public function playlist(): BelongsTo
    {
        return $this->belongsTo(ReplayPlaylist::class, 'replay_playlist_id');
    }
}
