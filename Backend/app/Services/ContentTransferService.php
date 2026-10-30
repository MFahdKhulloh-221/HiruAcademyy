<?php

namespace App\Services;

use App\Models\{AudioQuestion, Chapter, CheckpointPackage, CheckpointPassage, CheckpointQuestion, CheckpointStudioQuestion, Flashcard, MiniCheckpointQuestion, Program, ReadingPassage, ReadingQuestion, TryOut, TryOutPassage, TryOutQuestion};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use ZipArchive;

final class ContentTransferService
{
    // Ordered parents first. Deliberately excludes identities, commerce and all student state.
    public const MODELS = [
        'try_outs' => TryOut::class,
        'try_out_passages' => TryOutPassage::class,
        'try_out_questions' => TryOutQuestion::class,
        'checkpoint_packages' => CheckpointPackage::class,
        'checkpoint_passages' => CheckpointPassage::class,
        'checkpoint_studio_questions' => CheckpointStudioQuestion::class,
        'reading_passages' => ReadingPassage::class,
        'reading_questions' => ReadingQuestion::class,
        'audio_questions' => AudioQuestion::class,
        'checkpoint_questions' => CheckpointQuestion::class,
        'mini_checkpoint_questions' => MiniCheckpointQuestion::class,
        'flashcards' => Flashcard::class,
        'checkpoint_package_questions' => null,
    ];

    private const REFERENCES = [
        'program_id' => 'programs', 'chapter_id' => 'chapters',
        'try_out_id' => 'try_outs', 'checkpoint_package_id' => 'checkpoint_packages',
        'reading_passage_id' => 'reading_passages', 'checkpoint_question_id' => 'checkpoint_questions',
    ];

    private function fields(string $table): array
    {
        if ($table === 'checkpoint_package_questions') {
            return ['checkpoint_package_id', 'checkpoint_question_id', 'session', 'audio_url', 'reading_passage', 'sort_order'];
        }
        $fields = (new (self::MODELS[$table]))->getFillable();
        return $table === 'checkpoint_packages' ? [...$fields, 'passing_score'] : $fields;
    }

    private function reference(string $table, string $field): ?string
    {
        if ($field === 'passage_id') {
            return $table === 'try_out_questions' ? 'try_out_passages' : 'checkpoint_passages';
        }
        return self::REFERENCES[$field] ?? null;
    }

    private function require(bool $condition, string $message): void
    {
        if (! $condition) throw new RuntimeException($message);
    }

    private function canonical(mixed $value): mixed
    {
        if (! is_array($value)) return $value;
        if (! array_is_list($value)) ksort($value);
        return array_map(fn ($item) => $this->canonical($item), $value);
    }

