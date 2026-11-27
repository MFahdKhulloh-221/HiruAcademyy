<?php

namespace App\Services;

use App\Models\Affiliate;
use App\Models\Invoice;
use App\Models\InvoiceAttribution;
use App\Models\ProgramOffer;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ReferralCreditService
{
    // ponytail: serialize credit operations on one policy row; use ordered wallet locks when volume requires it.
    public function policy(bool $lock = false): object
    {
        $query = DB::table('referral_credit_settings')->where('id', 1);
        $policy = ($lock ? $query->lockForUpdate() : $query)->firstOrFail();
        $policy->program_ids = json_decode($policy->program_ids, true, 512, JSON_THROW_ON_ERROR);

        return $policy;
    }

    private function fail(string $message): never
    {
        throw ValidationException::withMessages(['credit' => $message]);
    }

    public function creditRows(?int $userId = null): \Illuminate\Support\Collection
    {
        $uses = DB::table('referral_credit_uses')->select('credit_id')
            ->selectRaw("SUM(CASE WHEN status = 'reserved' THEN amount ELSE 0 END) AS reserved")
            ->selectRaw("SUM(CASE WHEN status = 'used' THEN amount ELSE 0 END) AS used")->groupBy('credit_id');
        return DB::table('referral_learning_credits as c')->leftJoinSub($uses, 'u', 'u.credit_id', '=', 'c.id')
            ->join('users as owner', 'owner.id', '=', 'c.user_id')->join('invoices as i', 'i.id', '=', 'c.source_invoice_id')
            ->select('c.*', 'c.user_id as owner_id', 'owner.name', 'i.reference as source_reference')->selectRaw('COALESCE(u.reserved, 0) AS reserved, COALESCE(u.used, 0) AS used')
            ->when($userId !== null, fn ($query) => $query->where('c.user_id', $userId))->orderBy('c.id')->get()->map(function ($credit) {
                $credit->amount = (int) $credit->amount;
                $credit->reserved = (int) $credit->reserved;
                $credit->used = (int) $credit->used;
                $credit->effective_status = $credit->status === 'available' && $credit->expires_at && now()->gte($credit->expires_at) ? 'expired' : $credit->status;
                $credit->available = $credit->effective_status === 'available' ? max(0, $credit->amount - $credit->reserved - $credit->used) : 0;
                if ($credit->effective_status === 'available' && $credit->available === 0) {
                    $credit->effective_status = $credit->used >= $credit->amount ? 'used' : ($credit->reserved > 0 ? 'reserved' : 'available');
                }
                return $credit;
            });
    }

    public function balances(int $userId): array
    {
        return $this->creditRows($userId)->map(fn ($credit) => ['id' => $credit->id, 'amount' => $credit->available])->all();
    }

    public function allowedActions(Invoice $invoice): array
    {
        if (DB::table('referral_invoice_controls')->where('invoice_id', $invoice->id)->where('status', 'cancelled')->exists()) {
            return [];
        }
        $spent = DB::table('referral_credit_uses as u')->join('referral_learning_credits as c', 'c.id', '=', 'u.credit_id')
            ->where('c.source_invoice_id', $invoice->id)->where('u.status', 'used')->sum('u.amount');
        $hasCredit = DB::table('referral_learning_credits')->where('source_invoice_id', $invoice->id)->exists();
        return array_values(array_filter(['hold', $hasCredit && $spent == 0 ? 'reverse' : null, in_array($invoice->status, ['draft', 'awaiting_payment'], true) ? 'cancel' : null]));
    }

    public function price(User $user, ProgramOffer $offer, array $metadata): array
    {
        $policy = $this->policy();
        $offer->load('promotions');
        $price = $offer->pricing();
        $eligible = in_array($offer->plan_code, ['lms', 'sensei'], true);
        $ids = $policy->program_ids;
        $eligible = $eligible && (! $ids || in_array($offer->program_id, $ids, true));
        $code = $metadata['referral_code'] ?? null;
        $affiliate = null;
        if ($code) {
            $affiliate = app(AffiliateService::class)->validateReferral($user, $code);
        } elseif ($user->referrer_affiliate_id && $policy->enabled) {
            $candidate = Affiliate::whereKey($user->referrer_affiliate_id)
                ->where('user_id', '<>', $user->id)->whereHas('user', fn ($query) => $query->where('role', 'student'))->first();
            if ($candidate?->status === 'active') {
                $affiliate = app(AffiliateService::class)->validateReferral($user, $candidate->code);
            }
        }
        $first = ! Invoice::where('user_id', $user->id)->whereIn('status', ['verified', 'active'])->exists()
            && ! DB::table('referral_credit_purchases')->where('buyer_id', $user->id)->where('status', '<>', 'cancelled')->exists();
        $referral = $policy->enabled && $eligible && $affiliate && $first && $price['base_price'] >= $policy->minimum_purchase;
        $promo = $referral && ! $policy->combine_promo ? 0 : $price['discount_amount'];
        $friend = $referral ? min((int) $policy->friend_discount, $price['base_price'] - $promo) : 0;
        $available = array_sum(array_column($this->balances($user->id), 'amount'));
        $credit = ! empty($metadata['use_credit']) && $eligible
            ? min($available, $price['base_price'] - $promo - $friend, $policy->credit_limit ?? PHP_INT_MAX) : 0;

        $referralReason = match (true) {
            ! $policy->enabled => 'program_disabled',
            ! $eligible => 'offer_ineligible',
            ! $affiliate => 'no_referral',
            ! $first => 'not_first_purchase',
            $price['base_price'] < $policy->minimum_purchase => 'below_minimum_purchase',
            default => 'eligible',
        };
        $creditReason = match (true) {
            ! $eligible => 'offer_ineligible',
            $available <= 0 => 'no_available_credit',
            $price['base_price'] - $promo - $friend <= 0 => 'no_payable_balance',
            default => 'eligible',
        };
        return ['referral_eligible' => (bool) $referral, 'referral_eligibility_reason' => $referralReason,
            'credit_eligible' => $creditReason === 'eligible', 'credit_eligibility_reason' => $creditReason,
            'base_price' => $price['base_price'], 'promo_discount' => $promo, 'referral_discount' => $friend,
            'credit_discount' => $credit, 'discount_amount' => $promo + $friend + $credit,
            'discount_percent' => ($friend + $credit) === 0 ? ($promo > 0 ? $price['discount_percent'] : 0)
                : ($price['base_price'] > 0 ? round(($promo + $friend + $credit) / $price['base_price'] * 100, 2) : 0),
            'total_price' => $price['base_price'] - $promo - $friend - $credit, 'available_credit' => $available,
            'affiliate_id' => $referral ? $affiliate->id : null, 'owner_id' => $referral ? $affiliate->user_id : null,
            'policy' => (array) $policy];
    }

    public function reserve(Invoice $invoice, array $quote): void
    {
        if ($quote['affiliate_id']) {
            InvoiceAttribution::create(['invoice_id' => $invoice->id, 'affiliate_id' => $quote['affiliate_id']]);
            DB::table('referral_credit_purchases')->insert(['invoice_id' => $invoice->id, 'buyer_id' => $invoice->user_id,
                'affiliate_id' => $quote['affiliate_id'], 'owner_id' => $quote['owner_id'], 'reward' => $quote['policy']['inviter_reward'],
                'friend_discount' => $quote['referral_discount'], 'created_at' => now(), 'updated_at' => now()]);
        }
        $remaining = $quote['credit_discount'];
        foreach ($this->balances($invoice->user_id) as $credit) {
            $amount = min($remaining, $credit['amount']);
            if ($amount > 0) {
                DB::table('referral_credit_uses')->insert(['invoice_id' => $invoice->id, 'credit_id' => $credit['id'], 'amount' => $amount, 'status' => 'reserved', 'created_at' => now(), 'updated_at' => now()]);
            }
            $remaining -= $amount;
            if ($remaining === 0) {
                break;
            }
        }
        if ($remaining !== 0) {
            $this->fail('Kredit tidak mencukupi. Muat ulang tagihan.');
        }
    }

    public function assertPayable(Invoice $invoice): void
    {
        if (DB::table('referral_invoice_controls')->where('invoice_id', $invoice->id)->exists()) {
            $this->fail('Invoice ditahan atau dibatalkan oleh Admin.');
        }
        $first = DB::table('referral_credit_purchases')->where('invoice_id', $invoice->id)->where('status', 'pending')->exists();
        if ($first && Invoice::where('user_id', $invoice->user_id)->where('id', '<>', $invoice->id)->whereIn('status', ['verified', 'active'])->exists()) {
            $this->fail('Pembelian pertama telah berubah. Tahan invoice dan buat tagihan baru.');
        }
        $blocked = DB::table('referral_credit_uses as u')->join('referral_learning_credits as c', 'c.id', '=', 'u.credit_id')
            ->where('u.invoice_id', $invoice->id)->where('u.status', 'reserved')->where('c.status', '<>', 'available')->exists();
        if ($blocked) {
            $this->fail('Kredit sumber ditahan. Hubungi Admin.');
        }
    }

    public function verified(Invoice $invoice): void
    {
        $this->assertPayable($invoice);
        DB::table('referral_credit_uses')->where('invoice_id', $invoice->id)->where('status', 'reserved')->update(['status' => 'used', 'updated_at' => now()]);
        $purchase = DB::table('referral_credit_purchases')->where('invoice_id', $invoice->id)->first();
        if (! $purchase || $purchase->status !== 'pending') {
            return;
        }
        if (Invoice::where('user_id', $invoice->user_id)->where('id', '<>', $invoice->id)->whereIn('status', ['verified', 'active'])->exists()) {
            DB::table('referral_credit_purchases')->where('id', $purchase->id)->update(['status' => 'held', 'updated_at' => now()]);
            app(AffiliateWithdrawalService::class)->audit('credit.first_purchase_conflict', (string) $invoice->id);

            return;
        }
        $days = $invoice->credit_policy['expiry_days'] ?? null;
        DB::table('referral_learning_credits')->insertOrIgnore(['reference' => (string) Str::uuid(), 'user_id' => $purchase->owner_id,
            'source_invoice_id' => $invoice->id, 'amount' => $purchase->reward, 'status' => 'available',
            'expires_at' => $days ? now()->addDays($days) : null, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('referral_credit_purchases')->where('id', $purchase->id)->update(['status' => 'verified', 'updated_at' => now()]);
        app(AffiliateWithdrawalService::class)->audit('credit.issued', (string) $invoice->id);
    }

    public function control(Invoice $invoice, string $action, string $reason): void
    {
        DB::transaction(function () use ($invoice, $action, $reason) {
            $this->policy(true);
            $invoice = Invoice::whereKey($invoice->id)->lockForUpdate()->firstOrFail();
            if (DB::table('referral_invoice_controls')->where('invoice_id', $invoice->id)->where('status', 'cancelled')->exists()) {
                $this->fail('Invoice yang dibatalkan tidak dapat diubah.');
            }
            if ($action === 'cancel' && ! in_array($invoice->status, ['draft', 'awaiting_payment'], true)) {
                $this->fail('Invoice dibayar tidak boleh dibatalkan melalui kontrol kredit. Gunakan penahanan dan rekonsiliasi.');
            }
            $snapshot = fn () => [
                'invoice_status' => $invoice->status,
                'control_status' => DB::table('referral_invoice_controls')->where('invoice_id', $invoice->id)->value('status'),
                'purchase_status' => DB::table('referral_credit_purchases')->where('invoice_id', $invoice->id)->value('status'),
                'credit_status' => DB::table('referral_learning_credits')->where('source_invoice_id', $invoice->id)->value('status'),
                'reserved' => (int) DB::table('referral_credit_uses')->where('invoice_id', $invoice->id)->where('status', 'reserved')->sum('amount'),
            ];
            $before = $snapshot();
            DB::table('referral_invoice_controls')->updateOrInsert(['invoice_id' => $invoice->id], ['status' => $action === 'cancel' ? 'cancelled' : 'held', 'reason' => $reason, 'created_at' => now(), 'updated_at' => now()]);
            if ($action === 'cancel') {
                DB::table('referral_credit_uses')->where('invoice_id', $invoice->id)->where('status', 'reserved')->update(['status' => 'released', 'updated_at' => now()]);
            }
            $credit = DB::table('referral_learning_credits')->where('source_invoice_id', $invoice->id)->first();
            if ($credit) {
                $spent = DB::table('referral_credit_uses')->where('credit_id', $credit->id)->where('status', 'used')->sum('amount');
                if ($action === 'reverse' && $spent > 0) {
                    $this->fail('Kredit telah digunakan. Tahan dan rekonsiliasi; saldo tidak dikurangi otomatis.');
                }
                DB::table('referral_learning_credits')->where('id', $credit->id)->update(['status' => $action === 'reverse' ? 'reversed' : 'held', 'updated_at' => now()]);
            }
            DB::table('referral_credit_purchases')->where('invoice_id', $invoice->id)->update(['status' => $action === 'cancel' ? 'cancelled' : 'held', 'updated_at' => now()]);
            app(AffiliateWithdrawalService::class)->audit('credit.'.$action, (string) $invoice->id, ['reason' => $reason, 'before' => $before, 'after' => $snapshot()]);
        }, 3);
    }

    public function student(User $user): array
    {
        $affiliate = app(AffiliateService::class)->ensure($user);
        $pending = DB::table('referral_credit_purchases')->where('owner_id', $user->id)->where('status', 'pending')->sum('reward');
        $uses = DB::table('referral_credit_uses as u')->join('referral_learning_credits as c', 'c.id', '=', 'u.credit_id')->where('c.user_id', $user->id);
        $history = DB::table('referral_credit_purchases as r')->join('invoices as i', 'i.id', '=', 'r.invoice_id')->join('programs as p', 'p.id', '=', 'i.program_id')->where('r.owner_id', $user->id)
            ->select('r.id', 'r.invoice_id', 'r.created_at', 'r.reward', 'r.friend_discount', 'r.status', 'i.reference', 'p.name as program', 'i.status as payment_status')->orderByDesc('r.id')->get();
        $usage = DB::table('referral_credit_uses as u')->join('referral_learning_credits as c', 'c.id', '=', 'u.credit_id')->join('invoices as i', 'i.id', '=', 'u.invoice_id')->join('programs as p', 'p.id', '=', 'i.program_id')->where('c.user_id', $user->id)
            ->select('u.invoice_id', 'u.credit_id', 'u.amount', 'u.status', 'u.created_at', 'i.reference', 'p.name as program')->orderByDesc('u.created_at')->get();

        return ['affiliate' => [...$affiliate->only(['id', 'code', 'status']), 'name' => $user->name], 'policy' => $this->policy(),
            'programs' => DB::table('programs')->select('id', 'name')->get(),
            'totals' => ['available' => array_sum(array_column($this->balances($user->id), 'amount')), 'pending' => (int) $pending,
                'reserved' => (int) (clone $uses)->where('u.status', 'reserved')->sum('u.amount'), 'used' => (int) (clone $uses)->where('u.status', 'used')->sum('u.amount')],
            'history' => $history, 'usage' => $usage];
    }
}
