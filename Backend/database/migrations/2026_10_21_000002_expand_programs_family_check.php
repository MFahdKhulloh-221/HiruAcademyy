<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE programs DROP CONSTRAINT IF EXISTS programs_family_check');
            DB::statement("ALTER TABLE programs ADD CONSTRAINT programs_family_check CHECK (family IN ('foundation', 'jlpt', 'ssw', 'interview', 'general', 'specialized'))");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE programs DROP CONSTRAINT IF EXISTS programs_family_check');
            DB::statement("ALTER TABLE programs ADD CONSTRAINT programs_family_check CHECK (family IN ('foundation', 'jlpt', 'ssw', 'interview'))");
        }
    }
};
