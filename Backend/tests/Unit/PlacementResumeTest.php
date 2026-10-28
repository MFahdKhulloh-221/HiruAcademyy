<?php

namespace Tests\Unit;

use App\Models\PlacementAttempt;
use App\Models\User;
use App\Services\PlacementService;
use Carbon\CarbonImmutable;
use Illuminate\Container\Container;
use Illuminate\Database\ConnectionResolver;
use Illuminate\Database\DatabaseManager;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\PostgresConnection;
use Illuminate\Http\Request;
use Illuminate\Session\ArraySessionHandler;
use Illuminate\Session\Store;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Facade;
use Illuminate\Support\Facades\Validator;
use Illuminate\Translation\ArrayLoader;
use Illuminate\Translation\Translator;
use Illuminate\Validation\Factory;
use Mockery;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpKernel\Exception\HttpException;

final class PlacementResumeTest extends TestCase
{
    public function test_start_serializes_student_and_resumes_server_attempt_without_insert_or_timer_reset(): void
    {
        $container = Container::getInstance();
        $facade = Facade::getFacadeApplication();
        $resolver = Model::getConnectionResolver();
        $app = new class extends Container {
            public function abort($code, $message = '', array $headers = []): never { throw new HttpException($code, $message, null, $headers); }
        };
        Container::setInstance($app);
        Facade::clearResolvedInstances();
        Facade::setFacadeApplication($app);
        Validator::swap(new Factory(new Translator(new ArrayLoader, 'en'), $app));
        $connection = Mockery::mock(PostgresConnection::class)->makePartial();
        $connection->useDefaultQueryGrammar();
        $connection->useDefaultPostProcessor();
        $connections = new ConnectionResolver(['test' => $connection]);
        $connections->setDefaultConnection('test');
        Model::setConnectionResolver($connections);
        $database = Mockery::mock(DatabaseManager::class);
        $database->shouldReceive('transaction')->andReturnUsing(fn ($callback) => $callback());
        DB::swap($database);
        $row = ['id' => 12, 'user_id' => 1, 'status' => 'in_progress', 'config_snapshot' => json_encode(['question_count' => 1]), 'adaptive_state' => json_encode(['revision' => 3]), 'answers' => json_encode(['41' => 'B']), 'started_at' => CarbonImmutable::now('UTC')->subMinute()->toISOString(), 'expires_at' => CarbonImmutable::now('UTC')->addMinutes(4)->toISOString()];
        try {
            $request = Request::create('/api/placement/attempts', 'POST', ['name' => 'Student', 'whatsapp' => '628123456789', 'target' => 'N5', 'privacy' => true]);
            $request->setUserResolver(fn () => (new User)->forceFill(['id' => 1, 'role' => 'student', 'account_status' => 'active']));
            $request->setLaravelSession(new Store('test', new ArraySessionHandler(60)));
            $connection->shouldReceive('select')->once()->ordered()->withArgs(function ($sql, $bindings) {
                $this->assertStringContainsString('from "users"', $sql);
                $this->assertStringContainsString('for update', $sql);
                return $bindings === [1];
            })->andReturn([(object) ['id' => 1, 'role' => 'student', 'account_status' => 'active']]);
            $connection->shouldReceive('select')->once()->ordered()->withArgs(function ($sql, $bindings) {
                $this->assertStringContainsString('from "placement_attempts"', $sql);
                $this->assertStringContainsString('"user_id" = ?', $sql);
                $this->assertStringContainsString('"config_snapshot"->>\'preview\' is null', $sql);
                return $bindings === [1, 'in_progress'];
            })->andReturn([(object) $row]);
            $connection->shouldReceive('select')->twice()->withArgs(fn ($sql, $bindings) => str_contains($sql, 'from "placement_attempts"') && $bindings === [12])->andReturn([(object) $row]);
            $service = new PlacementService;
            $attempt = $service->start($request);
            $this->assertSame(12, $attempt->id);
            $this->assertSame(['41' => 'B'], $attempt->answers);
            $this->assertSame(3, $attempt->adaptive_state['revision']);
            $this->assertSame(CarbonImmutable::parse($row['expires_at'])->toISOString(), $attempt->expires_at->toISOString());
            $foreign = Request::create('/api/placement/attempts/12');
            $foreign->setUserResolver(fn () => (new User)->forceFill(['id' => 2, 'role' => 'student', 'account_status' => 'active']));
            try { $service->authorize($foreign, $attempt); $this->fail('Foreign attempt accepted.'); }
            catch (HttpException $error) { $this->assertSame(404, $error->getStatusCode()); }
        } finally {
            Mockery::close();
            if ($resolver) Model::setConnectionResolver($resolver); else Model::unsetConnectionResolver();
            Facade::clearResolvedInstances();
            Facade::setFacadeApplication($facade);
            Container::setInstance($container);
        }
    }
}
