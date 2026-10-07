<?php

require __DIR__.'/../../Backend/vendor/autoload.php';
$app = require __DIR__.'/../../Backend/bootstrap/app.php';
$app->make(Illuminate\Contracts\Http\Kernel::class)->bootstrap();
if (! $app->environment('testing') || $app->configurationIsCached()) {
    throw new RuntimeException('Testing environment without config cache required.');
}
App\Support\DatabaseSafety::assertTarget(true);
$schema = getenv('HIRU_TEST_SCHEMA');
if (! is_string($schema) || ! preg_match('/^hiru_browser_test_[a-z0-9_]+$/D', $schema)
    || Illuminate\Support\Facades\DB::selectOne('SELECT current_schema() AS name')->name !== $schema) {
    throw new RuntimeException('Isolated browser schema required.');
}
$cache = sys_get_temp_dir().'/hiru-browser-test-'.getenv('HIRU_BROWSER_RUN');
if (! is_dir($cache) && ! mkdir($cache, 0700, true) && ! is_dir($cache)) {
    throw new RuntimeException('Cannot create isolated browser test cache.');
}
config(['cache.stores.file.path' => $cache, 'cache.stores.file.lock_path' => $cache]);

$path = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
if (is_string($path) && str_starts_with($path, '/storage/')) {
    $relativePath = ltrim(substr($path, 9), '/');
    $storageRoot = realpath(storage_path('app/public'));
    $targetFile = realpath(storage_path('app/public/'.$relativePath));
    if ($storageRoot && $targetFile && str_starts_with($targetFile, $storageRoot) && is_file($targetFile)) {
        $ext = strtolower(pathinfo($targetFile, PATHINFO_EXTENSION));
        $mime = match ($ext) {
            'mp4' => 'video/mp4',
            'webm' => 'video/webm',
            'mp3' => 'audio/mpeg',
            'ogg' => 'audio/ogg',
            'wav' => 'audio/wav',
            'png' => 'image/png',
            'jpg', 'jpeg' => 'image/jpeg',
            'webp' => 'image/webp',
            default => mime_content_type($targetFile) ?: 'application/octet-stream',
        };
        $size = filesize($targetFile);
        header('Access-Control-Allow-Origin: http://localhost:3020');
        header('Access-Control-Allow-Credentials: true');
        header('Accept-Ranges: bytes');
        header("Content-Type: $mime");

        $range = $_SERVER['HTTP_RANGE'] ?? null;
        if ($range && preg_match('/bytes=(\d+)-(\d*)/', $range, $matches)) {
            $start = (int) $matches[1];
            $end = $matches[2] !== '' ? (int) $matches[2] : $size - 1;
            if ($start > $end || $start >= $size) {
                http_response_code(416);
                header("Content-Range: bytes */$size");
                exit;
            }
            $length = $end - $start + 1;
            http_response_code(206);
            header("Content-Range: bytes $start-$end/$size");
            header("Content-Length: $length");
            $fp = fopen($targetFile, 'rb');
            fseek($fp, $start);
            echo fread($fp, $length);
            fclose($fp);
            exit;
        }

        header("Content-Length: $size");
        readfile($targetFile);
        exit;
    }
}

$app->handleRequest(Illuminate\Http\Request::capture());
