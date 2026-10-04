<?php

namespace App\Services;

use App\Models\Affiliate;
use App\Models\Commission;
use App\Models\Invoice;
use App\Models\InvoiceAttribution;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AffiliateService
{
    public function save(array $input, ?Affiliate $affiliate = null): Affiliate
    {
        return DB::transaction(function () use ($input, $affiliate) {
            if ($affiliate) {
                $affiliate = Affiliate::whereKey($affiliate->id)->lockForUpdate()->firstOrFail();
            }
            foreach (['code', 'email'] as $field) {
                if (isset($input[$field]) && is_string($input[$field])) {
                    $input[$field] = $field === 'code' ? strtoupper(trim($input[$field])) : strtolower(trim($input[$field]));
                }
            }
            $required = $affiliate ? 'sometimes' : 'required';
            $data = Validator::make($input, [
                'name' => [$required, 'string', 'max:255'],
                'code' => [$required, 'string', 'max:255', 'regex:/^[A-Z0-9_-]+$/D', Rule::unique('affiliates', 'code')->ignore($affiliate?->id)],
                'user_id' => ['sometimes', 'nullable', 'integer', Rule::exists('users', 'id')->where('role', 'student'), Rule::unique('affiliates', 'user_id')->ignore($affiliate?->id)],
                'email' => ['sometimes', 'nullable', 'email', 'max:255', Rule::unique('affiliates', 'email')->ignore($affiliate?->id)],
                'whatsapp' => ['sometimes', 'nullable', 'string', 'max:255'],
                'rate' => ['sometimes', 'nullable', 'numeric', 'between:0,100', 'regex:/^\d+(?:\.\d+)?$/D'],
                'status' => [$required, Rule::in(['active', 'inactive'])],
            ])->validate();
            if ($affiliate && array_key_exists('rate', $data) && ! $this->sameRate($affiliate->rate, $data['rate']) && $affiliate->commissions()->where('status', 'paid')->exists()) {
                throw ValidationException::withMessages(['rate' => 'Rate cannot change after a paid commission.']);
            }
            if (! $affiliate) {
                return Affiliate::create($data)->fresh();
            }
            $affiliate->update($data);

            return $affiliate->fresh();
        });
    }

    private function sameRate(mixed $first, mixed $second): bool
    {
        if ($first === null || $second === null) {
            return $first === $second;
        }

        return (bool) DB::selectOne('SELECT CAST(? AS numeric) = CAST(? AS numeric) AS same', [$first, $second])->same;
    }

    public function delete(Affiliate $affiliate): void
    {
        DB::transaction(function () use ($affiliate) {
            $affiliate = Affiliate::whereKey($affiliate->id)->lockForUpdate()->firstOrFail();
            if ($affiliate->attributions()->exists() || $affiliate->commissions()->exists()) {
                throw ValidationException::withMessages(['affiliate_id' => 'Referenced affiliates cannot be deleted.']);
            }
            $affiliate->delete();
        });
    }

    public function referral(Invoice $invoice, mixed $code): ?InvoiceAttribution
    {
        if ($code === null || $code === '') {
            return null;
        }
        $data = Validator::make(['referral_code' => is_string($code) ? strtoupper(trim($code)) : $code], [
            'referral_code' => ['required', 'string', 'max:255', 'regex:/^[A-Z0-9_-]+$/D'],
        ])->validate();

        return DB::transaction(function () use ($invoice, $data) {
            $invoice = Invoice::whereKey($invoice->id)->lockForUpdate()->firstOrFail();
            $affiliate = Affiliate::where('code', $data['referral_code'])->lockForUpdate()->first();
            if (! $affiliate || $affiliate->status !== 'active' || $invoice->status !== 'draft') {
                throw ValidationException::withMessages(['referral_code' => 'Referral requires an active affiliate and a new draft invoice.']);
            }

            return $this->persistAttribution($invoice, $affiliate);
        });
    }

    public function attribute(Invoice $invoice, Affiliate $affiliate): InvoiceAttribution
    {
        return DB::transaction(function () use ($invoice, $affiliate) {
            $invoice = Invoice::whereKey($invoice->id)->lockForUpdate()->firstOrFail();
            $this->qualify($invoice);
            $affiliate = Affiliate::whereKey($affiliate->id)->lockForUpdate()->firstOrFail();
            $this->active($affiliate);

            return $this->persistAttribution($invoice, $affiliate);
        });
    }

    private function persistAttribution(Invoice $invoice, Affiliate $affiliate): InvoiceAttribution
    {
        $existing = InvoiceAttribution::where('invoice_id', $invoice->id)->first();
        if ($existing && $existing->affiliate_id !== $affiliate->id) {
            throw ValidationException::withMessages(['affiliate_id' => 'Invoice already has a different affiliate.']);
        }

        return $existing ?? InvoiceAttribution::create(['invoice_id' => $invoice->id, 'affiliate_id' => $affiliate->id]);
    }

    public function createCommission(Invoice $invoice, ?Affiliate $affiliate = null, ?string $note = null): Commission
    {
        Validator::make(['note' => $note], ['note' => ['nullable', 'string', 'max:5000']])->validate();

        return DB::transaction(function () use ($invoice, $affiliate, $note) {
            $invoice = Invoice::whereKey($invoice->id)->lockForUpdate()->firstOrFail();
            $this->qualify($invoice);
            $attribution = InvoiceAttribution::where('invoice_id', $invoice->id)->first();
            if (! $affiliate && ! $attribution) {
                throw ValidationException::withMessages(['affiliate_id' => 'Invoice requires an affiliate attribution.']);
            }
            $affiliate = Affiliate::whereKey($affiliate?->id ?? $attribution->affiliate_id)->lockForUpdate()->firstOrFail();
            $this->active($affiliate);
            $this->persistAttribution($invoice, $affiliate);
            $existing = Commission::where('invoice_id', $invoice->id)->where('affiliate_id', $affiliate->id)->first();
            if ($existing) {
                return $existing;
            }
            if ($affiliate->rate === null) {
                throw ValidationException::withMessages(['rate' => 'Affiliate commission rate is not configured.']);
            }
            $amount = DB::selectOne('SELECT round(CAST(? AS numeric) * CAST(? AS numeric) * 0.01, 0)::bigint AS amount', [$invoice->total_price, $affiliate->rate])->amount;

            return Commission::create([
                'invoice_id' => $invoice->id, 'affiliate_id' => $affiliate->id,
                'rate' => $affiliate->rate, 'amount' => $amount, 'status' => 'pending', 'note' => $note,
            ])->refresh();
        });
    }

    public function transition(Commission $commission, array $input): Commission
    {
        $data = Validator::make($input, [
            'status' => ['required', Rule::in(['approved', 'paid'])],
            'paid_at' => ['required_if:status,paid', 'prohibited_unless:status,paid', 'date_format:Y-m-d', 'before_or_equal:today'],
            'note' => ['sometimes', 'nullable', 'string', 'max:5000'],
        ])->validate();

        return DB::transaction(function () use ($commission, $data) {
            Affiliate::whereKey($commission->affiliate_id)->lockForUpdate()->firstOrFail();
            $commission = Commission::whereKey($commission->id)->lockForUpdate()->firstOrFail();
            if ((['pending' => 'approved', 'approved' => 'paid'][$commission->status] ?? null) !== $data['status']) {
                throw ValidationException::withMessages(['status' => 'Commission must advance exactly one state.']);
            }
            $commission->update($data);

            return $commission->fresh();
        });
    }

    private function qualify(Invoice $invoice): void
    {
        if (! in_array($invoice->status, ['verified', 'active'], true)) {
            throw ValidationException::withMessages(['invoice_id' => 'Invoice must be verified or active.']);
        }
    }

    private function active(Affiliate $affiliate): void
    {
        if ($affiliate->status !== 'active') {
            throw ValidationException::withMessages(['affiliate_id' => 'Affiliate must be active.']);
        }
    }

    public function student(User $user): array
    {
        $affiliate = Affiliate::where('user_id', $user->id)->first();
        $totals = ['pending' => 0, 'approved' => 0, 'paid' => 0];
        if ($affiliate) {
            foreach ($affiliate->commissions()->selectRaw('status, SUM(amount) AS total')->groupBy('status')->get() as $row) {
                $totals[$row->status] = (int) $row->total;
            }
        }

        return [
            'affiliate' => $affiliate ? $affiliate->only(['id', 'name', 'code', 'status', 'rate']) : null,
            'code' => $affiliate?->code, 'totals' => $totals,
        ];
    }
}
