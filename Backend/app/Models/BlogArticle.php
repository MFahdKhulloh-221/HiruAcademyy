<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BlogArticle extends Model
{
    protected $fillable = ['title', 'slug', 'excerpt', 'body', 'thumbnail', 'category', 'seo_title', 'meta_description', 'featured', 'published', 'published_at', 'author'];

    protected $attributes = ['featured' => false, 'published' => false, 'author' => 'Hiru Academy'];

    protected $dateFormat = 'Y-m-d H:i:s.uP';

    protected function casts(): array
    {
        return ['featured' => 'boolean', 'published' => 'boolean', 'published_at' => 'immutable_datetime'];
    }
}
