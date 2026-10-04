<?php

namespace App\Http\Controllers;

use App\Models\Affiliate;
use App\Models\Commission;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class AdminPayoutController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['data' => DB::table('payouts')->orderByDesc('id')->get()->map(function ($row) {
            $row->commission_ids = DB::table('payout_commissions')->where('payout_id', $row->id)->orderBy('commission_id')->pluck('commission_id');
            $row->status = 'paid';

            return $row;
        })]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'request_key' => ['required', 'uuid'],
            'affiliate_id' => ['required', 'integer', 'exists:affiliates,id'],
            'commission_ids' => ['required', 'array', 'min:1'],
            'commission_ids.*' => ['required', 'integer', 'distinct', 'exists:commissions,id'],
            'paid_at' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
            'note' => ['nullable', 'string', 'max:5000'],
            'amount' => ['prohibited'], 'status' => ['prohibited'], 'balance' => ['prohibited'],
        ]);
        $data['affiliate_id'] = (int) $data['affiliate_id'];
        $data['commission_ids'] = array_map('intval', $data['commission_ids']);
        sort($data['commission_ids']);
        $result = DB::transaction(function () use ($data) {
            Affiliate::whereKey($data['affiliate_id'])->lockForUpdate()->firstOrFail();
            $existing = DB::table('payouts')->where('request_key', $data['request_key'])->first();
            if ($existing) {
                $ids = DB::table('payout_commissions')->where('payout_id', $existing->id)->orderBy('commission_id')->pluck('commission_id')->all();
                if ($existing->affiliate_id !== $data['affiliate_id'] || $ids !== $data['commission_ids'] || $existing->paid_at !== $data['paid_at'] || $existing->note !== ($data['note'] ?? null)) {
                    throw ValidationException::withMessages(['request_key' => 'Request key already belongs to a different settlement.']);
                }

                return ['id' => $existing->id, 'amount' => (int) $existing->amount, 'status' => 'paid'];
            }
            $commissions = Commission::whereIn('id', $data['commission_ids'])->orderBy('id')->lockForUpdate()->get();
            foreach ($commissions as $commission) {
                if ($commission->affiliate_id !== $data['affiliate_id'] || $commission->status !== 'approved' || DB::table('payout_commissions')->where('commission_id', $commission->id)->exists()) {
                    throw ValidationException::withMessages(['commission_ids' => 'Select only unsettled approved commissions for this affiliate.']);
                }
            }
            $amount = $commissions->sum('amount');
            $id = DB::table('payouts')->insertGetId(['affiliate_id' => $data['affiliate_id'], 'request_key' => $data['request_key'], 'amount' => $amount, 'paid_at' => $data['paid_at'], 'note' => $data['note'] ?? null, 'created_at' => now(), 'updated_at' => now()]);
            foreach ($commissions as $commission) {
                DB::table('payout_commissions')->insert(['payout_id' => $id, 'commission_id' => $commission->id]);
                $commission->update(['status' => 'paid', 'paid_at' => $data['paid_at']]);
            }

            return ['id' => $id, 'amount' => $amount, 'status' => 'paid'];
        });

        return response()->json(['data' => $result]);
    }
}
