<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('try_outs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('program_id')->constrained()->restrictOnDelete();
            $table->string('title');
            $table->string('status')->default('draft');
            $table->integer('total_passing_score')->nullable();
            $table->timestampsTz();
        });
        Schema::create('try_out_questions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('try_out_id')->constrained()->cascadeOnDelete();
            $table->string('session');
            $table->text('question');
            $table->jsonb('options');
            $table->string('correct_option', 1);
            $table->text('explanation')->nullable();
            $table->integer('point_value');
            $table->text('reading_passage')->nullable();
            $table->text('audio_url')->nullable();
            $table->integer('sort_order')->default(0);
            $table->string('status')->default('draft');
            $table->timestampsTz();
            $table->index(['try_out_id', 'session', 'status']);
        });
        Schema::create('try_out_attempts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('try_out_id')->constrained()->restrictOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->string('status')->default('in_progress');
            $table->jsonb('content_snapshot');
            $table->jsonb('grading_snapshot');
            $table->jsonb('result_snapshot')->nullable();
            $table->jsonb('answers')->default('{}');
            $table->jsonb('completed_sessions')->default('[]');
            $table->integer('current_session')->default(0);
            $table->integer('revision')->default(0);
            $table->timestampTz('started_at');
            $table->timestampTz('completed_at')->nullable();
            $table->timestampsTz();
            $table->index(['user_id', 'try_out_id', 'status']);
        });
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE try_outs ADD CHECK (status IN ('draft', 'published')), ADD CHECK (total_passing_score BETWEEN 0 AND 180)");
            DB::statement("ALTER TABLE try_out_questions ADD CHECK (session IN ('vocabulary_kanji', 'grammar', 'reading', 'audio')), ADD CHECK (status IN ('draft', 'published')), ADD CHECK (point_value > 0 AND point_value <= 180), ADD CHECK (sort_order >= 0), ADD CHECK (correct_option IN ('A', 'B', 'C', 'D')), ADD CHECK (jsonb_typeof(options) = 'object' AND jsonb_exists_all(options, ARRAY['A','B','C','D']) AND options - ARRAY['A','B','C','D'] = '{}'::jsonb AND jsonb_typeof(options->'A') = 'string' AND jsonb_typeof(options->'B') = 'string' AND jsonb_typeof(options->'C') = 'string' AND jsonb_typeof(options->'D') = 'string'), ADD CHECK (status <> 'published' OR session <> 'audio' OR (audio_url IS NOT NULL AND audio_url ~ '^https?://'))");
            DB::statement("ALTER TABLE try_out_attempts ADD CHECK (status IN ('in_progress', 'completed')), ADD CHECK (revision >= 0), ADD CHECK (current_session BETWEEN 0 AND 4), ADD CHECK (jsonb_typeof(completed_sessions) = 'array' AND jsonb_array_length(completed_sessions) = current_session), ADD CHECK ((status = 'completed') = (completed_at IS NOT NULL AND result_snapshot IS NOT NULL)), ADD CHECK (status <> 'completed' OR current_session = 4)");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('try_out_attempts');
        Schema::dropIfExists('try_out_questions');
        Schema::dropIfExists('try_outs');
    }
};
