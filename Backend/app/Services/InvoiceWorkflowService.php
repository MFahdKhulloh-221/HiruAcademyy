<?php

namespace App\Services;

use App\Models\AccessGrant;
use App\Models\Invoice;
use App\Models\Program;
use App\Models\ProgramOffer;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class InvoiceWorkflowService
{
    private const NEXT = ['draft' => 'awaiting_payment', 'awaiting_payment' => 'paid', 'paid' => 'verified', 'verified' => 'active'];

    public function create(User $user, ProgramOffer $offer, array $metadata = []): Invoice
    {
        return DB::transaction(function () use ($user, $offer, $metadata) {
            $student = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $this->requireStudent($student);
            $offer = ProgramOffer::whereKey($offer->id)->lockForUpdate()->firstOrFail();
            $program = Program::whereKey($offer->program_id)->lockForUpdate()->firstOrFail();
            if ($program->status !== 'active' || $offer->status !== 'active' || $offer->base_price === null) {
                throw ValidationException::withMessages(['program_offer_id' => 'Offer is not currently sellable.']);
            }
            $offer->load('promotions');
            $pricing = $offer->pricing();

            return Invoice::create([
                'reference' => (string) Str::uuid(), 'user_id' => $student->id,
                'program_offer_id' => $offer->id, 'program_id' => $offer->program_id, 'plan_code' => $offer->plan_code,
                'status' => 'draft', 'base_price' => $pricing['base_price'],
                'discount_percent' => $pricing['discount_percent'], 'discount_amount' => $pricing['discount_amount'],
                'total_price' => $pricing['effective_price'], 'currency' => $offer->currency,
                'duration_months' => $offer->duration_months,
                'due_date' => $metadata['due_date'] ?? null, 'note' => $metadata['note'] ?? null,
            ])->fresh();
        });
    }

    public function transition(Invoice $invoice, string $target, User $actor): Invoice
    {
        return DB::transaction(function () use ($invoice, $target, $actor) {
            $invoice = Invoice::whereKey($invoice->id)->lockForUpdate()->firstOrFail();
            $actor = User::whereKey($actor->id)->lockForUpdate()->firstOrFail();
            abort_unless($actor->account_status === 'active', 403);
            abort_unless(in_array($actor->role, ['student', 'admin'], true), 403);
            if ($actor->role === 'student') {
                abort_unless($invoice->user_id === $actor->id, 404);
                abort_unless(in_array($target, ['awaiting_payment', 'paid'], true), 403);
            }
            if ($invoice->status === 'active' && $target === 'active') {
                return $invoice;
            }
            if ((self::NEXT[$invoice->status] ?? null) !== $target) {
                throw ValidationException::withMessages(['status' => 'Invoice must advance exactly one state.']);
            }
            $timestamp = match ($target) {
                'awaiting_payment' => 'submitted_at', 'paid' => 'paid_at',
                'verified' => 'verified_at', 'active' => 'activated_at',
            };
            if ($target === 'active') {
                $student = User::whereKey($invoice->user_id)->lockForUpdate()->firstOrFail();
                $this->requireStudent($student);
                $start = today()->toImmutable();
                AccessGrant::create([
                    'source_invoice_id' => $invoice->id, 'user_id' => $invoice->user_id,
                    'program_id' => $invoice->program_id, 'plan_code' => $invoice->plan_code,
                    'status' => 'active', 'starts_at' => $start,
                    'ends_at' => $start->addMonthsNoOverflow($invoice->duration_months)->subDay(),
                ]);
            }
            $invoice->update(['status' => $target, $timestamp => now()]);

            return $invoice;
        });
    }

    private function requireStudent(User $user): void
    {
        if ($user->role !== 'student' || $user->account_status !== 'active') {
            throw ValidationException::withMessages(['user_id' => 'Invoices require an active student account.']);
        }
    }
}
