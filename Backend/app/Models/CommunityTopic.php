<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CommunityTopic extends Model
{
    protected $fillable = ['slug', 'title', 'description', 'icon', 'sort_order', 'status'];

    protected $casts = [
        'sort_order' => 'integer',
    ];

    public function threads(): HasMany
    {
        return $this->hasMany(CommunityThread::class, 'topic_id');
    }
}
