<?php

namespace Tests\Unit;

use App\Services\ProgramAchievementReconciliationService;
use App\Services\ProgramAchievementService;
use Illuminate\Contracts\Debug\ExceptionHandler;
use Illuminate\Database\ConnectionResolver;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\PostgresConnection;
use Illuminate\Support\Facades\DB;
use Mockery;
use Tests\TestCase;

final class ProgramAchievementReconciliationTest extends TestCase
{
    private mixed $previousResolver;

    protected function setUp(): void
    {
        parent::setUp();
        $this->previousResolver = Model::getConnectionResolver();
        DB::swap(Mockery::mock());
        DB::shouldReceive('transactionLevel')->andReturn(0)->byDefault();
    }

    protected function tearDown(): void
    {
        try {
            Mockery::close();
        } finally {
            if ($this->previousResolver) {
                Model::setConnectionResolver($this->previousResolver);
            } else {
                Model::unsetConnectionResolver();
            }
            DB::clearResolvedInstances();
            parent::tearDown();
        }
    }

    public function test_schedule_captures_only_ids_and_contains_callback_and_reporter_failures(): void
    {
        $callback = null;
        DB::shouldReceive('afterCommit')->once()->andReturnUsing(function ($scheduled) use (&$callback) {
            $callback = $scheduled;
        });
        $service = Mockery::mock(ProgramAchievementReconciliationService::class);
        $service->shouldReceive('reconcile')->once()->with(17, 247)->andThrow(new \RuntimeException('private failure'));
        $this->app->instance(ProgramAchievementReconciliationService::class, $service);
        $handler = Mockery::mock(ExceptionHandler::class);
        $handler->shouldReceive('report')->once()->andThrow(new \RuntimeException('reporter failed'));
        $this->app->instance(ExceptionHandler::class, $handler);

        (new ProgramAchievementReconciliationService)->schedule(17, 247);
        $this->assertSame(['userId' => 17, 'programId' => 247], (new \ReflectionFunction($callback))->getStaticVariables());
        $this->assertNull((new \ReflectionFunction($callback))->getClosureThis());
        $callback();
    }

    public function test_registration_failure_is_reported_without_escaping_even_if_reporter_fails(): void
    {
        $exception = new \RuntimeException('registration failed');
        DB::shouldReceive('afterCommit')->twice()->andThrow($exception);
        $handler = Mockery::mock(ExceptionHandler::class);
        $handler->shouldReceive('report')->once()->with($exception);
        $this->app->instance(ExceptionHandler::class, $handler);
        $service = new ProgramAchievementReconciliationService;

        $service->schedule(17, 247);
        $handler->shouldReceive('report')->once()->with($exception)->andThrow(new \RuntimeException('reporter failed'));
        $service->schedule(17, 247);
        $this->addToAssertionCount(2);
    }

    public function test_early_callback_inside_wrapper_transaction_does_not_reconcile_or_reschedule(): void
    {
        DB::shouldReceive('transactionLevel')->once()->andReturn(1);
        DB::shouldReceive('afterCommit')->once()->andReturnUsing(function ($callback) {
            $callback();
        });
        $service = Mockery::mock(ProgramAchievementReconciliationService::class);
        $service->shouldNotReceive('reconcile');
        $this->app->instance(ProgramAchievementReconciliationService::class, $service);

        (new ProgramAchievementReconciliationService)->schedule(17, 247);
        $this->addToAssertionCount(1);
    }

    public function test_reconcile_inside_learning_transaction_only_registers_callback(): void
    {
        DB::shouldReceive('transactionLevel')->once()->andReturn(2);
        DB::shouldReceive('afterCommit')->once();
        $issuer = Mockery::mock(ProgramAchievementService::class);
        $issuer->shouldNotReceive('issue');
        $this->app->instance(ProgramAchievementService::class, $issuer);

        $this->assertSame(['achievement' => null, 'reason' => 'deferred_until_commit'], (new ProgramAchievementReconciliationService)->reconcile(17, 247));
    }

    public function test_batch_reloads_exact_pairs_preserves_issuer_checks_and_continues_after_failure(): void
    {
        $connection = Mockery::mock(PostgresConnection::class)->makePartial();
        $connection->useDefaultQueryGrammar();
        $connection->useDefaultPostProcessor();
        $resolver = new ConnectionResolver(['reconciliation-unit' => $connection]);
        $resolver->setDefaultConnection('reconciliation-unit');
        Model::setConnectionResolver($resolver);
        $connection->shouldReceive('select')->times(4)->andReturnUsing(function ($sql, $bindings) {
            $this->assertStringContainsString('where', $sql);
            $id = $bindings[0];

            return str_contains($sql, '"users"')
                ? [['id' => $id, 'role' => 'student', 'account_status' => 'active', 'name' => 'Reloaded']]
                : [['id' => $id, 'code' => 'n5', 'family' => 'jlpt', 'name' => 'Reloaded program']];
        });
        $issuer = Mockery::mock(ProgramAchievementService::class);
        $issuer->shouldReceive('issue')->once()->withArgs(fn ($user, $program) => $user->id === 17 && $program->id === 247 && $user->name === 'Reloaded')->andThrow(new \RuntimeException('secret'));
        $issuer->shouldReceive('issue')->once()->withArgs(fn ($user, $program) => $user->id === 18 && $program->id === 248)->andReturn(['achievement' => null, 'reason' => 'learning_type_unresolved']);
        $this->app->instance(ProgramAchievementService::class, $issuer);
        $handler = Mockery::mock(ExceptionHandler::class);
        $handler->shouldReceive('report')->once()->with(Mockery::type(\RuntimeException::class));
        $this->app->instance(ExceptionHandler::class, $handler);

        $results = (new ProgramAchievementReconciliationService)->batch([
            ['user_id' => 17, 'program_id' => 247],
            ['user_id' => 18, 'program_id' => 248],
        ]);
        $this->assertSame(['reconciliation_failed', 'learning_type_unresolved'], array_column($results, 'reason'));
        $this->assertStringNotContainsString('secret', json_encode($results));
    }

    public function test_batch_validates_entire_boundary_before_processing(): void
    {
        DB::shouldReceive('transactionLevel')->never();
        $service = new ProgramAchievementReconciliationService;
        foreach ([array_fill(0, 101, ['user_id' => 1, 'program_id' => 1]), [['user_id' => 1, 'program_id' => 1], ['user_id' => '2', 'program_id' => 1]], [['user_id' => 0, 'program_id' => 1]]] as $pairs) {
            try {
                $service->batch($pairs);
                $this->fail('Invalid batch accepted.');
            } catch (\InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }
        $this->assertSame([], $service->batch([]));
    }
}
