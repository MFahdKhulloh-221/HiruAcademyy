<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Invoice extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'base_price' => 'integer', 'discount_percent' => 'float',
            'discount_amount' => 'integer', 'total_price' => 'integer', 'duration_months' => 'integer',
            'due_date' => 'immutable_date:Y-m-d', 'submitted_at' => 'immutable_datetime',
            'paid_at' => 'immutable_datetime', 'verified_at' => 'immutable_datetime', 'activated_at' => 'immutable_datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function programOffer(): BelongsTo
    {
        return $this->belongsTo(ProgramOffer::class);
    }

    public function program(): BelongsTo
    {
        return $this->belongsTo(Program::class);
    }

    public function accessGrant(): HasOne
    {
        return $this->hasOne(AccessGrant::class, 'source_invoice_id');
    }
}
