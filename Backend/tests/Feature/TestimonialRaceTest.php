<?php

namespace Tests\Feature;

use App\Models\Testimonial;
use App\Models\User;
use App\Services\MediaService;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class TestimonialRaceTest extends TestCase
{
    public function test_duplicate_submissions_and_repeated_approval_serialize_without_reactivation(): void
    {
        $this->assertSame(0, DB::transactionLevel());
        $student = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $connection = config('database.connections.pgsql');
        $connection['url'] = null;
        $code = <<<'PHP'
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
config(['database.default' => 'pgsql', 'database.connections.pgsql' => json_decode(getenv('RACE_CONNECTION'), true)]);
Illuminate\Support\Facades\DB::purge();
App\Support\DatabaseSafety::assertTarget(true);
Illuminate\Support\Facades\DB::statement("SET lock_timeout = '15s'");
Illuminate\Support\Facades\DB::select("SELECT set_config('application_name', ?, false)", [getenv('RACE_NAME')]);
if (getenv('RACE_OP') === 'submit') {
    $request = Illuminate\Http\Request::create('/api/student/testimonial', 'PUT', ['context' => 'Race', 'quote' => str_repeat('Race fixture ', 3), 'consent_public' => true]);
    $request->setUserResolver(fn () => App\Models\User::findOrFail(getenv('RACE_USER')));
    app(App\Http\Controllers\StudentTestimonialController::class)->update($request);
} else {
    $stale = App\Models\Testimonial::findOrFail(getenv('RACE_ROW'));
    app(App\Services\PublicContentService::class)->save('testimonials', ['moderation_status' => 'approved'], $stale);
}
PHP;
        $workers = [];
        try {
            foreach (['submit', 'approve'] as $operation) {
                DB::beginTransaction();
                DB::select('SELECT pg_advisory_xact_lock(hashtext(?))', ['managed-media-references']);
                $row = Testimonial::where('user_id', $student->id)->first();
                $names = [];
                $workers = [];
                for ($i = 0; $i < 2; $i++) {
                    $name = 'testimonial_'.bin2hex(random_bytes(8));
                    $names[] = $name;
                    $worker = new Process([PHP_BINARY, '-r', $code], base_path(), ['APP_ENV' => 'testing', 'APP_CONFIG_CACHE' => base_path('bootstrap/cache/race-nonexistent.php'), 'DB_URL' => '', 'RACE_CONNECTION' => json_encode($connection), 'RACE_NAME' => $name, 'RACE_USER' => (string) $student->id, 'RACE_ROW' => (string) $row?->id, 'RACE_OP' => $operation], null, 25);
                    $worker->start();
                    $workers[] = $worker;
                }
                $deadline = microtime(true) + 12;
                do {
                    DB::select('SELECT pg_stat_clear_snapshot()');
                    $blocked = DB::table('pg_stat_activity')->where('datname', DB::connection()->getDatabaseName())->whereIn('application_name', $names)->where('wait_event_type', 'Lock')->count();
                    if ($blocked === 2) {
                        break;
                    }
                    foreach ($workers as $worker) {
                        $this->assertTrue($worker->isRunning(), $worker->getErrorOutput());
                    }
                    usleep(20000);
                } while (microtime(true) < $deadline);
                $this->assertSame(2, $blocked);
                DB::commit();
                foreach ($workers as $worker) {
                    $this->assertSame(0, $worker->wait(), $worker->getErrorOutput());
                }
                $this->assertSame(1, $student->testimonials()->count());
                $row = $student->testimonials()->firstOrFail();
                if ($operation === 'submit') {
                    // First approval then explicit deactivation; racing repeated approvals must preserve it.
                    app(\App\Services\PublicContentService::class)->save('testimonials', ['moderation_status' => 'approved'], $row);
                    app(\App\Services\PublicContentService::class)->save('testimonials', ['published' => false, 'landing' => false, 'show_on_testimonials' => false], $row);
                } else {
                    $this->assertFalse($row->published);
                    $this->assertFalse($row->landing);
                    $this->assertFalse($row->show_on_testimonials);
                }
            }
        } finally {
            while (DB::transactionLevel() > 0) {
                DB::rollBack();
            }
            foreach ($workers as $worker) {
                if ($worker->isRunning()) {
                    $worker->stop();
                }
            }
            $student->testimonials()->delete();
            $student->delete();
        }
    }
}
