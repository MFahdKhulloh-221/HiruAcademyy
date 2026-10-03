<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('chapters', function (Blueprint $table) {
            $table->id();
            $table->foreignId('program_id')->constrained()->restrictOnDelete();
            $table->integer('chapter_number');
            $table->string('title');
            $table->text('description')->nullable();
            $table->integer('sort_order')->default(0);
            $table->string('status')->default('draft');
            $table->timestamps();
            $table->unique(['program_id', 'chapter_number']);
        });

        foreach (['video_lessons', 'learning_modules', 'flashcards', 'audio_questions', 'reading_passages', 'reading_questions', 'mini_checkpoint_questions'] as $name) {
            Schema::create($name, function (Blueprint $table) use ($name) {
                $table->id();
                if ($name === 'reading_questions') {
                    $table->foreignId('reading_passage_id')->constrained()->cascadeOnDelete();
                } else {
                    $table->foreignId('chapter_id')->constrained()->cascadeOnDelete();
                }
                if (in_array($name, ['video_lessons', 'learning_modules', 'reading_passages'])) {
                    $table->string('title');
                }
                if (in_array($name, ['video_lessons', 'learning_modules'])) {
                    $table->text('description')->nullable();
                }
                if ($name === 'video_lessons') {
                    $table->text('video_url');
                }
                if ($name === 'learning_modules') {
                    $table->text('file_url');
                    $table->string('module_type');
                }
                if ($name === 'flashcards') {
                    $table->text('japanese');
                    $table->text('reading');
                    $table->text('meaning');
                    $table->text('example')->nullable();
                }
                if ($name === 'reading_passages') {
                    $table->text('body');
                }
                if ($name === 'audio_questions') {
                    $table->string('title')->nullable();
                    $table->text('audio_url');
                }
                if (in_array($name, ['audio_questions', 'reading_questions', 'mini_checkpoint_questions'])) {
                    $table->text('question');
                    $table->jsonb('options');
                    $table->string('correct_option', 1);
                    $table->text('explanation')->nullable();
                }
                $table->integer('sort_order')->default(0);
                $table->string('status')->default('draft');
                $table->timestamps();
            });
        }

        if (DB::getDriverName() === 'pgsql') {
            foreach (['chapters', 'video_lessons', 'learning_modules', 'flashcards', 'audio_questions', 'reading_passages', 'reading_questions', 'mini_checkpoint_questions'] as $name) {
                DB::statement("ALTER TABLE {$name} ADD CHECK (sort_order >= 0), ADD CHECK (status IN ('draft', 'published'))");
            }
            DB::statement('ALTER TABLE chapters ADD CHECK (chapter_number >= 1)');
            DB::statement("ALTER TABLE learning_modules ADD CHECK (module_type IN ('grammar', 'kanji', 'general'))");
            foreach (['audio_questions', 'reading_questions', 'mini_checkpoint_questions'] as $name) {
                DB::statement("ALTER TABLE {$name} ADD CHECK (correct_option IN ('A', 'B', 'C', 'D')), ADD CHECK (
                    jsonb_typeof(options) = 'object'
                    AND jsonb_exists_all(options, ARRAY['A', 'B', 'C', 'D'])
                    AND options - ARRAY['A', 'B', 'C', 'D'] = '{}'::jsonb
                    AND jsonb_typeof(options->'A') = 'string' AND length(btrim(options->>'A')) > 0
                    AND jsonb_typeof(options->'B') = 'string' AND length(btrim(options->>'B')) > 0
                    AND jsonb_typeof(options->'C') = 'string' AND length(btrim(options->>'C')) > 0
                    AND jsonb_typeof(options->'D') = 'string' AND length(btrim(options->>'D')) > 0
                )");
            }
        }
    }

    public function down(): void
    {
        foreach (['reading_questions', 'mini_checkpoint_questions', 'reading_passages', 'audio_questions', 'flashcards', 'learning_modules', 'video_lessons', 'chapters'] as $name) {
            Schema::dropIfExists($name);
        }
    }
};
