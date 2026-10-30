<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('checkpoint_packages', function (Blueprint $table) {
            $table->unsignedInteger('duration_minutes')->nullable()->change();
            $table->unsignedInteger('passing_score')->nullable()->change();
            $table->unsignedInteger('max_score')->default(180);
            $table->unsignedInteger('sort_order')->default(0);
            $table->unsignedInteger('total_passing_score')->nullable();
            $table->jsonb('session_passing_scores')->nullable();
        });
        Schema::create('checkpoint_passages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('checkpoint_package_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->text('body');
            $table->timestamps();
        });
        Schema::create('checkpoint_studio_questions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('checkpoint_package_id')->constrained()->cascadeOnDelete();
            $table->foreignId('passage_id')->nullable()->constrained('checkpoint_passages')->restrictOnDelete();
            $table->string('session');
            $table->text('question');
            $table->jsonb('options');
            $table->string('correct_option', 1);
            $table->text('explanation')->nullable();
            $table->unsignedInteger('point_value');
            $table->text('reading_passage')->nullable();
            $table->text('audio_url')->nullable();
            $table->text('instruction')->nullable();
            $table->jsonb('japanese')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->string('status')->default('draft');
            $table->timestamps();
            $table->index(['checkpoint_package_id', 'session', 'sort_order']);
        });
        Schema::table('checkpoint_attempts', function (Blueprint $table) {
            $table->timestampTz('expires_at')->nullable()->change();
            $table->timestampTz('abandoned_at')->nullable();
            $table->timestampTz('completed_at')->nullable();
            $table->jsonb('completed_sessions')->default('[]');
            $table->unsignedInteger('current_session')->default(0);
        });
        DB::statement('DROP INDEX checkpoint_one_active_attempt');
        // Preserve package visibility and equivalent percentage pass rules; historical snapshots remain untouched.
        DB::table('checkpoint_packages')->orderBy('id')->each(function ($package) {
            $questions = DB::table('checkpoint_package_questions as link')
                ->join('checkpoint_questions as question', 'question.id', '=', 'link.checkpoint_question_id')
                ->where('link.checkpoint_package_id', $package->id)
                ->select('question.*', 'link.session', 'link.audio_url', 'link.reading_passage', 'link.sort_order as package_order')->get();
            foreach ($questions as $question) {
                DB::table('checkpoint_studio_questions')->insert([
                    'checkpoint_package_id' => $package->id, 'session' => $question->session,
                    'question' => $question->question, 'options' => $question->options,
                    'correct_option' => $question->correct_option, 'explanation' => $question->explanation,
                    'point_value' => 1, 'reading_passage' => $question->reading_passage,
                    'audio_url' => $question->audio_url, 'sort_order' => $question->package_order,
                    'status' => $question->status, 'created_at' => now(), 'updated_at' => now(),
                ]);
            }
            DB::table('checkpoint_packages')->where('id', $package->id)->update([
                'max_score' => max(1, $questions->count()),
                'total_passing_score' => (int) ceil($package->passing_score * $questions->count() / 100),
                'session_passing_scores' => json_encode(array_fill_keys(['vocabulary_kanji', 'grammar', 'reading', 'audio'], 0), JSON_THROW_ON_ERROR),
            ]);
        });
    }

    public function down(): void
    {
        throw new LogicException('Checkpoint Studio contains independent content. Restore verified backup instead of dropping assessment data.');
    }
};
