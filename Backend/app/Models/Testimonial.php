<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Testimonial extends Model
{
    protected $fillable = ['archived_at', 'name', 'context', 'quote', 'image', 'video_url', 'video_title', 'type', 'title', 'video_thumbnail', 'show_on_testimonials', 'published', 'landing', 'sort_order', 'moderation_status', 'moderation_note'];

    protected $attributes = ['type' => 'text', 'show_on_testimonials' => false, 'published' => false, 'landing' => false, 'sort_order' => 1, 'source' => 'admin', 'moderation_status' => 'approved', 'consent_public' => true];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    protected function casts(): array
    {
        return ['archived_at' => 'immutable_datetime', 'show_on_testimonials' => 'boolean', 'first_approved_at' => 'immutable_datetime', 'published' => 'boolean', 'landing' => 'boolean', 'sort_order' => 'integer', 'consent_public' => 'boolean'];
    }
}
