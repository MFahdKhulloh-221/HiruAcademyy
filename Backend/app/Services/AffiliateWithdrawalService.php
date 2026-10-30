<?php

namespace App\Services;

use App\Models\Affiliate;
use App\Models\Commission;
use App\Models\User;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AffiliateWithdrawalService
{
    public function audit(string $event, string $subject, array $detail = []): void
    {
        DB::table('affiliate_audits')->insert(['actor_id' => auth()->id(), 'event' => $event, 'subject' => $subject, 'detail' => json_encode($detail, JSON_THROW_ON_ERROR), 'created_at' => now()]);
    }

    public function settings(): object
    {
        return DB::table('affiliate_settings')->where('id', 1)->firstOrFail();
    }

    public function available(Affiliate $affiliate): array
    {
        $settings = $this->settings();
        $used = DB::table('affiliate_withdrawal_allocations as a')->join('affiliate_withdrawals as w', 'w.id', '=', 'a.withdrawal_id')
            ->where('w.affiliate_id', $affiliate->id)->where('w.status', '!=', 'rejected')->selectRaw('a.commission_id, SUM(a.amount) as used')->groupBy('a.commission_id')->pluck('used', 'commission_id');
        return $affiliate->commissions()->where('status', 'approved')->whereNotIn('id', DB::table('commission_holds')->select('commission_id'))
            ->whereHas('invoice', fn ($q) => $q->whereIn('status', ['verified', 'active']))->get()->flatMap(function ($commission) use ($used, $settings) {
                if ($settings->waiting_days === null || $commission->created_at->greaterThan(now()->subDays($settings->waiting_days))) {
                    return [];
                }
                $remaining = $commission->amount - (int) ($used[$commission->id] ?? 0);
                return $remaining > 0 ? [['id' => $commission->id, 'amount' => $remaining]] : [];
            })->all();
    }

    public function request(User $user, array $input): object
    {
        abort(410, 'Pencairan tunai tidak tersedia. Kredit hanya untuk pembelian LMS.');
        $data = Validator::make($input, [
            'request_key' => ['required', 'uuid'], 'amount' => ['required', 'integer', 'min:1', 'max:9007199254740991'],
            'bank' => ['required', 'string', 'max:100'], 'account_name' => ['required', 'string', 'max:150'],
            'account_number' => ['required', 'string', 'regex:/^[0-9]{5,34}$/D'],
        ])->validate();
        $data['amount'] = (int) $data['amount'];
        $fingerprint = hash('sha256', json_encode([$data['amount'], $data['bank'], $data['account_name'], $data['account_number']], JSON_THROW_ON_ERROR));
        return DB::transaction(function () use ($user, $data, $fingerprint) {
            $affiliate = Affiliate::where('user_id', $user->id)->lockForUpdate()->firstOrFail();
            $existing = DB::table('affiliate_withdrawals')->where('request_key', $data['request_key'])->first();
            if ($existing) {
                if ($existing->affiliate_id !== $affiliate->id || ! hash_equals($existing->fingerprint, $fingerprint)) {
                    throw ValidationException::withMessages(['request_key' => 'Referensi permintaan sudah digunakan.']);
                }
                return $this->publicRow($existing);
            }
            $settings = DB::table('affiliate_settings')->where('id', 1)->sharedLock()->firstOrFail();
            if (! $settings->enabled || ! $settings->withdrawals_enabled || $affiliate->status !== 'active' || $settings->minimum === null || $settings->fee === null || $settings->waiting_days === null) {
                throw ValidationException::withMessages(['amount' => 'Pencairan belum diaktifkan atau kebijakan pencairan belum lengkap.']);
            }
            $available = $this->available($affiliate);
            if ($data['amount'] < $settings->minimum || $data['amount'] <= $settings->fee || $data['amount'] > array_sum(array_column($available, 'amount'))) {
                throw ValidationException::withMessages(['amount' => 'Nominal tidak memenuhi minimum, biaya, atau saldo yang bisa dicairkan.']);
            }
            $id = DB::table('affiliate_withdrawals')->insertGetId([
                'affiliate_id' => $affiliate->id, 'request_key' => $data['request_key'], 'amount' => $data['amount'], 'fee' => $settings->fee,
                'destination' => Crypt::encryptString(json_encode(array_intersect_key($data, array_flip(['bank', 'account_name', 'account_number'])), JSON_THROW_ON_ERROR)),
                'destination_masked' => $data['bank'].' ••••'.substr($data['account_number'], -4), 'fingerprint' => $fingerprint,
                'created_at' => now(), 'updated_at' => now(),
            ]);
            $remaining = $data['amount'];
            foreach ($available as $commission) {
                $amount = min($remaining, $commission['amount']);
                if ($amount <= 0) break;
                DB::table('affiliate_withdrawal_allocations')->insert(['withdrawal_id' => $id, 'commission_id' => $commission['id'], 'amount' => $amount]);
                $remaining -= $amount;
            }
            $this->audit('withdrawal.requested', (string) $id, ['amount' => $data['amount'], 'fee' => $settings->fee]);
            return $this->publicRow(DB::table('affiliate_withdrawals')->find($id));
        }, 3);
    }

    public function publicRow(object $row): object
    {
        unset($row->destination, $row->fingerprint);
        return $row;
    }

    public function transition(int $id, array $input): object
    {
        abort(410, 'Pencairan tunai tidak tersedia. Kredit hanya untuk pembelian LMS.');
        $data = Validator::make($input, [
            'status' => ['required', Rule::in(['approved', 'processing', 'paid', 'rejected', 'reconciliation'])],
            'reason' => ['required_if:status,rejected,reconciliation', 'nullable', 'string', 'max:2000'],
            'transfer_reference' => ['required_if:status,paid', 'nullable', 'string', 'min:3', 'max:255'],
        ])->validate();
        return DB::transaction(function () use ($id, $data) {
            $initial = DB::table('affiliate_withdrawals')->find($id);
            abort_unless($initial, 404);
            $affiliate = Affiliate::whereKey($initial->affiliate_id)->lockForUpdate()->firstOrFail();
            $row = DB::table('affiliate_withdrawals')->where('id', $id)->lockForUpdate()->firstOrFail();
            if ($row->status === $data['status']) {
                if (($data['status'] === 'paid' && $row->transfer_reference !== $data['transfer_reference']) || (in_array($data['status'], ['rejected', 'reconciliation']) && $row->reason !== $data['reason'])) {
                    throw ValidationException::withMessages(['status' => 'Konfirmasi ulang tidak sesuai catatan sebelumnya.']);
                }
                return $this->publicRow($row);
            }
            $allowed = ['pending' => ['approved', 'rejected'], 'approved' => ['processing', 'rejected'], 'processing' => ['paid', 'reconciliation'], 'reconciliation' => ['paid']];
            if (! in_array($data['status'], $allowed[$row->status] ?? [], true)) {
                throw ValidationException::withMessages(['status' => 'Perubahan status tidak diizinkan. Transfer belum pasti harus direkonsiliasi, bukan dilepas.']);
            }
            $allocations = DB::table('affiliate_withdrawal_allocations')->where('withdrawal_id', $id)->get();
            if (in_array($data['status'], ['approved', 'processing', 'paid'])) {
                foreach ($allocations as $allocation) {
                    $commission = Commission::with('invoice')->findOrFail($allocation->commission_id);
                    if ($affiliate->status !== 'active' || $commission->status !== 'approved' || ! in_array($commission->invoice->status, ['verified', 'active']) || DB::table('commission_holds')->where('commission_id', $commission->id)->exists()) {
                        throw ValidationException::withMessages(['status' => 'Komisi ditahan atau transaksi tidak lagi valid. Perlu rekonsiliasi.']);
                    }
                }
            }
            $changes = ['status' => $data['status'], 'reason' => $data['reason'] ?? null, 'updated_at' => now()];
            if ($data['status'] === 'paid') {
                $payout = DB::table('payouts')->insertGetId(['affiliate_id' => $affiliate->id, 'request_key' => $row->request_key, 'amount' => $row->amount, 'paid_at' => today()->toDateString(), 'note' => 'Referensi transfer: '.$data['transfer_reference'], 'created_at' => now(), 'updated_at' => now()]);
                $changes += ['payout_id' => $payout, 'transfer_reference' => $data['transfer_reference']];
                DB::table('affiliate_withdrawals')->where('id', $id)->update($changes);
                foreach ($allocations as $allocation) {
                    $commission = Commission::findOrFail($allocation->commission_id);
                    $paid = DB::table('affiliate_withdrawal_allocations as a')->join('affiliate_withdrawals as w', 'w.id', '=', 'a.withdrawal_id')->where('a.commission_id', $commission->id)->where('w.status', 'paid')->sum('a.amount');
                    if ((int) $paid === $commission->amount) {
                        DB::table('payout_commissions')->insert(['payout_id' => $payout, 'commission_id' => $commission->id]);
                        $commission->update(['status' => 'paid', 'paid_at' => today()->toDateString()]);
                    }
                }
            } else {
                DB::table('affiliate_withdrawals')->where('id', $id)->update($changes);
            }
            $this->audit('withdrawal.'.$data['status'], (string) $id, ['from' => $row->status, 'reason' => $data['reason'] ?? null, 'transfer_reference' => $data['transfer_reference'] ?? null]);
            return $this->publicRow(DB::table('affiliate_withdrawals')->find($id));
        }, 3);
    }
}
