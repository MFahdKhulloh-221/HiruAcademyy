<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Program extends Model
{
    protected $fillable = ['code', 'slug', 'name', 'description', 'family', 'cumulative_rank', 'status', 'sort_order', 'show_on_programs'];

    protected function casts(): array
    {
        return ['cumulative_rank' => 'integer', 'sort_order' => 'integer', 'show_on_programs' => 'boolean'];
    }
}
