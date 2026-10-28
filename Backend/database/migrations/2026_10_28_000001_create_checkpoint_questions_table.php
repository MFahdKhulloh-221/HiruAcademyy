<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('checkpoint_questions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('chapter_id')->constrained()->restrictOnDelete();
            $table->text('question');
            $table->jsonb('options');
            $table->string('correct_option', 1);
            $table->text('explanation')->nullable();
            $table->integer('sort_order')->default(0);
            $table->string('status')->default('draft');
            $table->timestamps();
            $table->index(['chapter_id', 'status', 'sort_order']);
        });
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE checkpoint_questions
                ADD CHECK (sort_order >= 0),
                ADD CHECK (status IN ('draft', 'published')),
                ADD CHECK (correct_option IN ('A', 'B', 'C', 'D')),
                ADD CHECK (length(btrim(question)) > 0),
                ADD CHECK (jsonb_typeof(options) = 'object'
                    AND jsonb_exists_all(options, ARRAY['A', 'B', 'C', 'D'])
                    AND options - ARRAY['A', 'B', 'C', 'D'] = '{}'::jsonb
                    AND jsonb_typeof(options->'A') = 'string' AND length(btrim(options->>'A')) > 0
                    AND jsonb_typeof(options->'B') = 'string' AND length(btrim(options->>'B')) > 0
                    AND jsonb_typeof(options->'C') = 'string' AND length(btrim(options->>'C')) > 0
                    AND jsonb_typeof(options->'D') = 'string' AND length(btrim(options->>'D')) > 0)");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('checkpoint_questions');
    }
};
