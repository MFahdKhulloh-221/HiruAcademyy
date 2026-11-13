<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('daily_practices', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->string('category');
            $table->string('target_level');
            $table->string('status')->default('draft');
            $table->timestampTz('starts_at', 6);
            $table->timestampTz('ends_at', 6);
            $table->timestampsTz(6);
            $table->index(['status', 'starts_at']);
        });
        Schema::create('daily_practice_passages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('daily_practice_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->text('body');
            $table->text('image')->nullable();
            $table->text('image_alt')->nullable();
            $table->string('image_position')->nullable();
            $table->json('blocks')->nullable();
            $table->timestampsTz(6);
        });
        Schema::create('daily_practice_questions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('daily_practice_id')->constrained()->cascadeOnDelete();
            $table->foreignId('passage_id')->nullable()->constrained('daily_practice_passages')->restrictOnDelete();
            $table->string('session');
            $table->text('question');
            $table->text('instruction')->nullable();
            $table->json('japanese')->nullable();
            $table->json('options');
            $table->string('correct_option', 1);
            $table->text('explanation')->nullable();
            $table->decimal('point_value', 8, 2);
            $table->text('reading_passage')->nullable();
            $table->text('audio_url')->nullable();
            $table->text('image')->nullable();
            $table->text('image_alt')->nullable();
            $table->string('image_position')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->string('status')->default('draft');
            $table->timestampsTz(6);
        });
        Schema::create('daily_practice_attempts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('daily_practice_id')->constrained()->restrictOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->string('status')->default('in_progress');
            foreach (['content_snapshot', 'grading_snapshot', 'answers', 'completed_sessions'] as $field) {
                $table->json($field);
            }
            $table->json('result_snapshot')->nullable();
            $table->unsignedInteger('current_session')->default(0);
            $table->unsignedInteger('revision')->default(0);
            $table->timestampTz('started_at', 6);
            $table->timestampTz('expires_at', 6);
            $table->timestampTz('completed_at', 6)->nullable();
            $table->timestampTz('abandoned_at', 6)->nullable();
            $table->timestampsTz(6);
            $table->unique(['daily_practice_id', 'user_id']);
            $table->index(['status', 'expires_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('daily_practice_attempts');
        Schema::dropIfExists('daily_practice_questions');
        Schema::dropIfExists('daily_practice_passages');
        Schema::dropIfExists('daily_practices');
    }
};
