<?php

namespace App\Console\Commands;

use App\Services\ContentTransferService;
use App\Support\DatabaseSafety;
use Illuminate\Console\Command;

class ContentExport extends Command
{
    protected $signature = 'hiru:content-export {--output= : Absolute destination ZIP path (must not exist)}';
    protected $description = 'Export local question content and local audio only; excludes student and commercial data';

    public function handle(ContentTransferService $transfer): int
    {
        try {
            DatabaseSafety::assertTarget(app()->environment('testing'));
            $directory = storage_path('app/private/content-transfers');
            if (! is_dir($directory) && ! mkdir($directory, 0700, true)) throw new \RuntimeException('Gagal membuat direktori export.');
            $path = $this->option('output') ?: $directory.'/question-bank-'.now()->format('Ymd-His').'.zip';
            $report = $transfer->export($path);
            $this->table(['Kategori', 'Export'], collect($report['counts'])->map(fn ($count, $table) => [$table, $count])->all());
            $this->info('Arsip: '.$path);
            $this->line('SHA-256: '.$report['sha256']);
            $this->line('Media lokal: '.$report['media'].'; referensi eksternal: '.count($report['external_media']));
            $this->warn('Arsip memuat kunci jawaban. Simpan privat; jangan unggah ke public storage/Git. URL eksternal dipertahankan, tidak diunduh atau dicek melalui jaringan.');
            return self::SUCCESS;
        } catch (\Throwable $error) {
            $this->error($error->getMessage());
            return self::FAILURE;
        }
    }
}
