<?php

namespace Tests\Unit;

use App\Models\AccessGrant;
use App\Models\Program;
use App\Models\ProgramOffer;
use App\Models\Promotion;
use App\Models\User;
use App\Services\EntitlementService;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Carbon;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class ProgramOfferPricingBoundaryTest extends TestCase
{
    private mixed $previousNow;

    protected function setUp(): void
    {
        parent::setUp();
        $this->previousNow = Carbon::getTestNow();
        Carbon::setTestNow(Carbon::parse('2026-10-27 23:59:59', 'Asia/Jakarta'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow($this->previousNow);
        parent::tearDown();
    }

    public static function promotionWindows(): array
    {
        return [
            'future' => ['active', '2026-10-28', null, false],
            'expired' => ['active', null, '2026-10-26', false],
            'inactive' => ['inactive', null, null, false],
            'start inclusive' => ['active', '2026-10-27', null, true],
            'end inclusive' => ['active', null, '2026-10-27', true],
            'single day inclusive' => ['active', '2026-10-27', '2026-10-27', true],
            'unbounded' => ['active', null, null, true],
        ];
    }

    #[DataProvider('promotionWindows')]
    public function test_pricing_uses_calendar_boundaries_and_only_exposes_current_promotion_dates(string $status, ?string $start, ?string $end, bool $eligible): void
    {
        $offer = $this->offer(101, 'active', [new Promotion([
            'status' => $status, 'discount_percent' => 50, 'starts_at' => $start, 'ends_at' => $end,
        ])]);
        $this->assertSame([
            'base_price' => 101,
            'promotion' => $eligible ? ['discount_percent' => 50.0, 'starts_at' => $start, 'ends_at' => $end] : null,
            'discount_percent' => $eligible ? 50.0 : 0,
            'discount_amount' => $eligible ? 51 : 0,
            'effective_price' => $eligible ? 50 : 101,
        ], $offer->pricing());
    }

    public function test_inactive_unpriced_and_zero_offers_keep_exact_price_semantics(): void
    {
        $promotion = new Promotion(['status' => 'active', 'discount_percent' => 50]);
        foreach ([[101, 'inactive', null, 0, 101], [null, 'active', null, 0, null], [0, 'active', ['discount_percent' => 50.0, 'starts_at' => null, 'ends_at' => null], 0, 0]] as [$base, $status, $promo, $discount, $effective]) {
            $pricing = $this->offer($base, $status, [$promotion])->pricing();
            $this->assertSame($promo, $pricing['promotion']);
            $this->assertSame($discount, $pricing['discount_amount']);
            $this->assertSame($effective, $pricing['effective_price']);
        }
    }

    public function test_promotions_stay_on_their_loaded_offer_and_skip_expired_rows(): void
    {
        $expired = new Promotion(['status' => 'active', 'discount_percent' => 90, 'ends_at' => '2026-10-26']);
        $current = new Promotion(['status' => 'active', 'discount_percent' => 25]);
        $ssw = $this->offer(100, 'active', [$expired, $current]);
        $ssw->setRelation('program', new Program(['code' => 'ssw-food']));
        $interview = $this->offer(100, 'active', []);
        $interview->setRelation('program', new Program(['code' => 'interview']));
        $this->assertSame(75, $ssw->pricing()['effective_price']);
        $this->assertSame(100, $interview->pricing()['effective_price']);
        $this->assertNull($interview->pricing()['promotion']);
    }

    public function test_ssw_and_interview_grants_do_not_unlock_each_other_or_jlpt(): void
    {
        $user = (new User)->forceFill(['role' => 'student']);
        foreach (['ssw-food', 'interview'] as $code) {
            $grant = (new AccessGrant)->forceFill(['id' => 1, 'plan_code' => 'lms', 'starts_at' => '2026-10-01', 'ends_at' => '2026-11-01']);
            $grant->setRelation('program', new Program(['code' => $code, 'status' => 'active']));
            $access = (new EntitlementService)->project($user, [$grant]);
            $this->assertSame('full', $access['learning'][$code]);
            $this->assertSame('none', $access['learning'][$code === 'ssw-food' ? 'interview' : 'ssw-food']);
            foreach (['dasar', 'n5', 'n4', 'n3', 'n2', 'n1'] as $level) {
                $this->assertSame('preview', $access['learning'][$level]);
            }
            $this->assertSame([], $access['replay_levels']);
        }
    }

    private function offer(?int $price, string $status, array $promotions): ProgramOffer
    {
        return (new ProgramOffer(['base_price' => $price, 'status' => $status]))
            ->setRelation('promotions', new Collection($promotions));
    }
}
