<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mini_checkpoint_questions', function (Blueprint $table) {
            $table->integer('session')->default(1);
            $table->integer('part')->default(1);
            $table->integer('duration_minutes')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('mini_checkpoint_questions', function (Blueprint $table) {
            $table->dropColumn(['session', 'part', 'duration_minutes']);
        });
    }
};
