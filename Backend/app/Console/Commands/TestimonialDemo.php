<?php

namespace App\Console\Commands;

use App\Models\Testimonial;
use App\Services\MediaService;
use App\Services\PublicContentService;
use App\Support\DatabaseSafety;
use Illuminate\Console\Command;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;

class TestimonialDemo extends Command
{
    protected $signature = 'hiru:testimonials:demo {--confirm-local-demo : Allow writes only to an isolated local test schema}';

    protected $description = 'Load two explicitly labelled brand placeholder videos into an isolated local demo';

    public function handle(): int
    {
        try {
            if (! $this->option('confirm-local-demo') || ! app()->environment('testing') || app()->configurationIsCached()) {
                throw new \RuntimeException('Explicit confirmation and uncached testing environment required.');
            }
            DatabaseSafety::assertTarget(true);
            $schema = getenv('HIRU_TEST_SCHEMA');
            if (! is_string($schema) || ! preg_match('/^hiru_backend_test_testimonial_demo_[a-z0-9_]+$/D', $schema)
                || DB::selectOne('SELECT current_schema() AS name')->name !== $schema) {
                throw new \RuntimeException('Dedicated local testimonial demo schema required.');
            }
            $disk = config('media.disk');
            if ($disk !== 'public' || config("filesystems.disks.{$disk}.driver") !== 'local') {
                throw new \RuntimeException('Local public media disk required; remote storage prohibited.');
            }
            $media = app(MediaService::class);
            $content = app(PublicContentService::class);
            // ponytail: fixed local fixtures only; real content stays in existing admin API.
            foreach (['01' => 'mp4', '02' => 'webm'] as $number => $extension) {
                $name = 'Demo / Preview untuk Evaluasi Client '.$number;
                $file = base_path('../assets/demo-testimonials/hiru-demo-'.$number.'.'.$extension);
                if (! is_file($file)) {
                    throw new \RuntimeException('Missing demo asset: '.$file);
                }
                $row = $media->locked(function () use ($media, $content, $name, $file, $number) {
                    $existing = Testimonial::where('source', 'admin')->where('name', $name)->first();
                    if ($existing) {
                        if (! $media->valid($existing->video_url ?? '', 'video')) {
                            throw new \RuntimeException('Existing demo media invalid; repair through admin API.');
                        }

                        return $existing;
                    }
                    $upload = $media->upload(new UploadedFile($file, basename($file), null, null, true), 'video');
                    $thumbnail = null;
                    try {
                        $thumbnailFile = base_path('../assets/video.png');
                        $thumbnail = $media->upload(new UploadedFile($thumbnailFile, basename($thumbnailFile), null, null, true), 'image');
                        return $content->save('testimonials', [
                            'name' => $name, 'context' => 'Demo / Preview untuk Evaluasi Client',
                            'quote' => 'Placeholder brand lokal; bukan siswa dan bukan testimoni nyata.',
                            'video_thumbnail' => $thumbnail['path'],
                            'video_url' => $upload['path'], 'video_title' => 'Demo Video Testimoni — Preview',
                            'published' => true, 'landing' => false, 'sort_order' => (int) $number,
                        ]);
                    } catch (\Throwable $exception) {
                        $media->delete($upload['path']);
                        if ($thumbnail !== null) {
                            $media->delete($thumbnail['path']);
                        }
                        throw $exception;
                    }
                });
                $this->info($name.' | id='.$row->id.' | '.$row->video_url);
            }

            return self::SUCCESS;
        } catch (\Throwable $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }
    }
}
