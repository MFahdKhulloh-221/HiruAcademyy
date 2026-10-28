<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('checkpoint_packages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('program_id')->constrained()->restrictOnDelete();
            $table->string('title');
            $table->string('access_type');
            $table->string('status')->default('draft');
            $table->unsignedInteger('duration_minutes');
            $table->unsignedInteger('passing_score');
            $table->timestampsTz();
        });
        Schema::create('checkpoint_package_questions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('checkpoint_package_id')->constrained()->cascadeOnDelete();
            $table->foreignId('checkpoint_question_id')->constrained()->restrictOnDelete();
            $table->string('session');
            $table->text('audio_url')->nullable();
            $table->text('reading_passage')->nullable();
            $table->unsignedInteger('sort_order');
            $table->unique(['checkpoint_package_id', 'checkpoint_question_id'], 'checkpoint_package_question_unique');
        });
        Schema::create('checkpoint_attempts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('checkpoint_package_id')->constrained()->restrictOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->string('status')->default('in_progress');
            $table->jsonb('content_snapshot');
            $table->jsonb('grading_snapshot');
            $table->jsonb('answers');
            $table->jsonb('result_snapshot')->nullable();
            $table->unsignedInteger('revision')->default(0);
            $table->timestampTz('started_at');
            $table->timestampTz('expires_at');
            $table->timestampTz('submitted_at')->nullable();
            $table->timestampsTz();
            $table->index(['user_id', 'checkpoint_package_id']);
        });
        DB::statement("CREATE UNIQUE INDEX checkpoint_one_active_attempt ON checkpoint_attempts (user_id, checkpoint_package_id) WHERE status = 'in_progress'");
        DB::statement("ALTER TABLE checkpoint_packages ADD CONSTRAINT checkpoint_package_settings_check CHECK (duration_minutes > 0 AND passing_score BETWEEN 0 AND 100 AND access_type IN ('free', 'membership') AND status IN ('draft', 'published'))");
        DB::statement("ALTER TABLE checkpoint_package_questions ADD CONSTRAINT checkpoint_question_session_check CHECK (session IN ('vocabulary_kanji', 'audio', 'reading', 'grammar') AND sort_order >= 0)");
        DB::statement("ALTER TABLE checkpoint_attempts ADD CONSTRAINT checkpoint_attempt_status_check CHECK (status IN ('in_progress', 'completed') AND expires_at > started_at AND revision >= 0)");
    }

    public function down(): void
    {
        Schema::dropIfExists('checkpoint_attempts');
        Schema::dropIfExists('checkpoint_package_questions');
        Schema::dropIfExists('checkpoint_packages');
    }
};
