<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mini_checkpoint_questions', function (Blueprint $table) {
            $table->string('category')->nullable();
            $table->text('instruction')->nullable();
            $table->text('image_url')->nullable();
            $table->string('image_alt', 1000)->nullable();
            $table->string('image_position')->nullable();
            $table->text('audio_url')->nullable();
            $table->json('passage')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('mini_checkpoint_questions', function (Blueprint $table) {
            $table->dropColumn(['category', 'instruction', 'image_url', 'image_alt', 'image_position', 'audio_url', 'passage']);
        });
    }
};
