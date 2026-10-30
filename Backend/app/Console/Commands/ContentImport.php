<?php

namespace App\Console\Commands;

use App\Services\ContentTransferService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class ContentImport extends Command
{
    protected $signature = 'hiru:content-import {archive : Trusted transfer ZIP path} {--dry-run : Validate and plan without writing} {--apply : Insert content and copy media}';
    protected $description = 'Import question bank additively with relationship remapping and archive idempotency';

    public function handle(ContentTransferService $transfer): int
    {
        try {
            if ((bool) $this->option('dry-run') === (bool) $this->option('apply')) throw new \RuntimeException('Pilih tepat satu: --dry-run atau --apply.');
            $this->line('Target: '.DB::connection()->getDatabaseName().' ('.DB::connection()->getConfig('host').')');
            $report = $transfer->import($this->argument('archive'), (bool) $this->option('apply'));
            $rows = [];
            foreach ($report['before'] as $table => $count) $rows[] = [$table, $count, $report['inserted'][$table], $report['skipped'][$table], $report['after'][$table], $report['projected'][$table]];
            $this->table(['Kategori', 'Sebelum', 'Tambah/rencana', 'Lewati', 'Sesudah', 'Proyeksi'], $rows);
            $this->line('Media: '.$report['media'].'; referensi eksternal: '.count($report['external_media']));
            $this->info($this->option('apply') ? 'Import selesai; konten target sebelumnya tidak ditimpa.' : 'Dry-run selesai; tidak ada perubahan DB/media.');
            return self::SUCCESS;
        } catch (\Throwable $error) {
            $this->error('Import dibatalkan: '.$error->getMessage());
            return self::FAILURE;
        }
    }
}
