<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('assessment_audio_plays', function (Blueprint $table) {
            $table->id();
            $table->string('attempt_type', 24);
            $table->unsignedBigInteger('attempt_id');
            $table->char('audio_key', 64);
            $table->uuid('token');
            $table->timestampTz('reserved_until', 6);
            $table->timestampTz('used_at', 6)->nullable();
            $table->unique(['attempt_type', 'attempt_id', 'audio_key'], 'assessment_audio_once');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('assessment_audio_plays');
    }
};
