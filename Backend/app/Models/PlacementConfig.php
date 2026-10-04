<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PlacementConfig extends Model
{
    protected $guarded = ['id'];

    protected $attributes = ['status' => 'draft'];

    protected function casts(): array
    {
        return ['duration_minutes' => 'integer'];
    }

    public function questions(): HasMany
    {
        return $this->hasMany(PlacementQuestion::class);
    }
}
