<?php

namespace Tests\Feature;

use App\Services\ContentTransferService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;
use ZipArchive;

class ContentTransferTest extends TestCase
{
    use DatabaseTransactions;

    private array $files = [];

    protected function tearDown(): void
    {
        foreach ($this->files as $file) if (is_file($file)) unlink($file);
        parent::tearDown();
    }

    private function archive(): array
    {
        $service = app(ContentTransferService::class);
        foreach (['checkpoint_questions' => '2026_10_28_000001_create_checkpoint_questions_table.php', 'checkpoint_packages' => '2026_10_28_000003_create_checkpoint_packages_and_attempts.php', 'checkpoint_studio_questions' => '2026_10_30_000034_add_checkpoint_studio.php', 'content_transfer_records' => '2026_10_30_000035_create_content_transfer_records.php'] as $table => $migration) {
            if (! Schema::hasTable($table)) (require database_path('migrations/'.$migration))->up();
        }
        foreach ([['try_outs', 'max_score', '2026_10_20_000002_add_try_out_builder_configuration.php'], ['try_outs', 'access_type', '2026_10_28_000003_add_access_type_to_try_outs.php'], ['try_out_questions', 'passage_id', '2026_10_29_000033_add_try_out_shared_passages.php']] as [$table, $column, $migration]) {
            if (! Schema::hasColumn($table, $column)) (require database_path('migrations/'.$migration))->up();
        }
        Storage::fake('transfer_audio');
        config(['media.disk' => 'transfer_audio', 'filesystems.disks.transfer_audio.driver' => 'local']);
        $program = DB::table('programs')->insertGetId(['code' => 'transfer-test', 'slug' => 'transfer-test', 'name' => 'Transfer', 'family' => 'jlpt', 'status' => 'active', 'sort_order' => 0]);
        $chapter = DB::table('chapters')->insertGetId(['program_id' => $program, 'chapter_number' => 901, 'title' => 'Transfer', 'status' => 'draft', 'sort_order' => 0]);
        $passage = DB::table('reading_passages')->insertGetId(['chapter_id' => $chapter, 'title' => 'Transfer passage', 'body' => '日本語', 'status' => 'draft', 'sort_order' => 0]);
        $question = ['question' => 'Transfer question?', 'options' => json_encode(['A' => 'One', 'B' => 'Two', 'C' => 'Three', 'D' => 'Four']), 'correct_option' => 'B', 'explanation' => 'Private answer explanation', 'sort_order' => 0, 'status' => 'draft'];
        DB::table('reading_questions')->insert(['reading_passage_id' => $passage, ...$question]);
        DB::table('flashcards')->insert(['chapter_id' => $chapter, 'japanese' => '学ぶ', 'reading' => 'まなぶ', 'meaning' => 'belajar', 'sort_order' => 0, 'status' => 'draft']);
        // Real WAV bytes, not an extension-only fixture.
        $wav = 'RIFF'.pack('V', 38).'WAVEfmt '.pack('VvvVVvv', 16, 1, 1, 8000, 16000, 2, 16).'data'.pack('V', 2)."\0\0";
        $audio = 'media/audio/11111111-1111-4111-8111-111111111111.wav';
        Storage::disk('transfer_audio')->put($audio, $wav);
        DB::table('audio_questions')->insert(['chapter_id' => $chapter, 'title' => 'Audio', 'audio_url' => $audio, ...$question]);
        DB::table('checkpoint_questions')->insert(['chapter_id' => $chapter, ...$question]);
        DB::table('mini_checkpoint_questions')->insert(['chapter_id' => $chapter, 'session' => 1, 'part' => 1, 'duration_minutes' => 10, 'passing_score' => 60, ...$question]);
        foreach (['try_outs' => ['try_out_passages', 'try_out_questions', 'try_out_id'], 'checkpoint_packages' => ['checkpoint_passages', 'checkpoint_studio_questions', 'checkpoint_package_id']] as $table => [$passages, $questions, $foreign]) {
            $package = DB::table($table)->insertGetId(['program_id' => $program, 'title' => 'Transfer package', 'access_type' => 'membership', 'status' => 'draft', 'max_score' => 1, 'sort_order' => 0]);
            $shared = DB::table($passages)->insertGetId([$foreign => $package, 'title' => 'Shared', 'body' => '日本語']);
            DB::table($questions)->insert([$foreign => $package, 'passage_id' => $shared, 'session' => 'reading', 'point_value' => 1, ...$question]);
        }
        $path = tempnam(sys_get_temp_dir(), 'hiru-transfer-');
        unlink($path);
        $path .= '.zip';
        $this->files[] = $path;
        $service->export($path);
        return [$service, $path, $program, $chapter, $audio];
    }

