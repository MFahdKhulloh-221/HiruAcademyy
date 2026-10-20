<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            foreach (DB::select("SELECT conname FROM pg_constraint WHERE conrelid = 'showcase_items'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%dashboard%'") as $constraint) {
                DB::statement('ALTER TABLE showcase_items DROP CONSTRAINT IF EXISTS "'.str_replace('"', '""', $constraint->conname).'"');
            }
            DB::statement("ALTER TABLE showcase_items ADD CONSTRAINT showcase_items_keys_labels_check CHECK (
                (key = 'dashboard' AND label = 'Dashboard') OR
                (key = 'journey' AND label = 'Pembelajaran') OR
                (key = 'lesson' AND label = 'Materi / Video Lesson') OR
                (key = 'flashcard' AND label = 'Flashcard') OR
                (key = 'evaluation' AND label = 'Try Out / Evaluasi') OR
                (key = 'module' AND label = 'Modul') OR
                (key = 'practice' AND label = 'Latihan') OR
                (key = 'checkpoint' AND label = 'Checkpoint') OR
                (key = 'replay' AND label = 'Jadwal & Replay') OR
                (key = 'community' AND label = 'Komunitas')
            )");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE showcase_items DROP CONSTRAINT IF EXISTS showcase_items_keys_labels_check');
            DB::statement("ALTER TABLE showcase_items ADD CONSTRAINT showcase_items_check CHECK (
                (key = 'dashboard' AND label = 'Dashboard') OR
                (key = 'journey' AND label = 'Pembelajaran') OR
                (key = 'lesson' AND label = 'Materi / Video Lesson') OR
                (key = 'flashcard' AND label = 'Flashcard') OR
                (key = 'evaluation' AND label = 'Try Out / Evaluasi')
            )");
        }
    }
};
