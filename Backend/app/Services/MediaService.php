<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class MediaService
{
    public const FORMATS = [
        'image' => ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'],
        'audio' => ['audio/mpeg' => 'mp3', 'audio/wav' => 'wav', 'audio/x-wav' => 'wav', 'audio/ogg' => 'ogg'],
        'video' => ['video/mp4' => 'mp4', 'video/webm' => 'webm'],
    ];

    public const FIELDS = ['photo', 'image_src', 'image', 'thumbnail', 'video_url', 'audio_url', 'file_url'];

    public function rule(string $kind = 'reference'): \Closure
    {
        return function ($attribute, $value, $fail) use ($kind) {
            if (! is_string($value) || ! $this->valid($value, $kind)) {
                $fail('Use a safe media reference or supported HTTP/HTTPS media URL without credentials.');
            }
        };
    }

    public function valid(string $value, string $kind = 'reference'): bool
    {
        $decoded = $value;
        for ($i = 0; $i < 3; $i++) {
            $decoded = rawurldecode($decoded);
        }
        if ($decoded === '' || preg_match('/[\x00-\x20\x7f\\\\]/', $decoded) || str_contains($decoded, '%')) {
            return false;
        }
        $parts = parse_url($decoded);
        if ($parts === false || isset($parts['user']) || isset($parts['pass']) || preg_match('~(?:^|/)\.{1,2}(?:/|$)~', $parts['path'] ?? '')) {
            return false;
        }
        $remote = isset($parts['scheme']);
        if ($remote) {
            if (! in_array(strtolower($parts['scheme']), ['http', 'https'], true) || ! filter_var($value, FILTER_VALIDATE_URL) || empty($parts['host'])) {
                return false;
            }
        } elseif (str_starts_with($decoded, '/') || isset($parts['host']) || str_contains($decoded, ':') || isset($parts['query']) || isset($parts['fragment'])) {
            return false;
        }
        if ($kind === 'reference') {
            return ! str_starts_with($value, 'media/') || ($this->managed($value) && Storage::disk(config('media.disk'))->exists($value));
        }
        if ($kind === 'video' && $remote && $this->youtube($parts)) {
            return true;
        }
        $extensions = array_values(self::FORMATS[$kind] ?? []);
        if (! in_array(strtolower(pathinfo($parts['path'] ?? '', PATHINFO_EXTENSION)), $extensions, true)) {
            return false;
        }
        if (! $remote && str_starts_with($value, 'media/')) {
            if (! $this->managed($value, $kind)) {
                return false;
            }
            $disk = Storage::disk(config('media.disk'));

            return $disk->exists($value) && isset(self::FORMATS[$kind][$disk->mimeType($value)]);
        }

        return $remote || ($kind === 'image' && ! str_starts_with($value, 'media/'));
    }

    private function youtube(array $parts): bool
    {
        $host = strtolower($parts['host']);
        $path = $parts['path'] ?? '';
        if ($host === 'youtu.be') {
            return (bool) preg_match('~^/[A-Za-z0-9_-]{11}/?$~D', $path);
        }
        if (! in_array($host, ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com'], true)) {
            return false;
        }
        if (preg_match('~^/(?:embed|shorts)/[A-Za-z0-9_-]{11}/?$~D', $path)) {
            return true;
        }
        parse_str($parts['query'] ?? '', $query);

        return $path === '/watch' && is_string($query['v'] ?? null) && (bool) preg_match('/^[A-Za-z0-9_-]{11}$/D', $query['v']);
    }

    public function upload(UploadedFile $file, string $kind): array
    {
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($file->getRealPath());
        $extension = self::FORMATS[$kind][$mime] ?? null;
        if (! $file->isValid() || ! $extension || ! in_array(strtolower($file->getClientOriginalExtension()), [$extension, ...($extension === 'jpg' ? ['jpeg'] : [])], true)) {
            throw ValidationException::withMessages(['file' => 'File content and extension must match an approved media format.']);
        }
        if ($kind === 'image' && @getimagesize($file->getRealPath()) === false) {
            throw ValidationException::withMessages(['file' => 'Invalid image content.']);
        }
        $path = 'media/'.$kind.'/'.Str::uuid().'.'.$extension;
        $disk = Storage::disk(config('media.disk'));
        if (! $disk->putFileAs(dirname($path), $file, basename($path))) {
            abort(503, 'Media storage unavailable.');
        }
        try {
            $url = $this->url($path);
        } catch (\Throwable $exception) {
            $disk->delete($path);
            throw $exception;
        }

        return ['path' => $path, 'url' => $url, 'mime_type' => $mime];
    }

    public function managed(string $path, ?string $kind = null): bool
    {
        foreach (self::FORMATS as $type => $formats) {
            if (($kind === null || $kind === $type) && preg_match('~^media/'.$type.'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:'.implode('|', array_unique($formats)).')$~D', $path)) {
                return true;
            }
        }

        return false;
    }

    public function url(?string $reference): ?string
    {
        if ($reference === null || $reference === '') {
            return null;
        }
        if (! $this->valid($reference)) {
            return null;
        }
        if (isset(parse_url($reference)['scheme'])) {
            return $reference;
        }
        $name = config('media.disk');
        $disk = Storage::disk($name);
        if (config("filesystems.disks.{$name}.visibility") === 'public') {
            return $disk->url($reference);
        }
        if (! $this->managed($reference)) {
            return null;
        }
        if (! $disk->providesTemporaryUrls()) {
            abort(503, 'Private media disk requires temporary URL support.');
        }

        return $disk->temporaryUrl($reference, now()->addMinutes(max(1, config('media.url_lifetime_minutes'))));
    }

    public function payload(array $data): array
    {
        foreach ($data as $field => $value) {
            if (is_array($value)) {
                $data[$field] = $this->payload($value);
            } elseif (in_array($field, self::FIELDS, true)) {
                $data[$field.'_resolved_url'] = $this->url($value);
            }
        }

        return $data;
    }

    public function locked(callable $operation): mixed
    {
        return DB::transaction(function () use ($operation) {
            DB::select('SELECT pg_advisory_xact_lock(hashtext(?))', ['managed-media-references']);

            return $operation();
        });
    }

    public function delete(string $path): void
    {
        $this->locked(fn () => $this->deleteUnreferenced($path));
    }

    private function deleteUnreferenced(string $path): void
    {
        abort_unless($this->managed($path), 422, 'Only managed media paths may be deleted.');
        DB::statement('LOCK TABLE sensei_profiles, showcase_items, testimonials, blog_articles, certificate_templates, video_lessons, audio_questions, learning_modules, replay_videos, placement_questions, try_out_questions, learning_attempts, placement_attempts, try_out_attempts IN SHARE ROW EXCLUSIVE MODE');
        foreach ([
            'sensei_profiles' => ['photo'], 'showcase_items' => ['image_src'],
            'testimonials' => ['image', 'video_url'], 'blog_articles' => ['thumbnail'],
            'certificate_templates' => ['image'], 'video_lessons' => ['video_url'],
            'audio_questions' => ['audio_url'], 'learning_modules' => ['file_url'],
            'replay_videos' => ['video_url'], 'placement_questions' => ['audio_url'],
            'try_out_questions' => ['audio_url'],
        ] as $table => $fields) {
            foreach ($fields as $field) {
                if (DB::table($table)->where($field, $path)->exists()) {
                    abort(409, 'Media is still referenced. Clear content references before deletion.');
                }
            }
        }
        foreach (['learning_attempts', 'placement_attempts', 'try_out_attempts'] as $table) {
            if (DB::table($table)->whereRaw('content_snapshot::text LIKE ?', ['%'.$path.'%'])->exists()) {
                abort(409, 'Media is retained in an assessment snapshot.');
            }
        }
        $disk = Storage::disk(config('media.disk'));
        if ($disk->exists($path) && ! $disk->delete($path)) {
            abort(503, 'Media deletion failed.');
        }
    }
}
