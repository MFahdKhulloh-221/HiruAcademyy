<?php

namespace Tests\Unit;

use App\Services\CheckpointPackageService;
use App\Services\TryOutService;
use Illuminate\Container\Container;
use Illuminate\Database\PostgresConnection;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Facade;
use Illuminate\Support\Facades\Schema;
use Mockery;
use PHPUnit\Framework\TestCase;

final class TryOutImageMigrationTest extends TestCase
{
    private $previousApp;

    protected function setUp(): void
    {
        parent::setUp();
        $this->previousApp = Facade::getFacadeApplication();
        Facade::clearResolvedInstances();
        Facade::setFacadeApplication(new Container);
        DB::swap(Mockery::mock());
        Schema::swap(Mockery::mock());
    }

    protected function tearDown(): void
    {
        try {
            Mockery::close();
        } finally {
            Facade::clearResolvedInstances();
            Facade::setFacadeApplication($this->previousApp);
            parent::tearDown();
        }
    }

    private function migration(): object
    {
        return require __DIR__.'/../../database/migrations/2026_11_05_000001_add_try_out_builder_images.php';
    }

    public function test_additive_definitions_postgresql_checks_and_capability_without_database(): void
    {
        $columns = [];
        DB::shouldReceive('transaction')->once()->andReturnUsing(fn ($callback) => $callback());
        DB::shouldReceive('getDriverName')->twice()->andReturn('pgsql');
        foreach (['try_out_questions', 'try_out_passages'] as $table) {
            Schema::shouldReceive('hasTable')->with($table)->once()->andReturnTrue();
            foreach (['image', 'image_alt', 'image_position'] as $column) {
                Schema::shouldReceive('hasColumn')->with($table, $column)->once()->andReturnFalse();
            }
            Schema::shouldReceive('table')->with($table, Mockery::type('Closure'))->once()->andReturnUsing(function ($name, $callback) use (&$columns) {
                $connection = new PostgresConnection(fn () => throw new \RuntimeException('Database access forbidden in this test.'));
                $connection->useDefaultSchemaGrammar();
                $blueprint = new Blueprint($connection, $name);
                $callback($blueprint);
                $columns[$name] = $blueprint->getColumns();
            });
            DB::shouldReceive('statement')->with("ALTER TABLE {$table} ADD CONSTRAINT {$table}_image_position_check CHECK (image_position IN ('before', 'after'))")->once();
            Schema::shouldReceive('hasColumns')->with($table, ['image', 'image_alt', 'image_position'])->once()->andReturnTrue();
        }

        $this->migration()->up();
        foreach ($columns as $definitions) {
            $this->assertSame(['image', 'image_alt', 'image_position'], array_map(fn ($column) => $column->name, $definitions));
            $this->assertSame('text', $definitions[0]->type);
            $this->assertTrue($definitions[0]->nullable);
            $this->assertSame('text', $definitions[1]->type);
            $this->assertSame('', $definitions[1]->default);
            $this->assertNull($definitions[1]->nullable);
            $this->assertSame('string', $definitions[2]->type);
            $this->assertSame('before', $definitions[2]->default);
            $this->assertNull($definitions[2]->nullable);
        }
        $this->assertSame(['images' => true, 'decimal_points' => false], (new TryOutService)->builderCapabilities());
        $this->assertSame(['images' => false, 'decimal_points' => false], (new CheckpointPackageService)->builderCapabilities());
    }

    public function test_partial_schema_conflict_refuses_before_ddl(): void
    {
        DB::shouldReceive('transaction')->once()->andReturnUsing(fn ($callback) => $callback());
        Schema::shouldReceive('hasTable')->with('try_out_questions')->once()->andReturnTrue();
        Schema::shouldReceive('hasColumn')->with('try_out_questions', 'image')->once()->andReturnTrue();
        Schema::shouldReceive('table')->never();
        DB::shouldReceive('statement')->never();
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Refusing schema conflict: try_out_questions.image already exists.');
        $this->migration()->up();
    }

    public function test_rollback_locks_both_tables_and_refuses_populated_passage_before_any_drop(): void
    {
        DB::shouldReceive('transaction')->once()->andReturnUsing(fn ($callback) => $callback());
        DB::shouldReceive('getDriverName')->once()->andReturn('pgsql');
        DB::shouldReceive('statement')->with('LOCK TABLE try_out_questions, try_out_passages IN ACCESS EXCLUSIVE MODE')->once();
        foreach (['try_out_questions' => false, 'try_out_passages' => true] as $table => $populated) {
            $query = Mockery::mock();
            DB::shouldReceive('table')->with($table)->once()->andReturn($query);
            $query->shouldReceive('where')->with(Mockery::type('Closure'))->once()->andReturnUsing(function ($callback) use ($query) {
                $query->shouldReceive('whereNotNull')->with('image')->once()->andReturnSelf();
                $query->shouldReceive('orWhere')->with('image_alt', '<>', '')->once()->andReturnSelf();
                $query->shouldReceive('orWhere')->with('image_position', '<>', 'before')->once()->andReturnSelf();
                $callback($query);

                return $query;
            });
            $query->shouldReceive('exists')->once()->andReturn($populated);
        }
        Schema::shouldReceive('table')->never();
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Refusing rollback: try_out_passages contains image references or image metadata.');
        $this->migration()->down();
    }
}
