<?php

namespace Tests\Unit;

use App\Models\Program;
use App\Models\ProgramAchievement;
use App\Models\User;
use App\Services\ProgramAchievementEligibility;
use App\Services\ProgramAchievementLearningType;
use App\Services\ProgramAchievementService;
use App\Services\ProgramAchievementSettings;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\QueryException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

final class ProgramAchievementServiceTest extends TestCase
{
    private ProgramAchievementSettings $settings;

    private ProgramAchievementEligibility $eligibility;

    private ProgramAchievementLearningType $learningType;

    private Builder $query;

    private ProgramAchievementService $service;

    private User $user;

    private Program $program;

    protected function setUp(): void
    {
        parent::setUp();
        $issuer = $this->createMock(\App\Services\CertificateIssuerSettings::class);
        $issuer->method('resolve')->willReturn(['signature_data_url' => null, 'signature_position' => 'bottom-left']);
        $this->app->instance(\App\Services\CertificateIssuerSettings::class, $issuer);
        $this->settings = $this->createMock(ProgramAchievementSettings::class);
        $this->eligibility = $this->createMock(ProgramAchievementEligibility::class);
        $this->learningType = $this->createMock(ProgramAchievementLearningType::class);
        $this->query = Mockery::mock(Builder::class);
        $this->service = new class($this->settings, $this->eligibility, $this->learningType, $this->query) extends ProgramAchievementService
        {
            public function __construct($settings, $eligibility, $learningType, private Builder $query)
            {
                parent::__construct($settings, $eligibility, $learningType);
            }

            protected function achievements(): Builder
            {
                return $this->query;
            }
        };
        $this->user = (new User)->forceFill(['id' => 17, 'name' => 'Caller name', 'role' => 'student', 'account_status' => 'active']);
        $this->user->exists = true;
        $this->program = (new Program)->forceFill(['id' => 247, 'name' => 'Caller program', 'code' => 'caller']);
        $this->program->exists = true;
        DB::swap(Mockery::mock()); // Every database operation must be explicitly expected; no connection exists.
        DB::shouldReceive('transactionLevel')->andReturn(0)->byDefault();
    }

    protected function tearDown(): void
    {
        try {
            Mockery::close();
        } finally {
            DB::clearResolvedInstances();
            parent::tearDown();
        }
    }

    private function ownerQuery(): void
    {
        $this->query->shouldReceive('where')->with('user_id', 17)->andReturnSelf();
        $this->query->shouldReceive('where')->with('program_id', 247)->andReturnSelf();
    }

    public function test_existing_achievement_bypasses_all_re_evaluation_and_transaction(): void
    {
        $achievement = new ProgramAchievement;
        $this->ownerQuery();
        $this->query->shouldReceive('first')->once()->andReturn($achievement);
        $this->settings->expects($this->never())->method('resolve');
        $this->eligibility->expects($this->never())->method('evaluate');
        $this->learningType->expects($this->never())->method('resolve');
        DB::shouldReceive('transaction')->never();
        DB::shouldReceive('getDriverName')->never();

        $this->assertSame(['achievement' => $achievement, 'reason' => 'existing'], $this->service->issue($this->user, $this->program));
    }

    public function test_forbidden_owners_never_query_or_open_transaction(): void
    {
        $this->query->shouldNotReceive('where');
        DB::shouldReceive('transaction')->never();
        foreach ([['admin', 'active', true], ['student', 'suspended', true], ['student', 'active', false]] as [$role, $status, $exists]) {
            $this->user->forceFill(['role' => $role, 'account_status' => $status]);
            $this->user->exists = $exists;
            foreach (['issue', 'collection'] as $method) {
                try {
                    $method === 'issue' ? $this->service->issue($this->user, $this->program) : $this->service->collection($this->user);
                    $this->fail('Forbidden owner was accepted.');
                } catch (HttpException $exception) {
                    $this->assertSame(403, $exception->getStatusCode());
                }
            }
        }
    }

    public function test_unsupported_driver_fails_closed_before_transaction(): void
    {
        $this->ownerQuery();
        $this->query->shouldReceive('first')->once()->andReturnNull();
        DB::shouldReceive('getDriverName')->once()->andReturn('sqlite');
        DB::shouldReceive('transaction')->never();
        $this->expectException(\LogicException::class);
        $this->expectExceptionMessage('Program achievement issuance requires PostgreSQL.');

        $this->service->issue($this->user, $this->program);
    }

