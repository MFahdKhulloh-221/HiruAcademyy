<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE gamification_days DROP CONSTRAINT gamification_days_xp_check');
        DB::statement('ALTER TABLE gamification_days ALTER COLUMN xp TYPE bigint');
        DB::statement('ALTER TABLE gamification_days ADD CONSTRAINT gamification_days_xp_check CHECK (xp >= 0)');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE gamification_days DROP CONSTRAINT gamification_days_xp_check');
        DB::statement('ALTER TABLE gamification_days ALTER COLUMN xp TYPE smallint');
        DB::statement('ALTER TABLE gamification_days ADD CONSTRAINT gamification_days_xp_check CHECK (xp BETWEEN 0 AND 50)');
    }
};
