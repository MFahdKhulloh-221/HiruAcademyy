<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ShowcaseItem extends Model
{
    protected $fillable = ['key', 'label', 'image_src', 'alt', 'sort_order', 'visible'];

    protected $attributes = ['sort_order' => 1, 'visible' => false];

    protected function casts(): array
    {
        return ['sort_order' => 'integer', 'visible' => 'boolean'];
    }
}
