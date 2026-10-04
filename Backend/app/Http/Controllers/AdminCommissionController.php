<?php

namespace App\Http\Controllers;

use App\Models\Affiliate;
use App\Models\Commission;
use App\Models\Invoice;
use App\Services\AffiliateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminCommissionController extends Controller
{
    public function __construct(private AffiliateService $affiliates) {}

    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user(), 401);
        abort_unless($request->user()->account_status === 'active', 401);
        abort_unless($request->user()->role === 'admin', 403);
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json(['data' => Commission::orderByDesc('id')->get()], 200);
    }

    public function show(Request $request, Commission $commission): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json(['data' => $commission], 200);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);
        $data = $request->validate([
            'invoice_id' => ['required', 'integer', 'exists:invoices,id'],
            'affiliate_id' => ['sometimes', 'nullable', 'integer', 'exists:affiliates,id'],
            'note' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'rate' => ['prohibited'], 'amount' => ['prohibited'], 'status' => ['prohibited'], 'paid_at' => ['prohibited'],
        ]);
        $commission = $this->affiliates->createCommission(
            Invoice::findOrFail($data['invoice_id']),
            isset($data['affiliate_id']) ? Affiliate::findOrFail($data['affiliate_id']) : null,
            $data['note'] ?? null,
        );

        return response()->json(['data' => $commission], $commission->wasRecentlyCreated ? 201 : 200);
    }

    public function status(Request $request, Commission $commission): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json(['data' => $this->affiliates->transition($commission, $request->all())], 200);
    }
}
