<?php

namespace App\Http\Controllers;

use App\Models\Affiliate;
use App\Models\Commission;
use App\Services\AffiliateService;
use App\Services\AffiliateWithdrawalService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

class AffiliateWithdrawalController extends Controller
{
    public function validateReferral(Request $request, AffiliateService $service)
    {
        $affiliate = $service->validateReferral($request->user(), $request->input('code'));
        return response()->json(['data' => ['code' => $affiliate->code, 'valid' => true]]);
    }

    public function store(Request $request, AffiliateWithdrawalService $service)
    {
        return response()->json(['data' => $service->request($request->user(), $request->all())]);
    }

    public function index(AffiliateWithdrawalService $service)
    {
        return response()->json(['data' => DB::table('affiliate_withdrawals as w')->join('affiliates as a', 'a.id', '=', 'w.affiliate_id')->select('w.*', 'a.name')->orderByDesc('w.id')->get()->map(fn ($row) => $service->publicRow($row))]);
    }

    public function destination(int $withdrawal, AffiliateWithdrawalService $service)
    {
        $row = DB::table('affiliate_withdrawals')->find($withdrawal);
        abort_unless($row, 404);
        $service->audit('withdrawal.destination_viewed', (string) $withdrawal);
        return response()->json(['data' => json_decode(Crypt::decryptString($row->destination), true, 512, JSON_THROW_ON_ERROR)])->header('Cache-Control', 'no-store');
    }

    public function update(Request $request, int $withdrawal, AffiliateWithdrawalService $service)
    {
        return response()->json(['data' => $service->transition($withdrawal, $request->all())]);
    }

    public function audits()
    {
        return response()->json(['data' => DB::table('affiliate_audits')->orderByDesc('id')->limit(100)->get()->map(function ($row) {
            $row->detail = json_decode($row->detail, true, 512, JSON_THROW_ON_ERROR);
            return $row;
        })])->header('Cache-Control', 'no-store');
    }

    public function settings(AffiliateWithdrawalService $service)
    {
        return response()->json(['data' => $service->settings()]);
    }

    public function saveSettings(Request $request, AffiliateWithdrawalService $service)
    {
        $data = $request->validate([
            'enabled' => ['required', 'boolean'], 'withdrawals_enabled' => ['required', 'boolean'],
            'rate' => ['nullable', 'numeric', 'between:0,100'], 'waiting_days' => ['nullable', 'integer', 'between:0,3650'],
            'minimum' => ['nullable', 'integer', 'min:1', 'max:9007199254740991'], 'fee' => ['nullable', 'integer', 'min:0', 'max:9007199254740991'],
        ]);
        if ($data['withdrawals_enabled']) {
            foreach (['minimum', 'fee', 'waiting_days'] as $key) {
                if (! isset($data[$key])) throw \Illuminate\Validation\ValidationException::withMessages([$key => 'Lengkapi kebijakan sebelum mengaktifkan pencairan.']);
            }
        }
        DB::transaction(function () use ($data, $service) {
            $before = DB::table('affiliate_settings')->where('id', 1)->lockForUpdate()->firstOrFail();
            DB::table('affiliate_settings')->where('id', 1)->update($data + ['updated_at' => now()]);
            $service->audit('affiliate.settings_updated', '1', ['before' => $before, 'after' => $data]);
        });
        return $this->settings($service);
    }

    public function hold(Request $request, Commission $commission, AffiliateWithdrawalService $service)
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:2000']]);
        DB::transaction(function () use ($request, $commission, $data, $service) {
            Affiliate::whereKey($commission->affiliate_id)->lockForUpdate()->firstOrFail();
            DB::table('commission_holds')->insertOrIgnore(['commission_id' => $commission->id, 'actor_id' => $request->user()->id, 'reason' => $data['reason'], 'created_at' => now()]);
            $ids = DB::table('affiliate_withdrawal_allocations')->where('commission_id', $commission->id)->pluck('withdrawal_id');
            DB::table('affiliate_withdrawals')->whereIn('id', $ids)->whereIn('status', ['pending', 'approved', 'processing'])->update(['status' => 'reconciliation', 'reason' => $data['reason'], 'updated_at' => now()]);
            $service->audit($commission->status === 'paid' ? 'commission.paid_adjustment_required' : 'commission.held', (string) $commission->id, $data);
        });
        return response()->json(['data' => ['status' => 'held']]);
    }
}
