<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mini_checkpoint_questions', function (Blueprint $table) {
            $table->integer('passing_score')->nullable();
        });
        DB::statement('ALTER TABLE mini_checkpoint_questions ADD CONSTRAINT mini_checkpoint_passing_score_range CHECK (passing_score BETWEEN 0 AND 100)');
    }

    public function down(): void
    {
        Schema::table('mini_checkpoint_questions', function (Blueprint $table) {
            $table->dropColumn('passing_score');
        });
    }
};
