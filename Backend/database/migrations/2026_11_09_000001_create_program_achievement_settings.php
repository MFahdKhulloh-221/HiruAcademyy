<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('program_achievement_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('program_id')->unique()->constrained()->restrictOnDelete();
            $table->boolean('automatic_enabled')->default(true);
            $table->text('title')->nullable();
            $table->text('description')->nullable();
            $table->text('background_image')->nullable();
            $table->integer('presentation_version')->default(1);
            $table->timestampsTz();
        });
        DB::statement('ALTER TABLE program_achievement_settings ADD CONSTRAINT program_achievement_settings_version_check CHECK (presentation_version >= 1)');
    }

    public function down(): void
    {
        Schema::dropIfExists('program_achievement_settings');
    }
};
