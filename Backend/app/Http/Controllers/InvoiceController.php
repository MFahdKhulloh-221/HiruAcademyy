<?php

namespace App\Http\Controllers;

use App\Models\Invoice;
use App\Models\ProgramOffer;
use App\Services\InvoiceWorkflowService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class InvoiceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Invoice::query();
        if ($request->user()->role === 'student') {
            $query->where('user_id', $request->user()->id);
        }

        return response()->json(['data' => $query->orderByDesc('id')->get()]);
    }

    public function show(Request $request, Invoice $invoice): JsonResponse
    {
        $this->authorizeOwner($request, $invoice);

        return response()->json(['data' => $invoice->load('accessGrant')]);
    }

    public function store(Request $request, InvoiceWorkflowService $workflow): JsonResponse
    {
        $rules = [
            'program_offer_id' => ['required', 'integer', 'exists:program_offers,id'],
            'referral_code' => ['nullable', 'string', 'max:255'],
            'affiliate_id' => ['prohibited'], 'commission' => ['prohibited'], 'rate' => ['prohibited'], 'amount' => ['prohibited'],
            'due_date' => ['nullable', 'date_format:Y-m-d'], 'note' => ['nullable', 'string', 'max:5000'],
        ];
        foreach (['user_id', 'status', 'base_price', 'discount', 'discount_percent', 'discount_amount', 'total_price', 'effective_price', 'duration', 'duration_months', 'currency', 'program_id', 'plan_code', 'source_invoice_id'] as $field) {
            $rules[$field] = ['prohibited'];
        }
        $data = $request->validate($rules);
        $invoice = $workflow->create($request->user(), ProgramOffer::findOrFail($data['program_offer_id']), $data);

        return response()->json(['data' => $invoice], 201);
    }

    public function submit(Request $request, Invoice $invoice, InvoiceWorkflowService $workflow): JsonResponse
    {
        $this->authorizeOwner($request, $invoice);

        return response()->json(['data' => $workflow->transition($invoice, 'awaiting_payment', $request->user())]);
    }

    public function markPaid(Request $request, Invoice $invoice, InvoiceWorkflowService $workflow): JsonResponse
    {
        $this->authorizeOwner($request, $invoice);

        return response()->json(['data' => $workflow->transition($invoice, 'paid', $request->user())]);
    }

    public function transition(Request $request, Invoice $invoice, InvoiceWorkflowService $workflow): JsonResponse
    {
        $data = $request->validate(['status' => ['required', Rule::in(['draft', 'awaiting_payment', 'paid', 'verified', 'active'])]]);

        return response()->json(['data' => $workflow->transition($invoice, $data['status'], $request->user())]);
    }

    private function authorizeOwner(Request $request, Invoice $invoice): void
    {
        abort_unless($request->user()->role === 'admin' || $invoice->user_id === $request->user()->id, 404);
    }
}
