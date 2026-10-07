<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SenseiProfile extends Model
{
    protected $fillable = ['user_id', 'name', 'role', 'bio', 'photo', 'expertise', 'active', 'sort_order', 'level'];

    protected $attributes = ['active' => false, 'sort_order' => 1];

    protected function casts(): array
    {
        return ['user_id' => 'integer', 'expertise' => 'array', 'active' => 'boolean', 'sort_order' => 'integer'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
