<?php

// Run only against verified disposable release candidate; never against main/production.
use App\Support\DatabaseSafety;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

require __DIR__.'/../Backend/vendor/autoload.php';
$app = require __DIR__.'/../Backend/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
if (! $app->environment('testing') || $app->configurationIsCached()
    || getenv('HIRU_DISPOSABLE_TESTING') !== '1'
    || config('database.connections.pgsql.database') !== 'hiru_release_candidate') {
    throw new RuntimeException('Disposable release candidate required.');
}
DatabaseSafety::assertTarget(true);
$changes = [
    ['testimonials', 1, 'image', '/testimonials/remaja3.png'],
    ['testimonials', 3, 'image', '/testimonials/remaja2.png'],
    ['showcase_items', 2, 'image_src', '/showcase/pembelajaran.png'],
    ['showcase_items', 3, 'image_src', '/showcase/video.png'],
    ['showcase_items', 4, 'image_src', '/showcase/flashcard.png'],
    ['showcase_items', 5, 'image_src', '/showcase/tryout.png'],
    ['showcase_items', 1, 'image_src', '/showcase/dashboard.png'],
];
DB::transaction(function () use ($changes) {
    foreach ($changes as [$table, $id, $field, $path]) {
        if (! is_file(__DIR__.'/../Frontend/public'.$path)) {
            throw new RuntimeException('Original frontend asset missing: '.$path);
        }
        $row = DB::table($table)->where('id', $id)->lockForUpdate()->first();
        $old = 'http://localhost:3000'.$path;
        $new = 'https://hiruacademy.id'.$path;
        if (! $row || ! in_array($row->$field, [$old, $new], true)) {
            throw new RuntimeException('Unexpected source reference: '.$table.'#'.$id);
        }
        DB::table($table)->where('id', $id)->update([$field => $new]);
        echo $table.'#'.$id.'.'.$field.' = '.$new.PHP_EOL;
    }
});
