<?php

namespace Tests\Feature;

use App\Models\AccessGrant;
use App\Models\Program;
use App\Models\User;
use App\Services\ChapterAccessPolicy;
use App\Services\EntitlementService;
use Database\Seeders\ProgramOfferSeeder;
use Database\Seeders\ProgramSeeder;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ChapterAccessPolicyTest extends TestCase
{
    use DatabaseTransactions;

    private User $student;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('hiru_academy_test', DB::connection()->getDatabaseName());
        $this->travelTo(now()->setDate(2026, 10, 4)->setTime(12, 0));
        $this->seed([ProgramSeeder::class, ProgramOfferSeeder::class]);
        $this->student = User::create([
            'name' => 'student',
            'email' => 'student@chapter-access.example.test',
            'whatsapp' => '6281234567891',
            'password' => 'Password123!',
        ]);
        $this->student->role = 'student';
        $this->student->account_status = 'active';
        $this->student->save();
    }

    protected function tearDown(): void
    {
        $this->travelBack();
        parent::tearDown();
    }

    private function grant(string $code, string $plan = 'lms', array $overrides = []): AccessGrant
    {
        return AccessGrant::create(array_replace([
            'user_id' => $this->student->id,
            'program_id' => Program::where('code', $code)->firstOrFail()->id,
            'plan_code' => $plan,
            'starts_at' => '2026-10-01',
            'ends_at' => '2026-10-31',
            'status' => 'active',
        ], $overrides));
    }

    private function assertAccess(array $full = []): void
    {
        $policy = app(ChapterAccessPolicy::class);
        foreach (['dasar', 'n5', 'n4', 'n3', 'n2', 'n1', 'ssw-food', 'interview'] as $code) {
            $preview = ! in_array($code, ['ssw-food', 'interview'], true);
            $this->assertSame($preview || in_array($code, $full, true), $policy->canAccessChapter($this->student, $code, 1), $code.' chapter 1');
            foreach ([2, 1000] as $number) {
                $this->assertSame(in_array($code, $full, true), $policy->canAccessChapter($this->student, $code, $number), $code.' chapter '.$number);
            }
        }
    }

    public function test_free_access_is_chapter_one_only_except_standalone(): void
    {
        $this->assertAccess();
    }

    public static function paidJlpt(): array
    {
        return [
            'n5 lms' => ['n5', 'lms', ['dasar', 'n5']],
            'n5 sensei' => ['n5', 'sensei', ['dasar', 'n5']],
            'n4 lms' => ['n4', 'lms', ['dasar', 'n5', 'n4']],
            'n4 sensei' => ['n4', 'sensei', ['dasar', 'n5', 'n4']],
            'n1 lms' => ['n1', 'lms', ['dasar', 'n5', 'n4', 'n3', 'n2', 'n1']],
            'n1 sensei' => ['n1', 'sensei', ['dasar', 'n5', 'n4', 'n3', 'n2', 'n1']],
        ];
    }

    #[DataProvider('paidJlpt')]
    public function test_paid_learning_access(string $code, string $plan, array $full): void
    {
        $this->grant($code, $plan);
        $this->assertAccess($full);
    }

    public static function standalonePrograms(): array
    {
        return [['ssw-food'], ['interview']];
    }

    #[DataProvider('standalonePrograms')]
    public function test_standalone_grant_does_not_elevate_other_programs(string $code): void
    {
        $this->grant($code);
        $this->assertAccess([$code]);
    }

    public static function ignoredGrants(): array
    {
        return [
            'future' => [['starts_at' => '2026-10-05']],
            'expired' => [['ends_at' => '2026-10-03']],
            'inactive' => [['status' => 'inactive']],
        ];
    }

    #[DataProvider('ignoredGrants')]
    public function test_non_qualifying_grants_do_not_elevate_access(array $overrides): void
    {
        $this->grant('n1', 'sensei', $overrides);
        $this->grant('ssw-food', overrides: $overrides);
        $this->grant('interview', overrides: $overrides);
        $this->assertAccess();
    }

    public static function inclusiveDates(): array
    {
        return [
            'start today' => [['starts_at' => '2026-10-04']],
            'end today' => [['ends_at' => '2026-10-04']],
        ];
    }

    #[DataProvider('inclusiveDates')]
    public function test_date_boundaries_qualify_for_full_chapter_access(array $overrides): void
    {
        $this->grant('n4', overrides: $overrides);
        $this->assertAccess(['dasar', 'n5', 'n4']);
    }

    public function test_multiple_grants_use_entitlement_union(): void
    {
        $this->grant('n4');
        $this->grant('n3', 'sensei');
        $this->grant('ssw-food');
        $this->grant('interview');
        $this->assertAccess(['dasar', 'n5', 'n4', 'n3', 'ssw-food', 'interview']);
    }

    public static function invalidOrdinals(): array
    {
        return [[0], [-1]];
    }

    #[DataProvider('invalidOrdinals')]
    public function test_invalid_chapter_is_denied_even_with_full_access(int $number): void
    {
        $this->grant('n1');
        $this->assertFalse(app(ChapterAccessPolicy::class)->canAccessChapter($this->student, 'n1', $number));
    }

    public function test_unknown_program_is_denied(): void
    {
        $this->grant('n1');
        $policy = app(ChapterAccessPolicy::class);
        $this->assertFalse($policy->canAccessChapter($this->student, 'unknown', 1));
        $this->assertFalse($policy->canAccessChapter($this->student, 'unknown', 2));
    }

    public function test_policy_uses_learning_projection_without_recomputing_grants_or_replay(): void
    {
        $this->grant('n1', 'sensei');
        $service = $this->mock(EntitlementService::class);
        $service->shouldReceive('effectiveAccess')->with($this->student)->times(3)->andReturn([
            'learning' => ['n1' => 'none', 'ssw-food' => 'preview', 'n5' => 'full'],
            'replay_levels' => ['n1'],
            'source_grants' => [],
        ]);
        $policy = app(ChapterAccessPolicy::class);
        $this->assertFalse($policy->canAccessChapter($this->student, 'n1', 1));
        $this->assertTrue($policy->canAccessChapter($this->student, 'ssw-food', 1));
        $this->assertTrue($policy->canAccessChapter($this->student, 'n5', 2));
    }

    public function test_policy_is_read_only_and_recomputes_after_grant_changes(): void
    {
        $grant = $this->grant('n4', 'sensei');
        $before = AccessGrant::orderBy('id')->get()->toArray();
        $userBefore = $this->student->fresh()->getAttributes();
        DB::enableQueryLog();
        DB::flushQueryLog();
        try {
            $this->assertAccess(['dasar', 'n5', 'n4']);
            $queries = DB::getQueryLog();
        } finally {
            DB::disableQueryLog();
        }
        foreach ($queries as $query) {
            $this->assertMatchesRegularExpression('/^\s*select\b/i', $query['query']);
        }
        $this->assertSame($before, AccessGrant::orderBy('id')->get()->toArray());
        $this->assertSame($userBefore, $this->student->fresh()->getAttributes());
        $this->assertDatabaseCount('access_grants', 1);
        $grant->update(['status' => 'inactive']);
        $this->assertAccess();
    }
}
