<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        foreach (DB::select("SELECT conname FROM pg_constraint WHERE conrelid = 'showcase_items'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%dashboard%'") as $constraint) {
            DB::statement('ALTER TABLE showcase_items DROP CONSTRAINT IF EXISTS "'.str_replace('"', '""', $constraint->conname).'"');
        }

        DB::statement("ALTER TABLE showcase_items ADD CONSTRAINT showcase_items_keys_check CHECK (key IN ('dashboard', 'journey', 'lesson', 'flashcard', 'evaluation', 'module', 'practice', 'checkpoint', 'replay', 'community'))");
    }

    public function down(): void
    {
        throw new RuntimeException('Custom showcase labels cannot be relocked without reviewing saved names.');
    }
};
