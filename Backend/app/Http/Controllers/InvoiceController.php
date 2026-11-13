<?php

namespace App\Http\Controllers;

use App\Models\Invoice;
use App\Models\ProgramOffer;
use App\Models\User;
use App\Services\InvoiceWorkflowService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\DB;

class InvoiceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Invoice::query();
        app(InvoiceWorkflowService::class)->deletionMetadata($query);
        if ($request->user()->role === 'student') {
            $query->where('user_id', $request->user()->id);
        } else {
            $request->validate(['archived' => ['sometimes', 'boolean']]);
            $cancelled = DB::table('referral_invoice_controls')->select('invoice_id')->where('status', 'cancelled');
            if ($request->boolean('archived')) $query->whereIn('id', $cancelled);
            else $query->whereNotIn('id', $cancelled);
        }

        return response()->json(['data' => $query->orderByDesc('id')->get()->map(fn (Invoice $invoice) => $this->serialize($request, $invoice))]);
    }

    public function show(Request $request, Invoice $invoice): JsonResponse
    {
        $this->authorizeOwner($request, $invoice);

        return response()->json(['data' => $this->serialize($request, $invoice->load('accessGrant'))]);
    }

    public function store(Request $request, InvoiceWorkflowService $workflow): JsonResponse
    {
        $rules = [
            'program_offer_id' => ['required', 'integer', 'exists:program_offers,id'],
            'use_credit' => ['sometimes', 'boolean'], 'credit_request_key' => ['required', 'uuid'],
            'referral_code' => ['nullable', 'string', 'max:255'],
            'affiliate_id' => ['prohibited'], 'commission' => ['prohibited'], 'rate' => ['prohibited'], 'amount' => ['prohibited'],
            'due_date' => ['nullable', 'date_format:Y-m-d'], 'note' => ['nullable', 'string', 'max:5000'],
        ];
        foreach (['user_id', 'status', 'base_price', 'discount', 'discount_percent', 'discount_amount', 'total_price', 'effective_price', 'duration', 'duration_months', 'currency', 'program_id', 'plan_code', 'source_invoice_id', 'renewal_grant_id'] as $field) {
            $rules[$field] = ['prohibited'];
        }
        $data = $request->validate($rules);
        $invoice = $workflow->create($request->user(), ProgramOffer::findOrFail($data['program_offer_id']), $data);

        return response()->json(['data' => $this->serialize($request, $invoice)], 201);
    }

    public function adminStore(Request $request, InvoiceWorkflowService $workflow): JsonResponse
    {
        $data = $request->validate([
            'user_id' => ['required', 'integer', Rule::exists('users', 'id')->where('role', 'student')->where('account_status', 'active')],
            'program_offer_id' => ['required', 'integer', 'exists:program_offers,id'],
            'referral_code' => ['nullable', 'string', 'max:255'],
            'due_date' => ['nullable', 'date_format:Y-m-d'],
            'note' => ['nullable', 'string', 'max:5000'],
            'status' => ['prohibited'], 'base_price' => ['prohibited'], 'total_price' => ['prohibited'],
            'discount_amount' => ['prohibited'], 'duration_months' => ['prohibited'], 'renewal_grant_id' => ['prohibited'],
        ]);
        $invoice = $workflow->create(User::findOrFail($data['user_id']), ProgramOffer::findOrFail($data['program_offer_id']), $data);

        return response()->json(['data' => $this->serialize($request, $invoice)], 201);
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

        return response()->json(['data' => $data['status'] === 'paid'
            ? $workflow->confirmPayment($invoice, $request->user())
            : $workflow->transition($invoice, $data['status'], $request->user())]);
    }

    public function destroy(Request $request, Invoice $invoice, InvoiceWorkflowService $workflow): \Illuminate\Http\Response
    {
        $workflow->delete($invoice, $request->user());

        return response()->noContent();
    }

    public function cancel(Request $request, Invoice $invoice, InvoiceWorkflowService $workflow): JsonResponse
    {
        $data = $request->validate([
            'reason' => ['required', 'string', 'max:5000'],
            'confirmation' => ['required', 'accepted'],
        ]);
        $invoice = $workflow->cancel($invoice, $request->user(), $data['reason']);

        return response()->json(['data' => $this->serialize($request, $invoice)]);
    }

    private function serialize(Request $request, Invoice $invoice): array
    {
        $data = $invoice->toArray();
        $cancelled = array_key_exists('invoice_cancelled', $data)
            ? (bool) $data['invoice_cancelled']
            : DB::table('referral_invoice_controls')->where('invoice_id', $invoice->id)->where('status', 'cancelled')->exists();
        foreach (array_keys($data) as $key) {
            if ($key === 'invoice_cancelled' || str_starts_with($key, 'delete_relation_')) unset($data[$key]);
        }
        if ($cancelled) $data['status'] = 'cancelled';
        if ($request->user()->role === 'admin') $data['can_delete'] = app(InvoiceWorkflowService::class)->canDelete($invoice);

        return $data;
    }

    private function authorizeOwner(Request $request, Invoice $invoice): void
    {
        abort_unless($request->user()->role === 'admin' || $invoice->user_id === $request->user()->id, 404);
    }
}
