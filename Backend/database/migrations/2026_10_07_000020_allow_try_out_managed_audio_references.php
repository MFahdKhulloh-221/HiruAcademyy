<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $constraints = DB::select("SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = 'try_out_questions'::regclass AND contype = 'c'");
        foreach ($constraints as $constraint) {
            if (str_contains($constraint->definition, 'audio_url') && str_contains($constraint->definition, '^https?://')) {
                DB::statement('ALTER TABLE try_out_questions DROP CONSTRAINT "'.str_replace('"', '""', $constraint->conname).'"');
            }
        }
        DB::statement("ALTER TABLE try_out_questions ADD CONSTRAINT try_out_questions_published_audio_reference CHECK (status <> 'published' OR session <> 'audio' OR (audio_url IS NOT NULL AND (audio_url ~ '^https?://' OR audio_url ~ '^media/audio/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(mp3|wav|ogg)$'))) ");
    }

    public function down(): void
    {
        if (DB::table('try_out_questions')->where('status', 'published')->where('session', 'audio')->where('audio_url', 'like', 'media/%')->exists()) {
            throw new RuntimeException('Managed audio references exist; rollback requires explicit reconciliation.');
        }
        DB::statement('ALTER TABLE try_out_questions DROP CONSTRAINT try_out_questions_published_audio_reference');
        DB::statement("ALTER TABLE try_out_questions ADD CHECK (status <> 'published' OR session <> 'audio' OR (audio_url IS NOT NULL AND audio_url ~ '^https?://'))");
    }
};
