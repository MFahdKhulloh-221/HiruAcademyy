<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProgramOffer extends Model
{
    protected $fillable = ['program_id', 'plan_code', 'base_price', 'currency', 'duration_months', 'status'];

    protected function casts(): array
    {
        return ['base_price' => 'integer', 'duration_months' => 'integer'];
    }

    public function promotions(): HasMany
    {
        return $this->hasMany(Promotion::class);
    }

    public function pricing(): array
    {
        $now = today();
        $promotion = $this->status === 'active' && $this->base_price !== null
            ? $this->promotions->first(fn (Promotion $promo) => $promo->status === 'active'
                && ($promo->starts_at === null || $promo->starts_at->lte($now))
                && ($promo->ends_at === null || $promo->ends_at->gte($now)))
            : null;
        $discount = $this->base_price === null ? 0
            : (int) round($this->base_price * ($promotion?->discount_percent ?? 0) / 100, 0, PHP_ROUND_HALF_UP);

        return [
            'base_price' => $this->base_price,
            'promotion' => $promotion === null ? null : ['discount_percent' => $promotion->discount_percent],
            'discount_percent' => $promotion?->discount_percent ?? 0,
            'discount_amount' => $discount,
            'effective_price' => $this->base_price === null ? null : max(0, $this->base_price - $discount),
        ];
    }

    public function program(): BelongsTo
    {
        return $this->belongsTo(Program::class);
    }
}
