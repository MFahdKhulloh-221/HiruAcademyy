<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('placement_configs', fn (Blueprint $table) => $table->integer('question_count')->default(12));
        Schema::table('placement_questions', function (Blueprint $table) {
            $table->string('level', 2)->nullable();
            $table->text('passage')->nullable();
        });
        // Bank/config/grading snapshots remain protected by guard_placement_attempt.
        Schema::table('placement_attempts', fn (Blueprint $table) => $table->jsonb('adaptive_state')->nullable());
        DB::statement('ALTER TABLE placement_configs ADD CONSTRAINT placement_question_count CHECK (question_count IN (12, 20, 25))');
        DB::statement("ALTER TABLE placement_questions ADD CONSTRAINT placement_question_level CHECK (level IS NULL OR level IN ('N5', 'N4', 'N3', 'N2', 'N1'))");
    }

    public function down(): void
    {
        Schema::table('placement_attempts', fn (Blueprint $table) => $table->dropColumn('adaptive_state'));
        Schema::table('placement_questions', fn (Blueprint $table) => $table->dropColumn(['level', 'passage']));
        Schema::table('placement_configs', fn (Blueprint $table) => $table->dropColumn('question_count'));
    }
};
