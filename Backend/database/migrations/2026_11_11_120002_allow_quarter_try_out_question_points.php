<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE try_out_questions DROP CONSTRAINT try_out_questions_point_fraction_check');
            DB::statement('ALTER TABLE try_out_questions ADD CONSTRAINT try_out_questions_point_fraction_check CHECK (point_value BETWEEN 1 AND 180 AND point_value % 1 IN (0, 0.25, 0.50, 0.75))');
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            if (DB::table('try_out_questions')->whereRaw('point_value % 1 = 0.25')->exists()) {
                throw new RuntimeException('Quarter-point Try Out weights exist; convert them explicitly before rollback.');
            }
            DB::statement('ALTER TABLE try_out_questions DROP CONSTRAINT try_out_questions_point_fraction_check');
            DB::statement('ALTER TABLE try_out_questions ADD CONSTRAINT try_out_questions_point_fraction_check CHECK (point_value BETWEEN 1 AND 180 AND point_value % 1 IN (0, 0.50, 0.75))');
        }
    }
};
