<?php

// Disposable HTTP integration fixtures only. No existing seeder or user data.
require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
App\Support\DatabaseSafety::assertTarget(true);
$identity = Illuminate\Support\Facades\DB::selectOne('SELECT current_schema() AS schema, current_database() AS database, current_user AS role');
if (getenv('HIRU_DISPOSABLE_TESTING') !== '1' || getenv('HIRU_TEST_SCHEMA') !== 'hiru_backend_test_community49'
    || $identity->schema !== 'hiru_backend_test_community49' || $identity->database !== 'hiru_academy_test'
    || $identity->role !== 'hiru_test_runner') {
    throw new RuntimeException('Disposable community schema required.');
}
$tag = getenv('HIRU_HTTP_RUN');
if (! is_string($tag) || ! preg_match('/^[a-f0-9]{12}$/D', $tag)) {
    throw new RuntimeException('Unique fixture run required.');
}
$password = getenv('HIRU_HTTP_PASSWORD');
if (! is_string($password) || strlen($password) < 32 || strlen($password) > 72 || preg_match('/[\x00-\x20\x7f]/', $password)) {
    throw new RuntimeException('Random fixture password of 32–72 non-whitespace bytes required.');
}
$output = getenv('HIRU_HTTP_FIXTURES');
if (! is_string($output) || $output === '' || str_contains($output, "\0")
    || ! preg_match('~^(?:[A-Za-z]:[\\\\/]|/)~', $output) || strtolower(pathinfo($output, PATHINFO_EXTENSION)) !== 'json') {
    throw new RuntimeException('Absolute JSON fixture output path required.');
}
$directory = dirname($output);
if ((! is_dir($directory) && ! mkdir($directory, 0700, true)) || ! is_writable($directory)
    || (file_exists($output) && (! is_file($output) || ! is_writable($output)))) {
    throw new RuntimeException('Fixture output is not writable.');
}
$users = [];
foreach (['member', 'other', 'free', 'admin'] as $index => $kind) {
    $users[$kind] = App\Models\User::forceCreate([
        'name' => 'HTTP '.$kind, 'email' => $kind.'-'.$tag.'@example.test',
        'whatsapp' => '628'.random_int(1000000000, 9999999999), 'password' => $password,
        'role' => $kind === 'admin' ? 'admin' : 'student', 'account_status' => 'active',
    ]);
}
$program = App\Models\Program::create(['code' => 'http-'.$tag, 'slug' => 'http-'.$tag, 'name' => 'HTTP fixture', 'family' => 'ssw', 'status' => 'active', 'sort_order' => 0]);
Illuminate\Support\Facades\DB::table('program_offers')->insert(['program_id' => $program->id, 'plan_code' => 'lms', 'duration_months' => 1, 'status' => 'inactive']);
foreach (['member', 'other'] as $kind) {
    Illuminate\Support\Facades\DB::table('access_grants')->insert([
        'user_id' => $users[$kind]->id, 'program_id' => $program->id, 'plan_code' => 'lms',
        'starts_at' => now()->subDay(), 'ends_at' => now()->addDay(), 'status' => 'active',
        'created_at' => now(), 'updated_at' => now(),
    ]);
}
$topics = [];
foreach (range(1, 4) as $index) {
    $topics[] = App\Models\CommunityTopic::create(['slug' => 'http-'.$tag.'-'.$index, 'title' => 'HTTP Kategori '.$index.' '.$tag, 'status' => 'published', 'sort_order' => $index]);
}
$thread = App\Models\CommunityThread::create(['topic_id' => $topics[0]->id, 'user_id' => $users['member']->id, 'title' => 'HTTP Arsip Lama '.$tag, 'content' => 'Isi arsip dipertahankan', 'status' => 'published']);
$reply = App\Models\CommunityReply::create(['thread_id' => $thread->id, 'user_id' => $users['other']->id, 'content' => 'Balasan arsip dipertahankan', 'status' => 'published']);
$json = json_encode([
    'tag' => $tag,
    'emails' => array_map(fn ($user) => $user->email, $users), 'password' => $password,
    'topics' => array_map(fn ($topic) => $topic->id, $topics), 'member_id' => $users['member']->id,
    'thread_id' => $thread->id, 'reply_id' => $reply->id,
], JSON_THROW_ON_ERROR);
if (file_put_contents($output, $json, LOCK_EX) !== strlen($json)) {
    throw new RuntimeException('Failed to write complete HTTP fixtures.');
}
echo "Disposable HTTP fixtures created.\n";
