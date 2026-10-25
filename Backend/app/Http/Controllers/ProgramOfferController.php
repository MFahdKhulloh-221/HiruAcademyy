<?php

namespace App\Http\Controllers;

use App\Models\ProgramOffer;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

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

    public function update(Request $request, ProgramOffer $offer): JsonResponse
    {
        abort_unless($request->user(), 401);
        abort_unless($request->user()->account_status === 'active', 401);
        abort_unless($request->user()->role === 'admin', 403);
        $data = $request->validate([
            'base_price' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:2147483647'],
            'duration_months' => ['sometimes', 'required', 'integer', 'min:1', 'max:32767'],
            'status' => ['sometimes', 'required', 'in:active,inactive'],
            'program_id' => ['prohibited'], 'plan_code' => ['prohibited'],
            'currency' => ['prohibited'],
        ]);
        DB::transaction(function () use ($offer, $data) {
            ProgramOffer::whereKey($offer->id)->lockForUpdate()->firstOrFail()->update($data);
        });

        return response()->json(['data' => $offer->fresh()]);
    }

    private function index(bool $public): JsonResponse
    {
        $offers = ProgramOffer::query()
            ->with(['program:id,code,slug,name,status', 'promotions' => fn ($query) => $query->where('status', 'active')])
            ->when($public, fn (Builder $query) => $query
                ->where('status', 'active')->whereNotNull('base_price')
                ->whereHas('program', fn (Builder $program) => $program->where('status', 'active')))
            ->orderBy('program_id')->orderBy('plan_code')
            ->get()->map(function (ProgramOffer $offer) use ($public) {
                $data = [
                    'id' => $offer->id,
                    'program' => $offer->program->only(['code', 'slug', 'name']),
                    'plan_code' => $offer->plan_code,
                    'base_price' => $offer->base_price,
                    'currency' => $offer->currency,
                    'duration_months' => $offer->duration_months,
                    ...$offer->pricing(),
                ];

                return $public ? $data : ['id' => $offer->id, 'program_id' => $offer->program_id, ...$data, 'status' => $offer->status, 'program_status' => $offer->program->status];
            });

        return response()->json(['data' => $offers]);
    }
}
