<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProgramOffer extends Model
{
    protected $fillable = ['program_id', 'plan_code', 'base_price', 'currency', 'duration_months', 'status'];

    protected function casts(): array
    {
        return ['base_price' => 'integer', 'duration_months' => 'integer'];
    }

    public function program(): BelongsTo
    {
        return $this->belongsTo(Program::class);
    }
}
