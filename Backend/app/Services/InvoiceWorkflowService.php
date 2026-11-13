<?php

namespace App\Services;

use App\Models\AccessGrant;
use App\Models\Invoice;
use App\Models\Program;
use App\Models\ProgramOffer;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class InvoiceWorkflowService
{
    private const NEXT = ['draft' => 'awaiting_payment', 'awaiting_payment' => 'paid', 'paid' => 'verified', 'verified' => 'active'];

    public function create(User $user, ProgramOffer $offer, array $metadata = []): Invoice
    {
        return DB::transaction(function () use ($user, $offer, $metadata) {
            $credits = app(ReferralCreditService::class);
            $credits->policy(true);
            $student = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $this->requireStudent($student);
            if (! empty($metadata['credit_request_key'])) {
                $existing = Invoice::where('user_id', $user->id)->where('credit_request_key', $metadata['credit_request_key'])->first();
                if ($existing) {
                    if ($existing->program_offer_id !== $offer->id || (bool) ($existing->credit_policy['requested_credit'] ?? false) !== (bool) ($metadata['use_credit'] ?? false) || ($existing->credit_policy['requested_referral'] ?? null) !== ($metadata['referral_code'] ?? null)) {
                        throw ValidationException::withMessages(['credit_request_key' => 'Request key sudah dipakai untuk pesanan berbeda.']);
                    }
                    return $existing;
                }
            }
            $offer = ProgramOffer::whereKey($offer->id)->lockForUpdate()->firstOrFail();
            $program = Program::whereKey($offer->program_id)->lockForUpdate()->firstOrFail();
            if ($program->status !== 'active' || $offer->status !== 'active' || $offer->base_price === null) {
                throw ValidationException::withMessages(['program_offer_id' => 'Offer is not currently sellable.']);
            }
            $renewal = in_array($program->code, ['n5', 'n4', 'n3', 'n2', 'n1'], true)
                ? $this->membership($student->id, $offer->program_id, $offer->plan_code)->first()
                : null;
            $offer->load('promotions');
            $pricing = $credits->price($student, $offer, $metadata);
            $snapshot = $pricing['policy'] + ['requested_credit' => (bool) ($metadata['use_credit'] ?? false), 'requested_referral' => $metadata['referral_code'] ?? null];

            $invoice = Invoice::create([
                'reference' => (string) Str::uuid(), 'user_id' => $student->id,
                'program_offer_id' => $offer->id, 'program_id' => $offer->program_id, 'plan_code' => $offer->plan_code,
                'status' => 'draft', 'base_price' => $pricing['base_price'],
                'discount_percent' => $pricing['discount_percent'], 'discount_amount' => $pricing['discount_amount'],
                'total_price' => $pricing['total_price'], 'currency' => $offer->currency,
                'duration_months' => $offer->duration_months,
                'renewal_grant_id' => $renewal?->id,
                'credit_request_key' => $metadata['credit_request_key'] ?? null, 'credit_policy' => $snapshot,
                'referral_discount' => $pricing['referral_discount'], 'credit_discount' => $pricing['credit_discount'], 'promo_discount' => $pricing['promo_discount'],
                'due_date' => $metadata['due_date'] ?? null, 'note' => $metadata['note'] ?? null,
            ])->fresh();
            $credits->reserve($invoice, $pricing);
            app(NotificationService::class)->invoiceReminder($student, $invoice);

            return $invoice;
        });
    }

    public function transition(Invoice $invoice, string $target, User $actor): Invoice
    {
        return DB::transaction(function () use ($invoice, $target, $actor) {
            $credits = app(ReferralCreditService::class);
            $credits->policy(true);
            $invoice = Invoice::whereKey($invoice->id)->lockForUpdate()->firstOrFail();
            $actor = User::whereKey($actor->id)->lockForUpdate()->firstOrFail();
            abort_unless($actor->account_status === 'active', 403);
            abort_unless(in_array($actor->role, ['student', 'admin'], true), 403);
            if ($actor->role === 'student') {
                abort_unless($invoice->user_id === $actor->id, 404);
                abort_unless($target === 'awaiting_payment', 403);
            }
            if ($invoice->status === $target && in_array($target, ['verified', 'active'])) {
                return $invoice;
            }
            $credits->assertPayable($invoice);
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
                $start = $invoice->renewal_grant_id !== null ? $invoice->verified_at->startOfDay() : today()->toImmutable();
                $end = $start->addMonthsNoOverflow($invoice->duration_months)->subDay();
                if ($invoice->renewal_grant_id !== null) {
                    $source = AccessGrant::whereKey($invoice->renewal_grant_id)->lockForUpdate()->firstOrFail();
                    if ($source->user_id !== $student->id || $source->program_id !== $invoice->program_id || $source->plan_code !== $invoice->plan_code || $source->status !== 'active') {
                        throw ValidationException::withMessages(['renewal_grant_id' => 'Renewal membership does not match this invoice.']);
                    }
                    $latest = $this->membership($student->id, $invoice->program_id, $invoice->plan_code)->first();
                    if ($latest && $latest->ends_at->greaterThanOrEqualTo($start)) {
                        $end = $latest->ends_at->addMonthsNoOverflow($invoice->duration_months);
                    }
                }
                AccessGrant::create([
                    'source_invoice_id' => $invoice->id, 'user_id' => $invoice->user_id,
                    'program_id' => $invoice->program_id, 'plan_code' => $invoice->plan_code,
                    'status' => 'active', 'starts_at' => $start,
                    'ends_at' => $end,
                ]);
            }
            $invoice->update(['status' => $target, $timestamp => now()]);
            if ($target === 'verified') $credits->verified($invoice);

            return $invoice;
        });
    }

    public function confirmPayment(Invoice $invoice, User $actor): Invoice
    {
        return DB::transaction(function () use ($invoice, $actor) {
            app(ReferralCreditService::class)->policy(true);
            $invoice = Invoice::whereKey($invoice->id)->lockForUpdate()->firstOrFail();
            $actor = User::whereKey($actor->id)->lockForUpdate()->firstOrFail();
            abort_unless($actor->role === 'admin' && $actor->account_status === 'active', 403);
            if (! in_array($invoice->status, ['awaiting_payment', 'paid', 'verified', 'active'], true)) {
                throw ValidationException::withMessages(['status' => 'Invoice must be submitted before payment confirmation.']);
            }
            while ($invoice->status !== 'active') {
                $invoice = $this->transition($invoice, self::NEXT[$invoice->status], $actor);
            }

            return $invoice;
        });
    }

    private const TRANSACTION_RELATIONS = [
        'access_grants' => 'source_invoice_id', 'invoice_attributions' => 'invoice_id',
        'commissions' => 'invoice_id', 'referral_credit_purchases' => 'invoice_id',
        'referral_learning_credits' => 'source_invoice_id', 'referral_credit_uses' => 'invoice_id',
        'referral_invoice_controls' => 'invoice_id',
    ];

    public function deletionMetadata(\Illuminate\Database\Eloquent\Builder $query): void
    {
        $query->select('invoices.*');
        foreach (self::TRANSACTION_RELATIONS as $table => $column) {
            $query->selectSub(DB::table($table)->selectRaw('1')->whereColumn($column, 'invoices.id')->limit(1), 'delete_relation_'.$table);
        }
        $query->selectSub(DB::table('referral_invoice_controls')->selectRaw('1')->whereColumn('invoice_id', 'invoices.id')->where('status', 'cancelled')->limit(1), 'invoice_cancelled');
    }

    public function canDelete(Invoice $invoice): bool
    {
        if (! in_array($invoice->status, ['draft', 'awaiting_payment'], true)
            || $invoice->paid_at || $invoice->verified_at || $invoice->activated_at || $invoice->renewal_grant_id) {
            return false;
        }
        foreach (self::TRANSACTION_RELATIONS as $table => $column) {
            $attribute = 'delete_relation_'.$table;
            $related = array_key_exists($attribute, $invoice->getAttributes())
                ? (bool) $invoice->getAttribute($attribute)
                : DB::table($table)->where($column, $invoice->id)->exists();
            if ($related) return false;
        }

        return true;
    }

    public function delete(Invoice $invoice, User $actor): void
    {
        try {
            DB::transaction(function () use ($invoice, $actor) {
                app(ReferralCreditService::class)->policy(true);
                $invoice = Invoice::whereKey($invoice->id)->lockForUpdate()->firstOrFail();
                $actor = User::whereKey($actor->id)->lockForUpdate()->firstOrFail();
                abort_unless($actor->role === 'admin' && $actor->account_status === 'active', 403);
                if (! $this->canDelete($invoice)) {
                    throw ValidationException::withMessages(['invoice' => 'Invoice hanya dapat dihapus sebelum pembayaran dan tanpa relasi transaksi. Batalkan invoice yang belum dibayar.']);
                }
                $invoice->delete();
            }, 3);
        } catch (QueryException $exception) {
            if (($exception->errorInfo[0] ?? null) !== '23503') throw $exception;
            throw ValidationException::withMessages(['invoice' => 'Invoice memiliki relasi transaksi dan tidak dapat dihapus.']);
        }
    }

    public function cancel(Invoice $invoice, User $actor, string $reason): Invoice
    {
        return DB::transaction(function () use ($invoice, $actor, $reason) {
            $credits = app(ReferralCreditService::class);
            $credits->policy(true);
            $invoice = Invoice::whereKey($invoice->id)->lockForUpdate()->firstOrFail();
            $actor = User::whereKey($actor->id)->lockForUpdate()->firstOrFail();
            abort_unless($actor->role === 'admin' && $actor->account_status === 'active', 403);
            if (! in_array($invoice->status, ['draft', 'awaiting_payment'], true)
                || $invoice->paid_at || $invoice->verified_at || $invoice->activated_at
                || $invoice->accessGrant()->exists()
                || DB::table('referral_learning_credits')->where('source_invoice_id', $invoice->id)->exists()
                || DB::table('referral_credit_uses')->where('invoice_id', $invoice->id)->where('status', 'used')->exists()
                || DB::table('referral_credit_purchases')->where('invoice_id', $invoice->id)->where('status', 'verified')->exists()
                || DB::table('commissions')->where('invoice_id', $invoice->id)->exists()) {
                throw ValidationException::withMessages(['invoice' => 'Invoice dibayar atau memiliki akses tidak dapat dibatalkan.']);
            }
            if (! DB::table('referral_invoice_controls')->where('invoice_id', $invoice->id)->where('status', 'cancelled')->exists()) {
                $credits->control($invoice, 'cancel', $reason);
            }

            return $invoice;
        }, 3);
    }

    private function membership(int $userId, int $programId, string $plan): \Illuminate\Database\Eloquent\Builder
    {
        return AccessGrant::where('user_id', $userId)->where('program_id', $programId)
            ->where('plan_code', $plan)->where('status', 'active')
            ->orderByDesc('ends_at')->orderByDesc('id')->lockForUpdate();
    }

    private function requireStudent(User $user): void
    {
        if ($user->role !== 'student' || $user->account_status !== 'active') {
            throw ValidationException::withMessages(['user_id' => 'Invoices require an active student account.']);
        }
    }
}
