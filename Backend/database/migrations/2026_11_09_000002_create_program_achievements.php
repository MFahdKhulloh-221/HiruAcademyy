<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('program_achievements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->foreignId('program_id')->constrained()->restrictOnDelete();
            $table->string('student_name_snapshot');
            $table->string('program_name_snapshot');
            $table->string('program_code_snapshot');
            $table->string('learning_type_snapshot');
            $table->jsonb('presentation_snapshot');
            $table->jsonb('completion_evidence_snapshot');
            $table->timestampTz('issued_at');
            $table->timestampsTz();
            $table->unique(['user_id', 'program_id']);
        });
        DB::statement("ALTER TABLE program_achievements ADD CONSTRAINT program_achievements_learning_type_check CHECK (learning_type_snapshot IN ('free', 'lms', 'sensei'))");
        DB::statement("ALTER TABLE program_achievements ADD CONSTRAINT program_achievements_identity_check CHECK (student_name_snapshot ~ '[^[:space:]]' AND program_name_snapshot ~ '[^[:space:]]' AND program_code_snapshot ~ '[^[:space:]]')");
        DB::statement("ALTER TABLE program_achievements ADD CONSTRAINT program_achievements_snapshots_check CHECK (jsonb_typeof(presentation_snapshot) = 'object' AND presentation_snapshot <> '{}'::jsonb AND jsonb_typeof(completion_evidence_snapshot) = 'object' AND completion_evidence_snapshot <> '{}'::jsonb)");
    }

    public function down(): void
    {
        Schema::dropIfExists('program_achievements');
    }
};
