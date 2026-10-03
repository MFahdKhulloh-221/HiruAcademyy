<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Program extends Model
{
    protected $fillable = ['code', 'slug', 'name', 'family', 'cumulative_rank', 'status', 'sort_order'];

    protected function casts(): array
    {
        return ['cumulative_rank' => 'integer', 'sort_order' => 'integer'];
    }
}
