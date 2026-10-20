<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('try_outs', function (Blueprint $table) {
            $table->integer('max_score')->default(180);
            $table->integer('sort_order')->default(0);
            $table->jsonb('session_passing_scores')->nullable();
        });
        Schema::table('try_out_questions', function (Blueprint $table) {
            $table->text('instruction')->nullable();
            $table->jsonb('japanese')->nullable();
        });
        if (DB::getDriverName() === 'pgsql') {
            // Original migration used unnamed constraints; resolve only its total-score check.
            foreach (DB::select("SELECT conname FROM pg_constraint WHERE conrelid = 'try_outs'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%total_passing_score%'") as $constraint) {
                DB::statement('ALTER TABLE try_outs DROP CONSTRAINT "'.str_replace('"', '""', $constraint->conname).'"');
            }
            DB::statement('ALTER TABLE try_outs ADD CONSTRAINT try_out_builder_scores_check CHECK (max_score > 0 AND sort_order >= 0 AND (total_passing_score IS NULL OR total_passing_score BETWEEN 0 AND max_score))');
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE try_outs DROP CONSTRAINT try_out_builder_scores_check');
        }
        Schema::table('try_out_questions', fn (Blueprint $table) => $table->dropColumn(['instruction', 'japanese']));
        Schema::table('try_outs', fn (Blueprint $table) => $table->dropColumn(['max_score', 'sort_order', 'session_passing_scores']));
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE try_outs ADD CHECK (total_passing_score BETWEEN 0 AND 180)');
        }
    }
};
