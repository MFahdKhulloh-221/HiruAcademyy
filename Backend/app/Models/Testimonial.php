<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Testimonial extends Model
{
    protected $fillable = ['name', 'context', 'quote', 'image', 'video_url', 'video_title', 'published', 'landing', 'sort_order'];

    protected $attributes = ['published' => false, 'landing' => false, 'sort_order' => 1];

    protected function casts(): array
    {
        return ['published' => 'boolean', 'landing' => 'boolean', 'sort_order' => 'integer'];
    }
}