    private function json(mixed $value): string
    {
        return json_encode($this->canonical($value), JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    private function hash(array $value): string
    {
        return hash('sha256', $this->json($value));
    }

    private function attributes(string $table, object $row): array
    {
        $data = array_intersect_key((array) $row, array_flip($this->fields($table)));
        $casts = self::MODELS[$table] ? (new (self::MODELS[$table]))->getCasts() : [];
        foreach ($casts as $field => $cast) {
            if ($cast === 'array' && isset($data[$field]) && is_string($data[$field])) {
                try { $data[$field] = json_decode($data[$field], true, 512, JSON_THROW_ON_ERROR); }
                catch (\JsonException $error) { throw new RuntimeException('JSON tidak valid: '.$table.' #'.$row->id.'.'.$field, 0, $error); }
            }
        }
        return $data;
    }

    public function counts(): array
    {
        return array_map(fn ($table) => DB::table($table)->count(), array_combine(array_keys(self::MODELS), array_keys(self::MODELS)));
    }

    public function export(string $path): array
    {
        $this->require(! file_exists($path), 'Arsip tujuan sudah ada; tidak ditimpa.');
        $this->require(is_dir(dirname($path)) && is_writable(dirname($path)), 'Direktori tujuan tidak tersedia.');
        $zip = new ZipArchive;
        $temporary = $path.'.'.bin2hex(random_bytes(6)).'.partial';
        $this->require($zip->open($temporary, ZipArchive::CREATE | ZipArchive::EXCL) === true, 'Gagal membuat ZIP.');
        try {
            $manifest = DB::transaction(function () use ($zip) {
                if (DB::transactionLevel() === 1) DB::statement('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
                $data = ['format' => 'hiru-question-bank', 'version' => 1, 'programs' => [], 'chapters' => [], 'records' => [], 'media' => [], 'external_media' => []];
                foreach (self::MODELS as $table => $model) {
                    $data['records'][$table] = [];
                    foreach (DB::table($table)->orderBy('id')->get() as $row) {
                        $attributes = $this->attributes($table, $row);
                        if (! empty($attributes['audio_url'])) $attributes['audio_url'] = $this->exportMedia($attributes['audio_url'], $data, $zip);
                        $data['records'][$table][] = ['source_id' => $row->id, 'attributes' => $attributes];
                    }
                }
                $programIds = $chapterIds = [];
                foreach ($data['records'] as $rows) foreach ($rows as $row) {
                    if (isset($row['attributes']['program_id'])) $programIds[] = $row['attributes']['program_id'];
                    if (isset($row['attributes']['chapter_id'])) $chapterIds[] = $row['attributes']['chapter_id'];
                }
                foreach (Chapter::whereIn('id', array_unique($chapterIds))->get() as $chapter) {
                    $data['chapters'][] = ['source_id' => $chapter->id, 'program_id' => $chapter->program_id, 'chapter_number' => $chapter->chapter_number];
                    $programIds[] = $chapter->program_id;
                }
                foreach (Program::whereIn('id', array_unique($programIds))->get() as $program) $data['programs'][] = ['source_id' => $program->id, 'code' => $program->code];
                $data['external_media'] = array_values(array_unique($data['external_media']));
                $data['counts'] = array_map('count', $data['records']);
                $this->validate($data);
                return $data;
            });
            $this->require($zip->addFromString('manifest.json', $this->json($manifest)), 'Gagal menulis manifest.');
            $this->require($zip->close(), 'Gagal menyelesaikan ZIP.');
            $zip = null;
            $this->require(rename($temporary, $path), 'Gagal memindahkan ZIP.');
            @chmod($path, 0600);
            return ['counts' => $manifest['counts'], 'media' => count($manifest['media']), 'external_media' => $manifest['external_media'], 'sha256' => hash_file('sha256', $path)];
        } finally {
            if ($zip) $zip->close();
            if (file_exists($temporary)) unlink($temporary);
        }
    }

    private function safePath(string $path): bool
    {
        return (bool) preg_match('~^[A-Za-z0-9_-]+(?:/[A-Za-z0-9_.-]+)+$~D', $path)
            && ! preg_match('~(?:^|/)\.{1,2}(?:/|$)~', $path);
    }

    private function exportMedia(string $reference, array &$data, ZipArchive $zip): string
    {
        $parts = parse_url($reference);
        $this->require($parts !== false && ! isset($parts['user']) && ! isset($parts['pass']), 'Referensi audio tidak aman.');
        if (isset($parts['scheme'])) {
            $this->require(in_array($parts['scheme'], ['http', 'https'], true), 'Skema audio tidak didukung.');
            if (! in_array(strtolower($parts['host'] ?? ''), ['localhost', '127.0.0.1', '::1', '[::1]'], true)) {
                $data['external_media'][] = $reference;
                return $reference;
            }
            $reference = ltrim($parts['path'] ?? '', '/');
        }
        $path = preg_replace('~^/?storage/~', '', $reference);
        $this->require($this->safePath($path), 'Path audio tidak aman: '.$reference);
        if (isset($data['media'][$path])) return $path;
        $diskName = config('media.disk');
        $this->require(config("filesystems.disks.$diskName.driver") === 'local', 'Export media hanya membaca disk lokal; bukan S3/production.');
        $disk = Storage::disk($diskName);
        $file = $disk->exists($path) ? $disk->path($path) : null;
        if (! $file) {
            foreach ([public_path($path), base_path('../Frontend/public/'.$path)] as $candidate) if (is_file($candidate)) { $file = $candidate; break; }
        }
        $this->require($file !== null && is_file($file) && is_readable($file), 'File audio lokal hilang: '.$path);
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($file);
        $this->require(isset(MediaService::FORMATS['audio'][$mime]), 'Format audio tidak didukung: '.$path);
        $bytes = file_get_contents($file);
        $this->require($bytes !== false && $zip->addFromString('media/'.$path, $bytes), 'Gagal membaca audio: '.$path);
        $data['media'][$path] = ['sha256' => hash('sha256', $bytes), 'size' => strlen($bytes), 'mime' => $mime];
        return $path;
    }

    private function validate(array $data): void
    {
        $this->require(($data['format'] ?? '') === 'hiru-question-bank' && ($data['version'] ?? null) === 1, 'Format arsip tidak didukung.');
        $this->require(isset($data['records']) && is_array($data['records']) && count($data['records']) === count(self::MODELS) && ! array_diff(array_keys(self::MODELS), array_keys($data['records'])), 'Kategori arsip tidak lengkap atau tidak diizinkan.');
        $ids = [];
        foreach (['programs', 'chapters', ...array_keys(self::MODELS)] as $table) {
            $rows = in_array($table, ['programs', 'chapters'], true) ? ($data[$table] ?? []) : $data['records'][$table];
            $this->require(is_array($rows) && array_is_list($rows), 'Daftar record tidak valid: '.$table);
            foreach ($rows as $row) {
                $id = $row['source_id'] ?? null;
                $this->require(is_int($id) && $id > 0 && ! isset($ids[$table][$id]), 'ID sumber tidak valid/duplikat: '.$table);
                $ids[$table][$id] = $row;
            }
        }
        foreach ($data['chapters'] as $chapter) $this->require(isset($ids['programs'][$chapter['program_id'] ?? 0]) && is_int($chapter['chapter_number'] ?? null), 'Relasi chapter tidak valid.');
        foreach (self::MODELS as $table => $model) {
            $this->require(Schema::hasTable($table), 'Schema target belum mendukung '.$table.'; jalankan migration aplikasi yang sesuai terlebih dahulu.');
            $columns = Schema::getColumnListing($table);
            foreach ($data['records'][$table] as $row) {
                $a = $row['attributes'] ?? null;
                $this->require(is_array($a) && ! array_diff(array_keys($a), $this->fields($table)) && ! array_diff(array_keys($a), $columns), 'Kolom tidak diizinkan/tidak tersedia: '.$table);
                foreach ($a as $field => $value) {
                    if ($parent = $this->reference($table, $field)) $this->require($value === null || (is_int($value) && isset($ids[$parent][$value])), 'Relasi hilang: '.$table.'.'.$field);
                }
                foreach (self::REFERENCES as $field => $parent) if (in_array($field, $this->fields($table), true)) $this->require(isset($a[$field]), 'Relasi wajib hilang: '.$table.'.'.$field);
                if (str_ends_with($table, '_questions') && $table !== 'checkpoint_package_questions') {
                    $this->require(is_string($a['question'] ?? null) && trim($a['question']) !== '' && is_array($a['options'] ?? null) && count($a['options']) === 4 && ! array_diff(['A', 'B', 'C', 'D'], array_keys($a['options'])) && in_array($a['correct_option'] ?? null, ['A', 'B', 'C', 'D'], true), 'Pertanyaan/opsi/kunci tidak valid: '.$table);
                    foreach ($a['options'] as $option) $this->require(is_string($option) && trim($option) !== '', 'Opsi kosong: '.$table);
                }
                if (! empty($a['passage_id'])) {
                    $parent = $this->reference($table, 'passage_id');
                    $owner = $table === 'try_out_questions' ? 'try_out_id' : 'checkpoint_package_id';
                    $this->require($ids[$parent][$a['passage_id']]['attributes'][$owner] === $a[$owner], 'Passage berasal dari paket berbeda.');
                }
                if (! empty($a['audio_url'])) {
                    $url = $a['audio_url'];
                    $this->require(is_string($url) && app(MediaService::class)->valid($url, 'audio') || (is_string($url) && $this->safePath($url) && isset($data['media'][$url])), 'Referensi audio tidak valid.');
                    if (! preg_match('~^https?://~', $url)) $this->require(isset($data['media'][$url]), 'Audio lokal tidak disertakan.');
                }
            }
        }
        $this->require(($data['counts'] ?? []) == array_map('count', $data['records']), 'Jumlah record manifest tidak cocok.');
    }

    public function import(string $path, bool $apply): array
    {
        $zip = new ZipArchive;
        $this->require(is_file($path) && $zip->open($path, ZipArchive::RDONLY) === true, 'ZIP tidak dapat dibaca.');
        $createdFiles = [];
        try {
            $raw = $zip->getFromName('manifest.json');
            $this->require(is_string($raw), 'Manifest hilang.');
            $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
            $this->validate($data);
            $hash = $this->hash($data);
            $hasLedger = Schema::hasTable('content_transfer_records');
            $this->require(! $apply || $hasLedger, 'Jalankan migration content_transfer_records sebelum --apply.');
            $disk = Storage::disk(config('media.disk'));
            $allowedEntries = ['manifest.json'];
            foreach ($data['media'] as $file => $meta) {
                $this->require($this->safePath($file), 'Path media tidak aman.');
                $bytes = $zip->getFromName('media/'.$file);
                $this->require(is_string($bytes) && strlen($bytes) === $meta['size'] && hash('sha256', $bytes) === $meta['sha256'], 'Checksum media gagal: '.$file);
                $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes);
                $this->require(isset(MediaService::FORMATS['audio'][$mime]) && $mime === $meta['mime'], 'Konten media bukan audio yang didukung.');
                if ($disk->exists($file)) $this->require(hash('sha256', $disk->get($file)) === $meta['sha256'], 'Media target berbeda; tidak ditimpa: '.$file);
                $allowedEntries[] = 'media/'.$file;
            }
            $this->require($zip->numFiles === count($allowedEntries), 'Entri ZIP tambahan/duplikat ditolak.');
            for ($i = 0; $i < $zip->numFiles; $i++) $this->require(in_array($zip->getNameIndex($i), $allowedEntries, true), 'Entri ZIP tidak diizinkan.');
            return DB::transaction(function () use ($data, $hash, $apply, $hasLedger, $zip, $disk, &$createdFiles) {
                // Serialize imports and media deletion; lock only content and mapping tables.
                DB::select('SELECT pg_advisory_xact_lock(hashtext(?))', ['hiru-content-transfer']);
                DB::select('SELECT pg_advisory_xact_lock(hashtext(?))', ['managed-media-references']);
                DB::statement('LOCK TABLE programs, chapters, '.implode(', ', array_keys(self::MODELS)).($hasLedger ? ', content_transfer_records' : '').' IN SHARE ROW EXCLUSIVE MODE');
                $before = $this->counts();
                $map = [];
                foreach ($data['programs'] as $program) {
                    $matches = Program::where('code', $program['code'])->pluck('id');
                    $this->require($matches->count() === 1, 'Program tidak ditemukan/ambigu: '.$program['code']);
                    $map['programs'][$program['source_id']] = $matches->first();
                }
                foreach ($data['chapters'] as $chapter) {
                    $matches = Chapter::where('program_id', $map['programs'][$chapter['program_id']])->where('chapter_number', $chapter['chapter_number'])->pluck('id');
                    $this->require($matches->count() === 1, 'Chapter tidak ditemukan/ambigu: '.$chapter['chapter_number']);
                    $map['chapters'][$chapter['source_id']] = $matches->first();
                }
                $inserted = $skipped = array_fill_keys(array_keys(self::MODELS), 0);
                foreach (self::MODELS as $table => $model) foreach ($data['records'][$table] as $row) {
                    $a = $row['attributes'];
                    foreach ($a as $field => $value) if ($value !== null && ($parent = $this->reference($table, $field))) $a[$field] = $map[$parent][$value];
                    $ledger = $hasLedger ? DB::table('content_transfer_records')->where(['archive_hash' => $hash, 'category' => $table, 'source_id' => $row['source_id']])->first() : null;
                    if ($ledger) {
                        $existing = DB::table($table)->find($ledger->target_id);
                        $this->require($existing && $this->hash($this->attributes($table, $existing)) === $ledger->record_hash && $this->hash($a) === $ledger->record_hash, 'Konten import sebelumnya telah berubah/hilang: '.$table.' #'.$ledger->target_id.'; tidak ditimpa.');
                        $id = $ledger->target_id;
                        $skipped[$table]++;
                    } else {
                        $inserted[$table]++;
                        $id = -$row['source_id'];
                        if ($apply) {
                            $values = $a;
                            foreach ($values as $key => $value) if (is_array($value)) $values[$key] = $this->json($value);
                            if ($table !== 'checkpoint_package_questions') $values += ['created_at' => now(), 'updated_at' => now()];
                            $id = DB::table($table)->insertGetId($values);
                            $saved = $this->attributes($table, DB::table($table)->find($id));
                            DB::table('content_transfer_records')->insert(['archive_hash' => $hash, 'category' => $table, 'source_id' => $row['source_id'], 'target_id' => $id, 'record_hash' => $this->hash($saved)]);
                        }
                    }
                    $map[$table][$row['source_id']] = $id;
                }
                if ($apply) foreach ($data['media'] as $file => $meta) {
                    if ($disk->exists($file)) continue;
                    $createdFiles[] = $file;
                    $this->require($disk->put($file, $zip->getFromName('media/'.$file)), 'Gagal menulis media: '.$file);
                    $this->require(hash('sha256', $disk->get($file)) === $meta['sha256'], 'Verifikasi media target gagal.');
                }
                $after = $this->counts();
                if ($apply) foreach ($before as $table => $count) $this->require($after[$table] === $count + $inserted[$table], 'Jumlah record setelah import tidak sesuai.');
                return ['before' => $before, 'inserted' => $inserted, 'skipped' => $skipped, 'after' => $after, 'projected' => array_map(fn ($table) => $before[$table] + $inserted[$table], array_combine(array_keys($before), array_keys($before))), 'media' => count($data['media']), 'external_media' => $data['external_media'], 'archive_hash' => $hash];
            });
        } catch (\Throwable $error) {
            foreach ($createdFiles as $file) {
                try { $this->require($disk->delete($file), 'Gagal membersihkan media rollback: '.$file); }
                catch (\Throwable $cleanup) { throw new RuntimeException($error->getMessage().' Cleanup: '.$cleanup->getMessage(), 0, $error); }
            }
            throw $error;
        } finally {
            $zip->close();
        }
    }
}