    public function test_collection_is_scoped_to_owner(): void
    {
        $collection = new Collection([new ProgramAchievement]);
        $this->query->shouldReceive('where')->once()->with('user_id', 17)->andReturnSelf();
        $this->query->shouldReceive('orderByDesc')->once()->with('issued_at')->andReturnSelf();
        $this->query->shouldReceive('get')->once()->andReturn($collection);

        $this->assertSame($collection, $this->service->collection($this->user));
    }

    private function transactionInputs(): array
    {
        $user = Mockery::mock(User::class)->makePartial();
        $user->setRawAttributes($this->user->getAttributes());
        $user->exists = true;
        $program = Mockery::mock(Program::class)->makePartial();
        $program->setRawAttributes($this->program->getAttributes());
        $program->exists = true;
        $userQuery = Mockery::mock(Builder::class);
        $programQuery = Mockery::mock(Builder::class);
        DB::shouldReceive('getDriverName')->once()->andReturn('pgsql');
        DB::shouldReceive('transaction')->once()->with(Mockery::type('Closure'), 3)->andReturnUsing(fn ($callback) => $callback());
        DB::shouldReceive('statement')->once()->globally()->ordered()->with('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE')->andReturnTrue();
        DB::shouldReceive('statement')->once()->globally()->ordered()->with("SET LOCAL lock_timeout='2s'")->andReturnTrue();
        DB::shouldReceive('statement')->once()->globally()->ordered()->with("SET LOCAL statement_timeout='8s'")->andReturnTrue();
        $user->shouldReceive('newQuery')->once()->globally()->ordered()->andReturn($userQuery);
        $userQuery->shouldReceive('whereKey')->once()->with(17)->andReturnSelf();
        $userQuery->shouldNotReceive('lockForUpdate');
        $userQuery->shouldReceive('firstOrFail')->once()->andReturn($this->user);
        $program->shouldReceive('newQuery')->once()->andReturn($programQuery);
        $programQuery->shouldReceive('whereKey')->once()->with(247)->andReturnSelf();
        $programQuery->shouldReceive('firstOrFail')->once()->andReturn($this->program);
        $this->ownerQuery();
        $this->query->shouldNotReceive('newModelInstance');

        return [$user, $program];
    }

    public function test_nested_transaction_defers_without_evaluation_or_opening_transaction(): void
    {
        $user = Mockery::mock(User::class)->makePartial();
        $user->setRawAttributes($this->user->getAttributes());
        $user->exists = true;
        $program = Mockery::mock(Program::class)->makePartial();
        $program->setRawAttributes($this->program->getAttributes());
        $program->exists = true;
        $this->ownerQuery();
        $this->query->shouldReceive('first')->once()->andReturnNull();
        DB::shouldReceive('getDriverName')->once()->andReturn('pgsql');
        DB::shouldReceive('transactionLevel')->once()->andReturn(1);
        $callback = null;
        DB::shouldReceive('afterCommit')->once()->with(Mockery::on(function ($scheduled) use (&$callback) {
            $callback = $scheduled;

            return $scheduled instanceof \Closure;
        }));
        DB::shouldReceive('transaction')->never();
        $this->settings->expects($this->never())->method('resolve');
        $this->eligibility->expects($this->never())->method('evaluate');
        $this->learningType->expects($this->never())->method('resolve');

        $this->assertSame(['achievement' => null, 'reason' => 'deferred_until_commit'], $this->service->issue($user, $program));

        $this->assertInstanceOf(\Closure::class, $callback);
        $this->assertSame(['userId' => 17, 'programId' => 247], (new \ReflectionFunction($callback))->getStaticVariables());
        // Callback delivery/deletion/rollback paths run in coordinated feature tests, never a real DB here.
    }

    public static function transactionFailures(): array
    {
        return [['55P03', true], ['40001', true], ['40P01', true], ['57014', false], ['08006', false]];
    }

    #[DataProvider('transactionFailures')]
    public function test_bounded_transaction_failures_never_report_success(string $sqlState, bool $conflict): void
    {
        $previous = new \PDOException('transaction failed');
        $previous->errorInfo = [$sqlState, null, 'transaction failed'];
        $exception = new QueryException('pgsql', 'insert', [], $previous);
        $this->ownerQuery();
        $this->query->shouldReceive('first')->once()->andReturnNull();
        DB::shouldReceive('getDriverName')->once()->andReturn('pgsql');
        // Retry loop belongs to Laravel; verify bounded attempts and exhausted error handling.
        DB::shouldReceive('transaction')->once()->with(Mockery::type('Closure'), 3)->andThrow($exception);
        $this->query->shouldNotReceive('newModelInstance');
        $this->settings->expects($this->never())->method('resolve');
        if (! $conflict) {
            $this->expectExceptionObject($exception);
        }

        $result = $this->service->issue($this->user, $this->program);
        $this->assertSame(['achievement' => null, 'reason' => 'issuance_conflict'], $result);
    }

