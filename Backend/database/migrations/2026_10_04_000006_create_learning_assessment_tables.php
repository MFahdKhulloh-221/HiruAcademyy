<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('activity_completions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('chapter_id')->constrained()->cascadeOnDelete();
            $table->string('type');
            $table->unsignedBigInteger('resource_id');
            $table->timestampTz('completed_at');
            $table->unique(['user_id', 'type', 'resource_id']);
            $table->index(['user_id', 'chapter_id']);
        });
        Schema::create('learning_attempts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('chapter_id')->constrained()->restrictOnDelete();
            $table->string('kind');
            $table->string('status')->default('in_progress');
            $table->jsonb('content_snapshot');
            $table->jsonb('grading_snapshot');
            $table->jsonb('answers')->default('{}');
            $table->jsonb('result_snapshot')->nullable();
            $table->unsignedInteger('revision')->default(0);
            $table->timestampTz('submitted_at')->nullable();
            $table->timestampsTz();
            $table->index(['user_id', 'chapter_id', 'kind']);
        });
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE activity_completions ADD CHECK (type IN ('video', 'module', 'flashcard', 'audio', 'reading')), ADD CHECK (resource_id > 0)");
            DB::statement("ALTER TABLE learning_attempts ADD CHECK (kind IN ('audio', 'reading', 'mini')), ADD CHECK (status IN ('in_progress', 'completed')), ADD CHECK (revision >= 0), ADD CHECK ((status = 'completed') = (submitted_at IS NOT NULL AND result_snapshot IS NOT NULL))");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('learning_attempts');
        Schema::dropIfExists('activity_completions');
    }
};
