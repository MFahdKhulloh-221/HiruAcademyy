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
        return response()->json(['data' => [
            'policy' => $credits->policy(), 'programs' => DB::table('programs')->select('id', 'name')->get(),
            'codes' => DB::table('affiliates')->select('id', 'user_id', 'name', 'code', 'status')->orderByDesc('id')->get(),
            'history' => DB::table('referral_credit_purchases as r')->join('invoices as i', 'i.id', '=', 'r.invoice_id')->join('programs as p', 'p.id', '=', 'i.program_id')->select('r.*', 'i.reference', 'i.status as payment_status', 'p.name as program')->orderByDesc('r.id')->get(),
            'credits' => DB::table('referral_learning_credits')->orderByDesc('id')->get(),
            'uses' => DB::table('referral_credit_uses')->get(),
            'audit' => DB::table('affiliate_audits')->orderByDesc('id')->limit(100)->get(),
            'totals' => ['owners' => Affiliate::whereNotNull('user_id')->count(), 'successful' => DB::table('referral_credit_purchases')->where('status', 'verified')->count(),
                'issued' => (int) DB::table('referral_learning_credits')->sum('amount'),
                'used' => (int) DB::table('referral_credit_uses')->where('status', 'used')->sum('amount'),
                'available' => Affiliate::whereNotNull('user_id')->get()->sum(fn ($a) => array_sum(array_column($credits->balances($a->user_id), 'amount')))],
        ]])->header('Cache-Control', 'no-store');
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
            $updated = $affiliates->save(['code' => $data['code'], 'status' => $data['status']], $affiliate);
            app(AffiliateWithdrawalService::class)->audit('credit.code_updated', (string) $affiliate->id, ['reason' => $data['reason']]);
            return $updated;
        });
        return response()->json(['data' => $result->only(['id', 'code', 'status'])]);
    }
}
