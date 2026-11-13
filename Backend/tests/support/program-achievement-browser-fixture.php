<?php

// Standalone browser fixture/router. No migrations, seeders, or auth bypass.
require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(PHP_SAPI === 'cli-server' ? Illuminate\Contracts\Http\Kernel::class : Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use App\Models\Chapter;
use App\Models\User;
use App\Services\LearningProgressService;
use App\Support\DatabaseSafety;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

$config = DB::connection()->getConfig();
if (getenv('HIRU_DISPOSABLE_TESTING') !== '1' || ! $app->environment('testing') || $app->configurationIsCached()
    || ($config['host'] ?? '') !== '127.0.0.1' || (string) ($config['port'] ?? '') !== '55432'
    || ($config['username'] ?? '') !== 'hiru_test_runner' || ($config['database'] ?? '') !== 'hiru_academy_test'
    || getenv('HIRU_TEST_SCHEMA') !== 'hiru_backend_test_gamification_final_20261008'
    || DB::selectOne('SELECT current_schema() AS name')->name !== 'hiru_backend_test_gamification_final_20261008') {
    throw new RuntimeException('Achievement browser target rejected.');
}
DatabaseSafety::assertTarget(true);
$root = getenv('HIRU_ACHIEVEMENT_BROWSER_DIR');
if (! is_string($root) || ! preg_match('~^[A-Za-z]:[/\\\\]Users[/\\\\]Tulo[/\\\\]AppData[/\\\\]Local[/\\\\]Temp[/\\\\]opencode[/\\\\]achievement-real-[a-f0-9-]+$~D', $root)) {
    throw new RuntimeException('Isolated temporary directory required.');
}
foreach (['', '/sessions', '/cache'] as $suffix) {
    if (! is_dir($root.$suffix) && ! mkdir($root.$suffix, 0700, true)) {
        throw new RuntimeException('Cannot create isolated directory.');
    }
}
config(['session.driver' => 'file', 'session.files' => $root.'/sessions', 'cache.default' => 'file', 'cache.stores.file.path' => $root.'/cache', 'cache.stores.file.lock_path' => $root.'/cache']);
if (PHP_SAPI === 'cli-server') {
    $app->handleRequest(Request::capture());

    return;
}
$action = $argv[1] ?? 'guard';
$path = $root.'/manifest.json';
if ($action === 'guard') {
    echo "Strict disposable browser guard PASS\n";
    exit;
}
if ($action === 'create') {
    if (! Schema::hasColumn('notification_contents', 'user_id')
        || ! Schema::hasColumn('notification_contents', 'event_key')) {
        throw new RuntimeException('Real student login requires existing personal-notification schema; no fixture written.');
    }
    if (file_exists($path)) {
        throw new RuntimeException('Manifest already exists.');
    }
    $fixture = DB::transaction(function () {
        $rows = [];
        $insert = function ($table, $attributes) use (&$rows) {
            $id = DB::table($table)->insertGetId($attributes + ['created_at' => now(), 'updated_at' => now()]);
            $rows[] = [$table, $id];

            return $id;
        };
        $token = (string) Str::uuid();
        $password = bin2hex(random_bytes(24));
        $users = [];
        foreach (['admin', 'student', 'other'] as $role) {
            $email = "c6-$role-$token@example.test";
            $user = User::forceCreate(['name' => "C6 $role $token", 'email' => $email, 'whatsapp' => '+628'.random_int(1000000000, 9999999999), 'password' => $password, 'role' => $role === 'admin' ? 'admin' : 'student', 'account_status' => 'active']);
            $rows[] = ['users', $user->id];
            $users[$role] = ['id' => $user->id, 'email' => $email, 'name' => $user->name];
        }
        $program = $insert('programs', ['code' => 'c6-'.$token, 'slug' => 'c6-'.$token, 'name' => 'C6 Browser '.$token, 'family' => 'interview', 'status' => 'active', 'sort_order' => 0]);
        $insert('program_offers', ['program_id' => $program, 'plan_code' => 'lms', 'duration_months' => 1, 'status' => 'active']);
        $insert('access_grants', ['user_id' => $users['student']['id'], 'program_id' => $program, 'plan_code' => 'lms', 'status' => 'active', 'starts_at' => now()->toDateString(), 'ends_at' => now()->addDays(10)->toDateString()]);
        $chapter = $insert('chapters', ['program_id' => $program, 'chapter_number' => 1, 'title' => 'C6 chapter', 'status' => 'published']);
        $video = $insert('video_lessons', ['chapter_id' => $chapter, 'title' => 'C6 video', 'status' => 'published', 'video_url' => 'https://example.test/video']);

        return compact('rows', 'users', 'password', 'token', 'program', 'chapter', 'video');
    });
    if (file_put_contents($path, json_encode($fixture, JSON_THROW_ON_ERROR)) === false) {
        throw new RuntimeException('Manifest write failed.');
    }
    echo "Owned fixture committed\n";
    exit;
}
$f = json_decode(file_get_contents($path), true, flags: JSON_THROW_ON_ERROR);
foreach ($f['users'] as $u) {
    if (! str_ends_with($u['email'], '-'.$f['token'].'@example.test') || ! DB::table('users')->where('id', $u['id'])->where('email', $u['email'])->exists()) {
        throw new RuntimeException('User ownership rejected.');
    }
}
if (! DB::table('programs')->where('id', $f['program'])->where('slug', 'c6-'.$f['token'])->exists()) {
    throw new RuntimeException('Program ownership rejected.');
}
if (! DB::table('chapters')->where('id', $f['chapter'])->where('program_id', $f['program'])->exists()
    || ! DB::table('video_lessons')->where('id', $f['video'])->where('chapter_id', $f['chapter'])->exists()) {
    throw new RuntimeException('Learning resource ownership rejected.');
}
$users = array_column($f['users'], 'id');
if (DB::table('program_achievements')->whereIn('user_id', $users)->where('program_id', '!=', $f['program'])->exists()
    || DB::table('activity_completions')->whereIn('user_id', $users)->where('chapter_id', '!=', $f['chapter'])->exists()
    || DB::table('learning_attempts')->whereIn('user_id', $users)->where('chapter_id', '!=', $f['chapter'])->exists()) {
    throw new RuntimeException('Derived resource ownership rejected.');
}
if ($action === 'complete') {
    app(LearningProgressService::class)->record(User::findOrFail($f['users']['student']['id']), Chapter::findOrFail($f['chapter']), 'video', $f['video']);
    echo "Real LearningProgressService completion recorded\n";
} elseif ($action === 'cleanup') {
    $evidence = DB::transaction(function () use ($f, $path) {
        $users = array_column($f['users'], 'id');
        $derived = [];
        foreach (['notification_reads', 'notification_contents', 'program_achievements', 'gamification_rewards', 'gamification_days', 'activity_completions', 'learning_attempts'] as $table) {
            // Older disposable schema has no personal-notification columns; never broaden ownership query.
            $derived[$table] = Schema::hasColumn($table, 'user_id') ? DB::table($table)->whereIn('user_id', $users)->pluck('id')->all() : [];
        }
        $derived['program_achievement_settings'] = DB::table('program_achievement_settings')->where('program_id', $f['program'])->pluck('id')->all();
        file_put_contents($path, json_encode($f + ['derived' => $derived], JSON_THROW_ON_ERROR));
        $counts = [];
        foreach ($derived as $table => $ids) {
            $counts[$table] = DB::table($table)->whereIn('id', $ids)->delete();
            if (DB::table($table)->whereIn('id', $ids)->exists()) {
                throw new RuntimeException('Derived cleanup failed.');
            }
        }
        foreach (array_reverse($f['rows']) as [$table, $id]) {
            DB::table($table)->where('id', $id)->delete();
        }
        foreach ($f['rows'] as [$table, $id]) {
            if (DB::table($table)->where('id', $id)->exists()) {
                throw new RuntimeException('Fixture cleanup failed.');
            }
        }

        return ['deleted' => $counts, 'fixture_rows' => count($f['rows']), 'remaining_owned_rows' => 0];
    });
    file_put_contents($root.'/cleanup.json', json_encode($evidence, JSON_THROW_ON_ERROR));
    echo json_encode($evidence, JSON_THROW_ON_ERROR)."\n";
} else {
    throw new RuntimeException('Unknown fixture action.');
}
