<?php

namespace Tests\Unit;

use App\Models\Chapter;
use App\Models\Program;
use App\Models\TryOut;
use App\Models\User;
use App\Services\ChapterAccessPolicy;
use App\Services\EntitlementService;
use App\Services\LearningProgressService;
use App\Services\TryOutAttemptService;
use App\Services\TryOutService;
use Illuminate\Config\Repository;
use Illuminate\Container\Container;
use Illuminate\Database\ConnectionResolver;
use Illuminate\Database\Eloquent\Model as EloquentModel;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\PostgresConnection;
use Illuminate\Support\Carbon;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpKernel\Exception\HttpException;

final class InactiveProgramEntitlementTest extends TestCase
{
    private Container $previousContainer;

    private mixed $previousResolver;

    private mixed $previousNow;

    private PostgresConnection $connection;

    private array $grants = [];

    private array $programs = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->previousContainer = Container::getInstance();
        $this->previousResolver = EloquentModel::getConnectionResolver();
        $this->previousNow = Carbon::getTestNow();
        Carbon::setTestNow(Carbon::parse('2026-10-28 12:00:00', 'Asia/Jakarta'));
        $container = new class extends Container
        {
            public function abort($code, $message = '', array $headers = []): never
            {
                throw new HttpException($code, $message, null, $headers);
            }
        };
        $container->instance('config', new Repository(['app' => ['timezone' => 'Asia/Jakarta']]));
        Container::setInstance($container);
        $this->connection = Mockery::mock(PostgresConnection::class)->makePartial();
        $this->connection->useDefaultQueryGrammar();
        $this->connection->useDefaultPostProcessor();
        $resolver = new ConnectionResolver(['entitlement-test' => $this->connection]);
        $resolver->setDefaultConnection('entitlement-test');
        EloquentModel::setConnectionResolver($resolver);
        $this->programs = [
            ['id' => 9, 'code' => 'n5', 'status' => 'inactive', 'family' => 'jlpt'],
            ['id' => 10, 'code' => 'ssw-food', 'status' => 'inactive', 'family' => 'ssw'],
        ];
    }

    protected function tearDown(): void
    {
        try {
            Mockery::close();
        } finally {
            if ($this->previousResolver) {
                EloquentModel::setConnectionResolver($this->previousResolver);
            } else {
                EloquentModel::unsetConnectionResolver();
            }
            Container::setInstance($this->previousContainer);
            Carbon::setTestNow($this->previousNow);
            parent::tearDown();
        }
    }

    public function test_real_entitlement_query_keeps_inactive_purchase_and_excludes_invalid_grants(): void
    {
        $this->grants = [
            $this->grant(1),
            $this->grant(2, ['ends_at' => '2026-10-27']),
            $this->grant(3, ['status' => 'revoked']),
            $this->grant(4, ['starts_at' => '2026-10-29']),
            $this->grant(5, ['user_id' => 8]),
        ];
        $this->fakeReads();

        $access = (new EntitlementService)->effectiveAccess($this->student());

        $this->assertSame('full', $access['learning']['n5']);
        $this->assertSame('full', $access['learning']['dasar']);
        $this->assertSame('preview', $access['learning']['n4']);
        $this->assertSame('none', $access['learning']['ssw-food']);
        $this->assertSame([1], array_column($access['source_grants'], 'id'));
        $this->assertSame(['n5'], $access['replay_levels']);
    }

    public static function chapterCases(): array
    {
        return [
            'old purchaser inactive full' => ['inactive', 'published', 2, 'valid', true],
            'active full' => ['active', 'published', 2, 'valid', true],
            'inactive no grant' => ['inactive', 'published', 2, 'none', false],
            'inactive preview chapter one' => ['inactive', 'published', 1, 'none', false],
            'active preview chapter one' => ['active', 'published', 1, 'none', true],
            'inactive expired' => ['inactive', 'published', 1, 'expired', false],
            'inactive revoked' => ['inactive', 'published', 1, 'revoked', false],
            'inactive draft full' => ['inactive', 'draft', 2, 'valid', false],
            'active draft full' => ['active', 'draft', 2, 'valid', false],
            'unrelated chapter full' => ['inactive', 'published', 2, 'unrelated', false],
        ];
    }

    #[DataProvider('chapterCases')]
    public function test_runtime_learning_guard_uses_real_entitlement_and_policy(
        string $programStatus,
        string $chapterStatus,
        int $chapterNumber,
        string $grantState,
        bool $allowed,
    ): void {
        $this->programs[0]['status'] = $programStatus;
        if ($grantState !== 'none') {
            $this->grants = [$this->grant(1, match ($grantState) {
                'expired' => ['ends_at' => '2026-10-27'],
                'revoked' => ['status' => 'revoked'],
                default => [],
            })];
        }
        $this->fakeReads();
        // Refresh is mocked; authorization, query construction, hydration and projection are real.
        $program = Mockery::mock(Program::class)->makePartial();
        $program->forceFill($this->programs[0]);
        $program->shouldReceive('refresh')->once()->andReturnSelf();
        $chapter = Mockery::mock(Chapter::class)->makePartial();
        $chapter->forceFill([
            'id' => 11,
            'program_id' => $grantState === 'unrelated' ? 10 : 9,
            'chapter_number' => $chapterNumber,
            'status' => $chapterStatus,
        ]);
        $chapter->shouldReceive('refresh')->once()->andReturnSelf();
        $service = new LearningProgressService(new ChapterAccessPolicy(new EntitlementService));

        try {
            $service->authorize($this->student(), $program, $chapter);
            $this->assertTrue($allowed, 'Unauthorized inactive, draft or unrelated chapter accepted.');
        } catch (HttpException $error) {
            $this->assertFalse($allowed, 'Existing purchaser denied published chapter.');
            $this->assertContains($error->getStatusCode(), [403, 404]);
        }
    }

    public static function programCases(): array
    {
        return [
            'inactive purchaser' => ['inactive', 'n5', true, true],
            'active without grant' => ['active', 'n5', false, true],
            'inactive preview' => ['inactive', 'n5', false, false],
            'inactive unrelated' => ['inactive', 'ssw-food', true, false],
            'draft purchaser' => ['draft', 'n5', true, false],
        ];
    }

    #[DataProvider('programCases')]
    public function test_shared_program_permission(string $status, string $code, bool $purchased, bool $allowed): void
    {
        $this->grants = $purchased ? [$this->grant(1)] : [];
        $this->fakeReads();
        $program = (new Program)->forceFill(['status' => $status, 'code' => $code]);

        $this->assertSame($allowed, (new ChapterAccessPolicy(new EntitlementService))->canAccessProgram($this->student(), $program));
    }

    public function test_shared_scope_groups_active_or_inactive_full_without_draft_or_preview(): void
    {
        $this->grants = [$this->grant(1)];
        $this->fakeReads();
        $query = (new ChapterAccessPolicy(new EntitlementService))->scopePrograms(Program::query(), $this->student());

        $this->assertSame('select * from "programs" where ("status" = ? or ("status" = ? and "code" in (?, ?)))', $query->toSql());
        $this->assertSame(['active', 'inactive', 'dasar', 'n5'], $query->getBindings());
    }

    #[DataProvider('programCases')]
    public function test_runtime_tryout_guard_uses_real_shared_permission(string $status, string $code, bool $purchased, bool $allowed): void
    {
        $this->grants = $purchased ? [$this->grant(1)] : [];
        $this->fakeReads();
        $program = (new Program)->forceFill(['id' => 9, 'status' => $status, 'code' => $code, 'family' => 'jlpt']);
        $relation = Mockery::mock(BelongsTo::class);
        $relation->shouldReceive('firstOrFail')->once()->andReturn($program);
        $tryOut = Mockery::mock(TryOut::class)->makePartial();
        $tryOut->forceFill(['id' => 12, 'status' => 'published', 'access_type' => 'free']);
        $tryOut->shouldReceive('program')->once()->andReturn($relation);
        $service = new TryOutAttemptService(new ChapterAccessPolicy(new EntitlementService), new TryOutService);

        try {
            $service->authorize($this->student(), $tryOut);
            $this->assertTrue($allowed, 'Unauthorized program accepted by try out guard.');
        } catch (HttpException $error) {
            $this->assertFalse($allowed, 'Accessible program denied by try out guard.');
            $this->assertContains($error->getStatusCode(), [403, 404]);
        }
    }

    private function student(): User
    {
        return (new User)->forceFill(['id' => 7, 'role' => 'student', 'account_status' => 'active']);
    }

    private function grant(int $id, array $overrides = []): array
    {
        return array_replace([
            'id' => $id, 'user_id' => 7, 'program_id' => 9, 'plan_code' => 'sensei',
            'status' => 'active', 'starts_at' => '2026-10-28', 'ends_at' => '2026-10-28',
        ], $overrides);
    }

    private function fakeReads(): void
    {
        $this->connection->shouldReceive('select')->andReturnUsing(function ($sql, $bindings) {
            if (str_contains($sql, 'from "access_grants"')) {
                // SQL compilation is real; row filtering below is fake, not PostgreSQL execution.
                $this->assertStringContainsString('"status" = ?', $sql);
                $this->assertStringContainsString('"starts_at" <= ?', $sql);
                $this->assertStringContainsString('"ends_at" >= ?', $sql);
                $this->assertStringContainsString('"user_id" = ?', $sql);
                $this->assertStringContainsString('order by "id" asc', $sql);
                $this->assertContains('active', $bindings);
                $this->assertSame(2, count(array_filter($bindings, fn ($value) => $value === '2026-10-28')));
                $this->assertContains(7, $bindings);
                $this->assertStringNotContainsString('"programs"."status"', $sql);

                return array_values(array_map(fn ($row) => (object) $row, array_filter($this->grants,
                    fn ($row) => $row['user_id'] === 7 && $row['status'] === 'active'
                        && $row['starts_at'] <= '2026-10-28' && $row['ends_at'] >= '2026-10-28')));
            }
            $this->assertStringContainsString('from "programs"', $sql);
            $rows = $this->programs;
            foreach (['code', 'status'] as $column) {
                if (preg_match('/"(?:programs"\."|)'.$column.'" = \?/', $sql)) {
                    $rows = array_filter($rows, fn ($row) => in_array($row[$column], $bindings, true));
                }
            }

            return array_values(array_map(fn ($row) => (object) $row, $rows));
        });
    }
}
