<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Testimonial extends Model
{
    protected $fillable = ['name', 'context', 'quote', 'image', 'video_url', 'video_title', 'published', 'landing', 'sort_order', 'moderation_status', 'moderation_note'];

    protected $attributes = ['published' => false, 'landing' => false, 'sort_order' => 1, 'source' => 'admin', 'moderation_status' => 'approved', 'consent_public' => true];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    protected function casts(): array
    {
        return ['published' => 'boolean', 'landing' => 'boolean', 'sort_order' => 'integer', 'consent_public' => 'boolean'];
    }
}
