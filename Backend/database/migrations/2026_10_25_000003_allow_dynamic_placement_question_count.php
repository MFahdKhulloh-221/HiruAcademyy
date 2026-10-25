<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE placement_configs DROP CONSTRAINT IF EXISTS placement_question_count');
        DB::statement('ALTER TABLE placement_configs ALTER COLUMN question_count SET DEFAULT 15');
    }

    public function down(): void
    {
        // Do not reinstate a limit that rejects configurations created after this migration.
        DB::statement('ALTER TABLE placement_configs ALTER COLUMN question_count SET DEFAULT 12');
    }
};