    public static function deniedIssuance(): array
    {
        return [['disabled'], ['incomplete'], ['learning_type_unresolved']];
    }

    #[DataProvider('deniedIssuance')]
    public function test_denied_issuance_never_constructs_or_saves_achievement(string $reason): void
    {
        [$user, $program] = $this->transactionInputs();
        $this->query->shouldReceive('first')->twice()->andReturnNull();
        $this->settings->expects($this->once())->method('resolve')->willReturn(['automatic_enabled' => $reason !== 'disabled']);
        $this->eligibility->expects($reason === 'disabled' ? $this->never() : $this->once())->method('evaluate')
            ->willReturn(['eligible' => $reason !== 'incomplete', 'reason' => 'incomplete', 'evidence' => []]);
        $this->learningType->expects($reason === 'learning_type_unresolved' ? $this->once() : $this->never())->method('resolve')
            ->willReturn(['learning_type' => null, 'reason' => 'learning_type_unresolved']);

        $this->assertSame(['achievement' => null, 'reason' => $reason], $this->service->issue($user, $program));
    }

    public function test_background_media_without_reference_tracking_blocks_new_issuance(): void
    {
        [$user, $program] = $this->transactionInputs();
        $this->query->shouldReceive('first')->twice()->andReturnNull();
        $this->settings->expects($this->once())->method('resolve')->willReturn(['automatic_enabled' => true, 'background_image' => 'media/r20.png']);
        $this->eligibility->expects($this->never())->method('evaluate');
        $this->learningType->expects($this->never())->method('resolve');
        $this->assertSame(['achievement' => null, 'reason' => 'media_reference_unresolved'], $this->service->issue($user, $program));
    }

    public function test_existing_recheck_inside_transaction_bypasses_evaluation(): void
    {
        [$user, $program] = $this->transactionInputs();
        $achievement = new ProgramAchievement;
        $this->query->shouldReceive('first')->twice()->andReturn(null, $achievement);
        $this->settings->expects($this->never())->method('resolve');
        $this->eligibility->expects($this->never())->method('evaluate');
        $this->learningType->expects($this->never())->method('resolve');

        $this->assertSame(['achievement' => $achievement, 'reason' => 'existing'], $this->service->issue($user, $program));
    }

    public static function uniqueConflictResults(): array
    {
        return [[true], [false]];
    }

    #[DataProvider('uniqueConflictResults')]
    public function test_unique_conflict_fetches_exact_owner_after_transaction_or_rethrows(bool $found): void
    {
        $exception = new UniqueConstraintViolationException('pgsql', 'insert', [], new \RuntimeException('duplicate'));
        $achievement = $found ? new ProgramAchievement : null;
        $outsideTransaction = true;
        $this->query->shouldReceive('where')->twice()->with('user_id', 17)->andReturnSelf();
        $this->query->shouldReceive('where')->twice()->with('program_id', 247)->andReturnSelf();
        $calls = 0;
        $this->query->shouldReceive('first')->twice()->andReturnUsing(function () use (&$calls, &$outsideTransaction, $achievement) {
            $this->assertTrue($outsideTransaction);

            return ++$calls === 1 ? null : $achievement;
        });
        DB::shouldReceive('getDriverName')->once()->andReturn('pgsql');
        DB::shouldReceive('transaction')->once()->with(Mockery::type('Closure'), 3)->andReturnUsing(function () use (&$outsideTransaction, $exception) {
            $outsideTransaction = false;
            try {
                throw $exception;
            } finally {
                $outsideTransaction = true;
            }
        });
        $this->settings->expects($this->never())->method('resolve');
        try {
            $result = $this->service->issue($this->user, $this->program);
            $this->assertTrue($found, 'Missing exact owner/program must rethrow.');
            $this->assertSame(['achievement' => $achievement, 'reason' => 'existing'], $result);
        } catch (UniqueConstraintViolationException $caught) {
            $this->assertFalse($found);
            $this->assertSame($exception, $caught);
        }
    }

    public function test_cancelled_save_cannot_return_issued(): void
    {
        $this->expectException(\LogicException::class);
        $this->expectExceptionMessage('Program achievement could not be saved.');
        $this->test_issuance_sets_snapshot_first_and_uses_reloaded_identity_and_server_evidence(false);
    }

