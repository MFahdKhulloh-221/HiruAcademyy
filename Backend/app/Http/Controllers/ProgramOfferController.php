<?php

namespace App\Http\Controllers;

use App\Models\ProgramOffer;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;

class ProgramOfferController extends Controller
{
    public function publicIndex(): JsonResponse
    {
        return $this->index(true);
    }

    public function adminIndex(): JsonResponse
    {
        return $this->index(false);
    }

    private function index(bool $public): JsonResponse
    {
        $offers = ProgramOffer::query()
            ->with(['program:id,code,slug,name', 'promotions' => fn ($query) => $query->where('status', 'active')])
            ->when($public, fn (Builder $query) => $query
                ->where('status', 'active')->whereNotNull('base_price')
                ->whereHas('program', fn (Builder $program) => $program->where('status', 'active')))
            ->orderBy('program_id')->orderBy('plan_code')
            ->get()->map(function (ProgramOffer $offer) use ($public) {
                $data = [
                    'program' => $offer->program->only(['code', 'slug', 'name']),
                    'plan_code' => $offer->plan_code,
                    'base_price' => $offer->base_price,
                    'currency' => $offer->currency,
                    'duration_months' => $offer->duration_months,
                    ...$offer->pricing(),
                ];

                return $public ? $data : ['id' => $offer->id, 'program_id' => $offer->program_id, ...$data, 'status' => $offer->status];
            });

        return response()->json(['data' => $offers]);
    }
}
