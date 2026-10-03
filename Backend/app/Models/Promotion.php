<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Promotion extends Model
{
    protected $fillable = ['program_offer_id', 'name', 'discount_percent', 'starts_at', 'ends_at', 'status', 'note'];

    protected function casts(): array
    {
        return ['discount_percent' => 'float', 'starts_at' => 'immutable_date:Y-m-d', 'ends_at' => 'immutable_date:Y-m-d'];
    }

    public function programOffer(): BelongsTo
    {
        return $this->belongsTo(ProgramOffer::class);
    }
}
