<?php

namespace App\Http\Controllers;

use App\Models\Promotion;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class PromotionController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['data' => Promotion::orderBy('id')->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        return $this->save($request, new Promotion);
    }

    public function update(Request $request, Promotion $promotion): JsonResponse
    {
        return $this->save($request, $promotion);
    }

    public function destroy(Promotion $promotion): JsonResponse
    {
        $promotion->delete();

        return response()->json(null, 204);
    }

    private function save(Request $request, Promotion $promotion): JsonResponse
    {
        $creating = ! $promotion->exists;
        $required = $creating ? 'required' : 'sometimes';
        $data = $request->validate([
            'program_offer_id' => [$required, 'integer', 'exists:program_offers,id'],
            'name' => [$required, 'required', 'string', 'max:255'],
            'discount_percent' => [$required, 'required', 'numeric', 'between:0,100'],
            'starts_at' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'ends_at' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'status' => [$required, 'required', Rule::in(['draft', 'active', 'inactive'])],
            'note' => ['sometimes', 'nullable', 'string'],
        ]);

        try {
            DB::transaction(function () use ($data, $promotion, $creating) {
                if (! $creating) {
                    $promotion->setRawAttributes(Promotion::whereKey($promotion->id)->lockForUpdate()->firstOrFail()->getAttributes(), true);
                }
                $promotion->fill($data);
                if ($promotion->starts_at !== null && $promotion->ends_at !== null
                    && Carbon::parse($promotion->ends_at)->lt($promotion->starts_at)) {
                    throw ValidationException::withMessages(['ends_at' => 'Tanggal akhir tidak boleh sebelum tanggal mulai.']);
                }
                if ($promotion->status === 'active' && Promotion::where('program_offer_id', $promotion->program_offer_id)
                    ->where('status', 'active')->when(! $creating, fn ($query) => $query->whereKeyNot($promotion->id))->exists()) {
                    throw ValidationException::withMessages(['status' => 'Program ini sudah memiliki promo aktif.']);
                }
                $promotion->save();
            });
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages(['status' => 'Program ini sudah memiliki promo aktif.']);
        }

        return response()->json(['data' => $promotion->fresh()], $creating ? 201 : 200);
    }
}
