<?php

namespace App\Http\Controllers;

use App\Models\Affiliate;
use App\Models\Invoice;
use App\Services\AffiliateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminAffiliateController extends Controller
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

        return response()->json(['data' => Affiliate::orderByDesc('id')->get()], 200);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json(['data' => $this->affiliates->save($request->all())], 201);
    }

    public function show(Request $request, Affiliate $affiliate): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json(['data' => $affiliate], 200);
    }

    public function update(Request $request, Affiliate $affiliate): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json(['data' => $this->affiliates->save($request->all(), $affiliate)], 200);
    }

    public function destroy(Request $request, Affiliate $affiliate): JsonResponse
    {
        $this->authorizeAdmin($request);
        $this->affiliates->delete($affiliate);

        return response()->json(null, 204);
    }

    public function attribute(Request $request, Invoice $invoice): JsonResponse
    {
        $this->authorizeAdmin($request);
        $data = $request->validate(['affiliate_id' => ['required', 'integer', 'exists:affiliates,id']]);
        $attribution = $this->affiliates->attribute($invoice, Affiliate::findOrFail($data['affiliate_id']));

        return response()->json(['data' => $attribution], $attribution->wasRecentlyCreated ? 201 : 200);
    }
}
