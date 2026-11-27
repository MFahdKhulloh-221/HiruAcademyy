<?php

namespace App\Http\Controllers;

use App\Models\Affiliate;
use App\Models\Invoice;
use App\Models\ProgramOffer;
use App\Services\AffiliateService;
use App\Services\AffiliateWithdrawalService;
use App\Services\ReferralCreditService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ReferralCreditController extends Controller
{
    public function quote(Request $request, ReferralCreditService $credits)
    {
        $data = $request->validate(['program_offer_id' => ['required', 'integer', 'exists:program_offers,id'], 'referral_code' => ['nullable', 'string', 'max:255'], 'use_credit' => ['sometimes', 'boolean']]);
        $offer = ProgramOffer::findOrFail($data['program_offer_id']);
        abort_unless($offer->status === 'active' && $offer->base_price !== null && $offer->program->status === 'active', 422);
        $quote = $credits->price($request->user(), $offer, $data);
        unset($quote['policy'], $quote['affiliate_id'], $quote['owner_id']);
        return response()->json(['data' => $quote])->header('Cache-Control', 'no-store');
    }

    public function admin(ReferralCreditService $credits)
    {
        $invoices = Invoice::select('id', 'reference', 'status')->get()->keyBy('id');
        $actions = fn ($id) => isset($invoices[$id]) ? $credits->allowedActions($invoices[$id]) : [];
        $rows = $credits->creditRows()->sortByDesc('id')->values()->map(function ($row) use ($actions) {
            $row->allowed_actions = $actions($row->source_invoice_id);
            return $row;
        });
        $history = DB::table('referral_credit_purchases as r')->join('invoices as i', 'i.id', '=', 'r.invoice_id')->join('programs as p', 'p.id', '=', 'i.program_id')
            ->join('users as owner', 'owner.id', '=', 'r.owner_id')->join('users as buyer', 'buyer.id', '=', 'r.buyer_id')
            ->select('r.*', 'owner.name as owner_name', 'buyer.name as buyer_name', 'i.reference', 'i.status as payment_status', 'p.name as program')->orderByDesc('r.id')->get()->map(function ($row) use ($actions) {
                $row->allowed_actions = $actions($row->invoice_id);
                return $row;
            });
        $transactions = DB::table('invoices as i')->join('users as buyer', 'buyer.id', '=', 'i.user_id')->join('programs as p', 'p.id', '=', 'i.program_id')
            ->where(function ($query) {
                $query->whereIn('i.id', DB::table('referral_credit_uses')->select('invoice_id'))
                    ->orWhereIn('i.id', DB::table('referral_credit_purchases')->select('invoice_id'));
            })
            ->select('i.id as invoice_id', 'buyer.name', 'i.reference', 'p.name as program', 'i.status as payment_status')->orderByDesc('i.id')->get()->map(function ($row) use ($actions) {
                $row->allowed_actions = $actions($row->invoice_id);
                return $row;
            });
        return response()->json(['data' => [
            'policy' => $credits->policy(), 'programs' => DB::table('programs')->select('id', 'name')->get(),
            'codes' => DB::table('affiliates as a')->leftJoin('users as owner', 'owner.id', '=', 'a.user_id')
                ->select('a.id', 'a.user_id', 'a.code', 'a.status')->selectRaw('COALESCE(owner.name, a.name) AS name')
                ->selectSub(DB::table('referral_credit_purchases as r')->selectRaw('COUNT(*)')->whereColumn('r.affiliate_id', 'a.id')->where('r.status', 'verified'), 'successful_count')->orderByDesc('a.id')->get(),
            'history' => $history, 'credits' => $rows, 'transactions' => $transactions,
            'uses' => DB::table('referral_credit_uses')->get(),
            'audit' => $this->auditRows($invoices),
            'totals' => ['owners' => Affiliate::whereNotNull('user_id')->count(), 'successful' => $history->where('status', 'verified')->count(),
                'issued' => (int) $rows->sum('amount'), 'used' => (int) $rows->sum('used'), 'available' => (int) $rows->sum('available'),
                'pending' => $history->where('status', 'pending')->count(), 'reserved' => (int) $rows->sum('reserved')],
        ]])->header('Cache-Control', 'no-store');
    }

    private function auditRows($invoices): \Illuminate\Support\Collection
    {
        $labels = ['credit.policy_updated' => 'Pengaturan referral diperbarui', 'credit.code_updated' => 'Kode referral diperbarui',
            'affiliate.updated' => 'Data pemilik referral diperbarui', 'credit.issued' => 'Kredit belajar diterbitkan',
            'credit.first_purchase_conflict' => 'Pembelian pertama perlu rekonsiliasi', 'credit.hold' => 'Tagihan dan kredit ditahan',
            'credit.reverse' => 'Kredit dibatalkan', 'credit.cancel' => 'Tagihan dibatalkan'];
        $affiliates = Affiliate::with('user')->get()->keyBy('id');
        return DB::table('affiliate_audits as a')->leftJoin('users as actor', 'actor.id', '=', 'a.actor_id')
            ->where(function ($query) {
                $query->where('a.event', 'like', 'credit.%')->orWhere('a.event', 'like', 'affiliate.%');
            })->where('a.event', '<>', 'affiliate.settings_updated')->select('a.*', 'actor.name as actor_name')->orderByDesc('a.id')->limit(100)->get()->map(function ($row) use ($invoices, $affiliates, $labels) {
                $detail = json_decode($row->detail, true, 512, JSON_THROW_ON_ERROR);
                $row->summary = $labels[$row->event] ?? 'Aktivitas referral dicatat';
                $row->reason = $detail['reason'] ?? null;
                $row->before = $detail['before'] ?? null;
                $row->after = $detail['after'] ?? null;
                if ($row->event === 'credit.policy_updated') {
                    $changes = [];
                    foreach (['inviter_reward' => 'Kredit untuk pengundang', 'friend_discount' => 'Diskon teman', 'minimum_purchase' => 'Minimum pembelian', 'credit_limit' => 'Batas penggunaan kredit'] as $key => $label) {
                        if (array_key_exists($key, $row->before ?? []) && array_key_exists($key, $row->after ?? []) && $row->before[$key] !== $row->after[$key]) {
                            $format = fn ($value) => $value === null ? 'Tanpa batas' : 'Rp '.number_format((int) $value, 0, ',', '.');
                            $changes[] = $label.': '.$format($row->before[$key]).' menjadi '.$format($row->after[$key]);
                        }
                    }
                    if ($changes) $row->summary .= '. '.implode('; ', $changes);
                }
                $row->subject_label = match (true) {
                    $row->event === 'credit.policy_updated' => 'Pengaturan referral',
                    $row->event === 'credit.code_updated', str_starts_with($row->event, 'affiliate.') => isset($affiliates[$row->subject]) ? ($affiliates[$row->subject]->user?->name ?? $affiliates[$row->subject]->name) : 'Pemilik referral',
                    default => isset($invoices[$row->subject]) ? 'Tagihan '.$invoices[$row->subject]->reference : 'Tagihan referral',
                };
                return $row;
            });
    }

    public function settings(Request $request, ReferralCreditService $credits)
    {
        $data = $request->validate([
            'enabled' => ['required', 'boolean'], 'inviter_reward' => ['required', 'integer', 'min:0', 'max:1000000000'],
            'friend_discount' => ['required', 'integer', 'min:0', 'max:1000000000'], 'minimum_purchase' => ['required', 'integer', 'min:0', 'max:1000000000'],
            'credit_limit' => ['nullable', 'integer', 'min:1', 'max:1000000000'], 'expiry_days' => ['nullable', 'integer', 'min:1', 'max:36500'],
            'combine_promo' => ['required', 'boolean'], 'program_ids' => ['required', 'array'], 'program_ids.*' => ['integer', 'distinct', 'exists:programs,id'],
            'reason' => ['required', 'string', 'max:2000'], 'confirmed' => ['accepted'],
        ]);
        DB::transaction(function () use ($data, $credits) {
            $before = (array) $credits->policy(true);
            $reason = $data['reason']; unset($data['reason'], $data['confirmed']);
            $data['program_ids'] = json_encode($data['program_ids'], JSON_THROW_ON_ERROR);
            DB::table('referral_credit_settings')->where('id', 1)->update($data + ['updated_at' => now()]);
            app(AffiliateWithdrawalService::class)->audit('credit.policy_updated', '1', ['before' => $before, 'after' => $data, 'reason' => $reason]);
        });
        return response()->json(['data' => $credits->policy()]);
    }

    public function control(Request $request, Invoice $invoice, ReferralCreditService $credits)
    {
        $data = $request->validate(['action' => ['required', Rule::in(['hold', 'reverse', 'cancel'])], 'reason' => ['required', 'string', 'max:2000'], 'confirmed' => ['accepted']]);
        $credits->control($invoice, $data['action'], $data['reason']);
        return response()->json(['data' => ['status' => 'recorded']]);
    }

    public function code(Request $request, Affiliate $affiliate, AffiliateService $affiliates)
    {
        $data = $request->validate(['code' => ['required', 'string', 'max:255'], 'status' => ['required', Rule::in(['active', 'inactive'])], 'reason' => ['required', 'string', 'max:2000'], 'confirmed' => ['accepted']]);
        $result = DB::transaction(function () use ($affiliate, $data, $affiliates) {
            app(ReferralCreditService::class)->policy(true);
            $affiliate = Affiliate::whereKey($affiliate->id)->lockForUpdate()->firstOrFail();
            $before = $affiliate->only(['code', 'status']);
            $updated = $affiliates->save(['code' => $data['code'], 'status' => $data['status']], $affiliate);
            app(AffiliateWithdrawalService::class)->audit('credit.code_updated', (string) $affiliate->id, ['reason' => $data['reason'], 'before' => $before, 'after' => $updated->only(['code', 'status'])]);
            return $updated;
        });
        return response()->json(['data' => $result->only(['id', 'code', 'status'])]);
    }
}