    public function test_issuance_sets_snapshot_first_and_uses_reloaded_identity_and_server_evidence(bool $saveResult = true): void
    {
        $lockedUser = (new User)->forceFill(['id' => 17, 'name' => 'Server student', 'role' => 'student', 'account_status' => 'active']);
        $lockedUser->exists = true;
        $lockedProgram = (new Program)->forceFill(['id' => 247, 'name' => 'Server program', 'code' => 'n4']);
        $lockedProgram->exists = true;
        $userQuery = Mockery::mock(Builder::class);
        $programQuery = Mockery::mock(Builder::class);
        $user = Mockery::mock(User::class)->makePartial();
        $user->setRawAttributes($this->user->getAttributes());
        $user->exists = true;
        $program = Mockery::mock(Program::class)->makePartial();
        $program->setRawAttributes($this->program->getAttributes());
        $program->exists = true;
        $userQuery->shouldReceive('whereKey')->with(17)->andReturnSelf();
        $userQuery->shouldNotReceive('lockForUpdate');
        $userQuery->shouldReceive('firstOrFail')->once()->andReturn($lockedUser);
        $program->shouldReceive('newQuery')->once()->andReturn($programQuery);
        $programQuery->shouldReceive('whereKey')->with(247)->andReturnSelf();
        $programQuery->shouldReceive('firstOrFail')->once()->andReturn($lockedProgram);
        $this->ownerQuery();
        $this->query->shouldReceive('first')->twice()->andReturnNull();
        $presentation = ['automatic_enabled' => true, 'title' => 'Server title', 'description' => null, 'background_image' => null, 'presentation_version' => 1];
        $this->settings->expects($this->once())->method('resolve')->with($this->identicalTo($lockedProgram))->willReturn($presentation);
        $evidence = ['policy_version' => 1, 'user_id' => 17, 'program_id' => 247, 'chapters' => []];
        $this->eligibility->expects($this->once())->method('evaluate')->with($this->identicalTo($lockedUser), $this->identicalTo($lockedProgram))
            ->willReturn(['eligible' => true, 'reason' => 'eligible', 'evidence' => $evidence]);
        $this->learningType->expects($this->once())->method('resolve')->with($this->identicalTo($lockedUser), $this->identicalTo($lockedProgram))
            ->willReturn(['learning_type' => 'sensei', 'reason' => 'resolved', 'grant_id' => 42]);
        $achievement = Mockery::mock(ProgramAchievement::class)->makePartial();
        $captured = null;
        $this->query->shouldReceive('newModelInstance')->once()->with(Mockery::on(function (array $attributes) use (&$captured) {
            $captured = $attributes;

            return true;
        }))->andReturn($achievement);
        $achievement->shouldReceive('save')->once()->andReturnUsing(function () use ($achievement, $saveResult) {
            $this->assertTrue($achievement->issuedByService);

            return $saveResult;
        });
        DB::shouldReceive('getDriverName')->once()->andReturn('pgsql');
        DB::shouldReceive('transaction')->once()->with(Mockery::type('Closure'), 3)->andReturnUsing(fn ($callback) => $callback());
        // Must precede even user reload; statement itself is mocked, never sent to PostgreSQL.
        DB::shouldReceive('statement')->once()->globally()->ordered()->with('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE')->andReturnTrue();
        DB::shouldReceive('statement')->once()->globally()->ordered()->with("SET LOCAL lock_timeout='2s'")->andReturnTrue();
        DB::shouldReceive('statement')->once()->globally()->ordered()->with("SET LOCAL statement_timeout='8s'")->andReturnTrue();
        $user->shouldReceive('newQuery')->once()->globally()->ordered()->andReturn($userQuery);

        $result = $this->service->issue($user, $program);

        $this->assertSame('issued', $result['reason']);
        $this->assertSame('Server student', $captured['student_name_snapshot']);
        $this->assertSame('Server program', $captured['program_name_snapshot']);
        $this->assertSame('n4', $captured['program_code_snapshot']);
        $this->assertSame('sensei', $captured['learning_type_snapshot']);
        unset($presentation['automatic_enabled']);
        $this->assertSame($presentation + ['issuer' => 'HiruAcademy', 'signature_data_url' => null, 'signature_position' => 'bottom-left'], $captured['presentation_snapshot']);
        $this->assertSame($evidence + ['source_grant_id' => 42], $captured['completion_evidence_snapshot']);
        $this->assertSame('UTC', $captured['issued_at']->timezoneName);
    }
}
