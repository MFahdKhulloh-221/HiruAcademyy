<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PlacementQuestion extends Model
{
    protected $guarded = ['id'];

    protected $attributes = ['status' => 'draft', 'sort_order' => 1];

    protected $hidden = ['correct_option', 'explanation'];

    protected function casts(): array
    {
        return ['placement_config_id' => 'integer', 'options' => 'array', 'sort_order' => 'integer'];
    }
}
