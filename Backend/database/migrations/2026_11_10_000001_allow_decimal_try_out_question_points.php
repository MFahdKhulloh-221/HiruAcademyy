<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('try_out_questions', function (Blueprint $table) {
            $table->decimal('point_value', 5, 2)->change();
        });
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE try_out_questions ADD CONSTRAINT try_out_questions_point_fraction_check CHECK (point_value BETWEEN 1 AND 180 AND point_value % 1 IN (0, 0.50, 0.75))');
        }
    }

    public function down(): void
    {
        // Refuse rollback rather than silently lose fractional question weights.
        if (DB::table('try_out_questions')->whereRaw('point_value <> FLOOR(point_value)')->exists()) {
            throw new RuntimeException('Decimal Try Out weights exist; convert them explicitly before rollback.');
        }
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE try_out_questions DROP CONSTRAINT try_out_questions_point_fraction_check');
        }
        Schema::table('try_out_questions', function (Blueprint $table) {
            $table->integer('point_value')->change();
        });
    }
};