    public function test_roundtrip_remaps_preserves_keys_and_is_idempotent(): void
    {
        [$service, $path, $program, $chapter, $audio] = $this->archive();
        $zip = new ZipArchive;
        $zip->open($path);
        $manifest = json_decode($zip->getFromName('manifest.json'), true);
        $zip->close();
        $this->assertSame(array_keys($service->counts()), array_keys(ContentTransferService::MODELS));
        $this->assertArrayNotHasKey('users', $manifest['records']);
        $this->assertArrayNotHasKey('learning_attempts', $manifest['records']);
        $this->assertStringContainsString('correct_option', json_encode($manifest));
        // Change target IDs while keeping program code/chapter number.
        $newProgram = $program + 1000000;
        $newChapter = $chapter + 1000000;
        DB::statement('SET CONSTRAINTS ALL DEFERRED');
        // Remove source content within test transaction; never truncate or touch real data.
        foreach (array_reverse(array_keys(ContentTransferService::MODELS)) as $table) DB::table($table)->delete();
        DB::table('chapters')->where('id', $chapter)->delete();
        DB::table('programs')->where('id', $program)->delete();
        DB::table('programs')->insert(['id' => $newProgram, 'code' => 'transfer-test', 'slug' => 'transfer-test', 'name' => 'Target', 'family' => 'jlpt', 'status' => 'active', 'sort_order' => 0]);
        DB::table('chapters')->insert(['id' => $newChapter, 'program_id' => $newProgram, 'chapter_number' => 901, 'title' => 'Target', 'status' => 'draft', 'sort_order' => 0]);
        Storage::disk('transfer_audio')->delete($audio);
        $before = $service->counts();
        $dry = $service->import($path, false);
        $this->assertSame($before, $service->counts());
        Storage::disk('transfer_audio')->assertMissing($audio);
        $report = $service->import($path, true);
        $this->assertSame($dry['projected'], $report['after']);
        $this->assertDatabaseHas('reading_passages', ['chapter_id' => $newChapter, 'title' => 'Transfer passage']);
        $this->assertDatabaseHas('reading_questions', ['correct_option' => 'B', 'explanation' => 'Private answer explanation']);
        $this->assertSame(array_fill_keys(array_keys($before), 0), $service->import($path, true)['inserted']);
        Storage::disk('transfer_audio')->assertExists($audio);
        $this->artisan('hiru:content-import', ['archive' => $path])->assertFailed();
        $this->artisan('hiru:content-import', ['archive' => $path, '--dry-run' => true])->assertSuccessful();
    }

    public function test_corrupt_archive_and_checksum_are_rejected_without_writes(): void
    {
        [$service, $path, , , $audio] = $this->archive();
        $before = $service->counts();
        $zip = new ZipArchive;
        $zip->open($path);
        $zip->addFromString('media/'.$audio, 'corrupt audio');
        $zip->close();
        try { $service->import($path, true); $this->fail('Corrupt media accepted'); }
        catch (\RuntimeException $error) { $this->assertStringContainsString('Checksum media gagal', $error->getMessage()); }
        $this->assertSame($before, $service->counts());
        file_put_contents($path, 'not a ZIP');
        try { $service->import($path, false); $this->fail('Corrupt ZIP accepted'); }
        catch (\RuntimeException $error) { $this->assertStringContainsString('ZIP tidak dapat dibaca', $error->getMessage()); }
    }

    public function test_media_conflict_does_not_overwrite_existing_file(): void
    {
        [$service, $path, , , $audio] = $this->archive();
        $before = $service->counts();
        Storage::disk('transfer_audio')->put($audio, 'existing target audio');
        try { $service->import($path, true); $this->fail('Conflicting media accepted'); }
        catch (\RuntimeException $error) { $this->assertStringContainsString('Media target berbeda', $error->getMessage()); }
        $this->assertSame('existing target audio', Storage::disk('transfer_audio')->get($audio));
        $this->assertSame($before, $service->counts());
        $this->assertSame(0, DB::table('content_transfer_records')->count());
    }

    public function test_media_write_failure_rolls_back_database_and_removes_new_files(): void
    {
        [$service, $path, , , $audio] = $this->archive();
        $before = $service->counts();
        $disk = Storage::disk('transfer_audio');
        $disk->delete($audio);
        $failing = \Mockery::mock(\Illuminate\Filesystem\FilesystemAdapter::class);
        $failing->shouldReceive('exists')->with($audio)->andReturn(false);
        $failing->shouldReceive('put')->once()->andReturnUsing(function ($file, $bytes) use ($disk) {
            $disk->put($file, $bytes); // Simulate partially successful storage write.
            throw new \RuntimeException('injected media write failure');
        });
        $failing->shouldReceive('delete')->with($audio)->once()->andReturnUsing(fn ($file) => $disk->delete($file));
        Storage::set('transfer_audio', $failing);
        try { $service->import($path, true); $this->fail('Media failure ignored'); }
        catch (\RuntimeException $error) { $this->assertStringContainsString('injected media write failure', $error->getMessage()); }
        finally { Storage::set('transfer_audio', $disk); }
        $disk->assertMissing($audio);
        $this->assertSame($before, $service->counts());
        $this->assertSame(0, DB::table('content_transfer_records')->count());
    }

    public function test_database_failure_rolls_back_all_records_and_ledger(): void
    {
        [$service, $path] = $this->archive();
        $before = $service->counts();
        $ledgerBefore = DB::table('content_transfer_records')->count();
        DB::unprepared("CREATE FUNCTION pg_temp.reject_transfer_audio() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected transfer failure'; END $$;
            CREATE TRIGGER reject_transfer_audio BEFORE INSERT ON audio_questions FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_transfer_audio()");
        try {
            $service->import($path, true);
            $this->fail('Expected injected failure');
        } catch (\Throwable $error) {
            $this->assertStringContainsString('injected transfer failure', $error->getMessage());
        }
        $this->assertSame($before, $service->counts());
        $this->assertSame($ledgerBefore, DB::table('content_transfer_records')->count());
    }
}
