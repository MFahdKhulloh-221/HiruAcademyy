<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SenseiProfile extends Model
{
    protected $fillable = ['name', 'role', 'bio', 'photo', 'expertise', 'active', 'sort_order', 'level'];

    protected $attributes = ['active' => false, 'sort_order' => 1];

    protected function casts(): array
    {
        return ['expertise' => 'array', 'active' => 'boolean', 'sort_order' => 'integer'];
    }
}
