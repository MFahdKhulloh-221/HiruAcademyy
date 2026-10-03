<?php

namespace Tests\Feature;

use App\Models\AccessGrant;
use App\Models\Program;
use App\Models\User;
use App\Services\EntitlementService;
use Carbon\CarbonImmutable;
use Database\Seeders\ProgramOfferSeeder;
use Database\Seeders\ProgramSeeder;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class EffectiveAccessTest extends TestCase
{
    use DatabaseTransactions;

    private User $student;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('hiru_academy_test', DB::connection()->getDatabaseName());
        $this->travelTo(now()->setDate(2026, 10, 4)->setTime(12, 0));
        $this->seed([ProgramSeeder::class, ProgramOfferSeeder::class]);
        $this->student = $this->createUser('student', '6281234567891');
        $this->admin = $this->createUser('admin', '6281234567892', 'admin');
    }

    protected function tearDown(): void
    {
        $this->travelBack();
        parent::tearDown();
    }

    private function createUser(string $name, string $whatsapp, string $role = 'student'): User
    {
        $user = User::create([
            'name' => $name,
            'email' => $name.'@effective-access.example.test',
            'whatsapp' => $whatsapp,
            'password' => 'Password123!',
        ]);
        $user->role = $role;
        $user->account_status = 'active';
        $user->save();

        return $user->refresh();
    }

    private function grant(string $code, string $plan = 'lms', array $overrides = [], ?User $user = null): AccessGrant
    {
        return AccessGrant::create(array_replace([
            'user_id' => ($user ?? $this->student)->id,
            'program_id' => Program::where('code', $code)->firstOrFail()->id,
            'plan_code' => $plan,
            'starts_at' => '2026-10-01',
            'ends_at' => '2026-10-31',
            'status' => 'active',
        ], $overrides));
    }

    private function access(): array
    {
        return app(EntitlementService::class)->effectiveAccess($this->student);
    }

    private function expectedLearning(array $full = []): array
    {
        $learning = array_fill_keys(['dasar', 'n5', 'n4', 'n3', 'n2', 'n1'], 'preview');
        $learning += ['ssw-food' => 'none', 'interview' => 'none'];
        foreach ($full as $code) {
            $learning[$code] = 'full';
        }

        return $learning;
    }

    public function test_no_paid_grant_has_only_jlpt_preview_and_no_replay_or_standalone_access(): void
    {
        $this->assertSame([
            'learning' => $this->expectedLearning(),
            'replay_levels' => [],
            'source_grants' => [],
        ], $this->access());
    }

    public static function jlptGrants(): array
    {
        $cases = [];
        $levels = ['n5', 'n4', 'n3', 'n2', 'n1'];
        foreach ($levels as $index => $level) {
            foreach (['lms', 'sensei'] as $plan) {
                $owned = array_slice($levels, 0, $index + 1);
                $cases[$level.' '.$plan] = [$level, $plan, ['dasar', ...$owned], $plan === 'sensei' ? $owned : []];
            }
        }

        return $cases;
    }

    #[DataProvider('jlptGrants')]
    public function test_learning_and_replay_use_explicit_business_order(string $code, string $plan, array $full, array $replay): void
    {
        $grant = $this->grant($code, $plan);
        Program::where('code', $code)->update(['cumulative_rank' => 99, 'sort_order' => 99, 'family' => 'jlpt', 'status' => 'inactive']);
        $access = $this->access();
        $this->assertSame($this->expectedLearning($full), $access['learning']);
        $this->assertSame($replay, $access['replay_levels']);
        $this->assertSame([[
            'id' => $grant->id,
            'program_code' => $code,
            'plan_code' => $plan,
            'starts_at' => '2026-10-01',
            'ends_at' => '2026-10-31',
        ]], $access['source_grants']);
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
    public function test_non_qualifying_grants_are_ignored(array $overrides): void
    {
        $this->grant('n1', 'sensei', $overrides);
        $this->assertSame([
            'learning' => $this->expectedLearning(),
            'replay_levels' => [],
            'source_grants' => [],
        ], $this->access());
    }

    public static function inclusiveDates(): array
    {
        return [
            'start today' => [['starts_at' => '2026-10-04']],
            'end today' => [['ends_at' => '2026-10-04']],
            'single day' => [['starts_at' => '2026-10-04', 'ends_at' => '2026-10-04']],
        ];
    }

    #[DataProvider('inclusiveDates')]
    public function test_date_boundaries_are_inclusive(array $overrides): void
    {
        $this->grant('n5', 'sensei', $overrides);
        $this->assertSame($this->expectedLearning(['dasar', 'n5']), $this->access()['learning']);
        $this->assertSame(['n5'], $this->access()['replay_levels']);
        $this->assertCount(1, $this->access()['source_grants']);
    }

    public function test_application_calendar_date_not_utc_date_controls_qualification(): void
    {
        config(['app.timezone' => 'Asia/Jakarta']);
        $this->travelTo(CarbonImmutable::parse('2026-10-03T18:00:00Z'));
        $this->grant('n5', overrides: ['starts_at' => '2026-10-04', 'ends_at' => '2026-10-04']);
        $this->grant('n1', 'sensei', ['ends_at' => '2026-10-03']);
        $this->assertSame($this->expectedLearning(['dasar', 'n5']), $this->access()['learning']);
        $this->assertSame([], $this->access()['replay_levels']);
        $this->assertCount(1, $this->access()['source_grants']);
    }

    public static function standalonePrograms(): array
    {
        return [['ssw-food'], ['interview']];
    }

    #[DataProvider('standalonePrograms')]
    public function test_standalone_grant_never_elevates_jlpt_or_replay(string $code): void
    {
        $this->grant($code);
        $this->assertSame($this->expectedLearning([$code]), $this->access()['learning']);
        $this->assertSame([], $this->access()['replay_levels']);
    }

    public static function unions(): array
    {
        return [
            'sensei higher' => [[['n4', 'lms'], ['n3', 'sensei']], ['dasar', 'n5', 'n4', 'n3'], ['n5', 'n4', 'n3']],
            'lms higher' => [[['n3', 'lms'], ['n4', 'sensei']], ['dasar', 'n5', 'n4', 'n3'], ['n5', 'n4']],
            'reverse insertion and duplicate' => [[['n3', 'sensei'], ['n4', 'lms'], ['n3', 'sensei']], ['dasar', 'n5', 'n4', 'n3'], ['n5', 'n4', 'n3']],
            'standalone coexistence' => [[['ssw-food', 'lms'], ['n5', 'sensei'], ['interview', 'lms']], ['dasar', 'n5', 'ssw-food', 'interview'], ['n5']],
        ];
    }

    #[DataProvider('unions')]
    public function test_multiple_grants_form_union(array $grants, array $full, array $replay): void
    {
        foreach ($grants as [$code, $plan]) {
            $this->grant($code, $plan);
        }
        $access = $this->access();
        $this->assertSame($this->expectedLearning($full), $access['learning']);
        $this->assertSame($replay, $access['replay_levels']);
        $this->assertCount(count($grants), $access['source_grants']);
    }

    public function test_student_endpoint_uses_only_authenticated_user_ignoring_claimed_authority(): void
    {
        $other = $this->createUser('other', '6281234567893');
        $otherGrant = $this->grant('n1', 'sensei', user: $other);
        $ownGrant = $this->grant('n5');
        $response = $this->actingAs($this->student)
            ->getJson('/api/student/access?user_id='.$other->id.'&membership=sensei&level=n1')
            ->assertOk()->assertExactJson(['data' => $this->access()]);
        $this->assertSame([$ownGrant->id], array_column($response->json('data.source_grants'), 'id'));
        $this->assertNotContains($otherGrant->id, array_column($response->json('data.source_grants'), 'id'));
    }

    public function test_guest_is_denied_both_endpoints(): void
    {
        $this->getJson('/api/student/access')->assertUnauthorized();
        $this->getJson('/api/admin/users/'.$this->student->id.'/effective-access')->assertUnauthorized();
    }

    public function test_admin_is_denied_student_endpoint(): void
    {
        $this->actingAs($this->admin)->getJson('/api/student/access')->assertForbidden();
    }

    public function test_student_is_denied_admin_effective_endpoint(): void
    {
        $this->actingAs($this->student)->getJson('/api/admin/users/'.$this->student->id.'/effective-access')->assertForbidden();
    }

    public function test_inactive_accounts_are_denied(): void
    {
        foreach ([$this->student, $this->admin] as $user) {
            $user->account_status = 'inactive';
            $user->save();
            $url = $user->role === 'student' ? '/api/student/access' : '/api/admin/users/'.$this->student->id.'/effective-access';
            $this->actingAs($user)->getJson($url)->assertUnauthorized();
        }
    }

    public function test_admin_inspects_student_using_same_projection_and_cannot_target_admin(): void
    {
        $this->grant('n3', 'sensei');
        $this->actingAs($this->admin)->getJson('/api/admin/users/'.$this->student->id.'/effective-access')
            ->assertOk()->assertExactJson(['data' => $this->access()]);
        $this->getJson('/api/admin/users/0/effective-access')->assertNotFound();
        $this->getJson('/api/admin/users/'.$this->admin->id.'/effective-access')
            ->assertUnprocessable()->assertJsonValidationErrors('user_id');
    }

    public function test_projection_is_read_only_and_recomputed_after_source_changes(): void
    {
        $grant = $this->grant('n4', 'sensei');
        $before = AccessGrant::orderBy('id')->get()->toArray();
        $userBefore = $this->student->fresh()->getAttributes();
        DB::enableQueryLog();
        DB::flushQueryLog();
        $this->access();
        $this->actingAs($this->student)->getJson('/api/student/access')->assertOk();
        $this->actingAs($this->admin)->getJson('/api/admin/users/'.$this->student->id.'/effective-access')->assertOk();
        $queries = DB::getQueryLog();
        DB::disableQueryLog();
        foreach ($queries as $query) {
            $this->assertDoesNotMatchRegularExpression('/^\s*(insert|update|delete|create|alter|drop)\b/i', $query['query']);
        }
        $this->assertSame($before, AccessGrant::orderBy('id')->get()->toArray());
        $this->assertSame($userBefore, $this->student->fresh()->getAttributes());
        $this->assertDatabaseCount('access_grants', 1);
        $grant->update(['status' => 'inactive']);
        $this->assertSame($this->expectedLearning(), $this->access()['learning']);
        $this->assertSame([], $this->access()['replay_levels']);
    }
}
