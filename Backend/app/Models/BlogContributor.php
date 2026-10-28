<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BlogContributor extends Model
{
    protected $fillable = ['name', 'active'];

    protected $attributes = ['active' => true];

    protected function casts(): array
    {
        return ['active' => 'boolean'];
    }
}
