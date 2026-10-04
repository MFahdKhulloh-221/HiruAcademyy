<?php

namespace Tests\Feature;

use App\Models\PlacementAttempt;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class PlacementRaceTest extends TestCase
{
    private ?string $table = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->guardDatabase();
        $this->assertSame(0, DB::transactionLevel());
    }

    private function guardDatabase(): void
    {
        $this->assertTrue(app()->environment('testing'));
        $this->assertSame('pgsql', DB::getDriverName());
        $this->assertSame('hiru_academy_test', DB::connection()->getDatabaseName());
        $this->assertContains(config('database.connections.'.config('database.default').'.host'), ['localhost', '127.0.0.1', '::1']);
    }

    protected function tearDown(): void
    {
        try {
            $this->guardDatabase();
            while (DB::transactionLevel() > 0) {
                DB::rollBack();
            }
            if ($this->table) {
                DB::statement('DROP TABLE '.$this->table);
            }
        } finally {
            parent::tearDown();
        }
    }

    private function fixture(bool $expired): array
    {
        $this->table = 'placement_race_'.bin2hex(random_bytes(12));
        DB::statement('CREATE TABLE '.$this->table.' (LIKE placement_attempts INCLUDING ALL)');
        DB::statement('CREATE TRIGGER placement_race_immutable BEFORE UPDATE OR DELETE ON '.$this->table.' FOR EACH ROW EXECUTE FUNCTION guard_placement_attempt()');
        $owner = bin2hex(random_bytes(32));
        $now = CarbonImmutable::now('UTC');
        $attempt = new PlacementAttempt;
        $attempt->setTable($this->table);
        $attempt->fill([
            'placement_config_id' => 1,
            'owner_hash' => hash('sha256', $owner),
            'applicant_snapshot' => ['privacy' => true],
            'config_snapshot' => ['duration_minutes' => 7],
            'content_snapshot' => [['id' => 1, 'prompt' => 'Race fixture', 'options' => ['A' => 'First', 'B' => 'Second', 'C' => 'Third', 'D' => 'Fourth'], 'category' => 'Bunpou']],
            'grading_snapshot' => [1 => 'B'],
            'answers' => [1 => 'B'],
            'status' => 'in_progress',
            'started_at' => $now->subMinutes(8),
            'expires_at' => $expired ? $now->subMinute() : $now->addMinutes(7),
        ])->save();

        return ['table' => $this->table, 'id' => $attempt->id, 'owner' => $owner];
    }

    private function worker(array $fixture, string $operation, array $answers, string $name): Process
    {
        $code = <<<'PHP'
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$connection = json_decode(getenv('RACE_CONNECTION'), true, 512, JSON_THROW_ON_ERROR);
config(['database.default' => 'pgsql', 'database.connections.pgsql' => $connection]);
Illuminate\Support\Facades\DB::purge();
if (! app()->environment('testing') || Illuminate\Support\Facades\DB::getDriverName() !== 'pgsql' || Illuminate\Support\Facades\DB::connection()->getDatabaseName() !== 'hiru_academy_test' || ! in_array($connection['host'], ['localhost', '127.0.0.1', '::1'], true)) {
    exit(90);
}
Illuminate\Support\Facades\DB::select("SELECT set_config('application_name', ?, false)", [getenv('RACE_NAME')]);
Illuminate\Support\Facades\DB::statement("SET lock_timeout = '15s'");
$f = json_decode(getenv('RACE_FIXTURE'), true, 512, JSON_THROW_ON_ERROR);
$answers = json_decode(getenv('RACE_ANSWERS'), true, 512, JSON_THROW_ON_ERROR);
$session = new Illuminate\Session\Store('placement_race', new Illuminate\Session\ArraySessionHandler(120));
$session->start();
$session->put('placement_owner', $f['owner']);
$request = Illuminate\Http\Request::create('/', 'POST', ['answers' => $answers]);
$request->setLaravelSession($session);
$request->setUserResolver(fn () => null);
$attempt = (new App\Models\PlacementAttempt)->setTable($f['table'])->newQuery()->findOrFail($f['id']);
$service = app(App\Services\PlacementService::class);
try {
    $result = getenv('RACE_OPERATION') === 'save' ? $service->saveAnswers($request, $attempt) : $service->submit($request, $attempt);
    echo json_encode(['http' => 200, 'status' => $result->status, 'result' => $result->result_snapshot, 'answers' => $result->answers], JSON_THROW_ON_ERROR);
} catch (Symfony\Component\HttpKernel\Exception\HttpExceptionInterface $exception) {
    echo json_encode(['http' => $exception->getStatusCode()], JSON_THROW_ON_ERROR);
}
PHP;
        $connection = config('database.connections.'.config('database.default'));
        $connection['url'] = null;

        return new Process([PHP_BINARY, '-r', $code], base_path(), ['APP_ENV' => 'testing', 'APP_CONFIG_CACHE' => base_path('bootstrap/cache/race-nonexistent.php'), 'DB_URL' => '', 'RACE_CONNECTION' => json_encode($connection, JSON_THROW_ON_ERROR), 'RACE_FIXTURE' => json_encode($fixture, JSON_THROW_ON_ERROR), 'RACE_ANSWERS' => json_encode($answers, JSON_THROW_ON_ERROR), 'RACE_OPERATION' => $operation, 'RACE_NAME' => $name], null, 25);
    }

    private function race(bool $save, bool $expired): void
    {
        $fixture = $this->fixture($expired);
        $names = ['placement_'.bin2hex(random_bytes(8)), 'placement_'.bin2hex(random_bytes(8))];
        $workers = [$this->worker($fixture, 'submit', [1 => 'B'], $names[0]), $this->worker($fixture, $save ? 'save' : 'submit', $save ? [1 => 'A'] : ($expired ? [] : [1 => 'B']), $names[1])];
        DB::beginTransaction();
        DB::table($this->table)->where('id', $fixture['id'])->lockForUpdate()->first();
        try {
            foreach ($workers as $worker) {
                $worker->start();
            }
            $deadline = microtime(true) + 12;
            do {
                DB::select('SELECT pg_stat_clear_snapshot()');
                $blocked = DB::select("SELECT application_name FROM pg_stat_activity WHERE datname = current_database() AND application_name IN (?, ?) AND wait_event_type = 'Lock'", $names);
                if (count($blocked) === 2) {
                    break;
                }
                foreach ($workers as $worker) {
                    $this->assertTrue($worker->isRunning(), 'Worker exited before row-lock barrier.');
                }
                usleep(20000);
            } while (microtime(true) < $deadline);
            $this->assertCount(2, $blocked);
            DB::commit();
            $results = [];
            foreach ($workers as $worker) {
                $this->assertSame(0, $worker->wait(), 'Placement race worker failed.');
                $results[] = json_decode($worker->getOutput(), true, 512, JSON_THROW_ON_ERROR);
            }
            $this->assertSame(200, $results[0]['http']);
            $this->assertSame('completed', $results[0]['status']);
            if ($save) {
                $this->assertContains($results[1]['http'], $expired ? [409] : [200, 409]);
            } else {
                $this->assertEquals($results[0], $results[1]);
            }
            $stored = (new PlacementAttempt)->setTable($this->table)->newQuery()->findOrFail($fixture['id']);
            $this->assertEquals($results[0]['result'], $stored->result_snapshot);
            $this->assertEquals($results[0]['answers'], $stored->answers);
            $this->assertSame(1, $stored->result_snapshot['correct']);
        } finally {
            while (DB::transactionLevel() > 0) {
                DB::rollBack();
            }
            foreach ($workers as $worker) {
                if ($worker->isRunning()) {
                    $worker->stop();
                }
            }
        }
    }

    public function test_concurrent_double_submit_before_deadline(): void
    {
        $this->race(false, false);
    }

    public function test_concurrent_manual_automatic_submit_after_deadline(): void
    {
        $this->race(false, true);
    }

    public function test_concurrent_save_and_manual_submit(): void
    {
        $this->race(true, false);
    }

    public function test_concurrent_late_save_and_automatic_submit(): void
    {
        $this->race(true, true);
    }
}
