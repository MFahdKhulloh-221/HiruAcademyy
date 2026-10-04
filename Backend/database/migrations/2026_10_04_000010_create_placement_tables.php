<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('placement_configs', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->string('intro_heading');
            $table->integer('duration_minutes');
            $table->text('description');
            $table->string('status')->default('draft');
            $table->timestampsTz();
        });
        Schema::create('placement_questions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('placement_config_id')->constrained()->cascadeOnDelete();
            $table->text('prompt');
            $table->jsonb('options');
            $table->string('correct_option', 1);
            $table->string('category');
            $table->integer('sort_order')->default(1);
            $table->string('status')->default('draft');
            $table->text('image_url')->nullable();
            $table->text('audio_url')->nullable();
            $table->text('explanation')->nullable();
            $table->timestampsTz();
            $table->index(['placement_config_id', 'status', 'sort_order']);
        });
        Schema::create('placement_attempts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('placement_config_id')->constrained()->restrictOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->restrictOnDelete();
            $table->string('owner_hash', 64)->nullable();
            $table->jsonb('applicant_snapshot');
            $table->jsonb('config_snapshot');
            $table->jsonb('content_snapshot');
            $table->jsonb('grading_snapshot');
            $table->jsonb('answers')->default('{}');
            $table->jsonb('result_snapshot')->nullable();
            $table->string('status')->default('in_progress');
            $table->timestampTz('started_at', 6);
            $table->timestampTz('expires_at', 6);
            $table->timestampTz('completed_at', 6)->nullable();
            $table->timestampsTz(6);
            $table->index(['user_id', 'placement_config_id']);
        });
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE placement_configs ADD CHECK (status IN ('draft', 'published')), ADD CHECK (duration_minutes > 0)");
            DB::statement("ALTER TABLE placement_questions ADD CHECK (status IN ('draft', 'published')), ADD CHECK (category IN ('Bunpou', 'Moji・Goi', 'Dokkai', 'Choukai')), ADD CHECK (sort_order > 0), ADD CHECK (correct_option IN ('A', 'B', 'C', 'D')), ADD CHECK (jsonb_typeof(options) = 'object' AND jsonb_exists_all(options, ARRAY['A','B','C','D']) AND options - ARRAY['A','B','C','D'] = '{}'::jsonb AND jsonb_typeof(options->'A') = 'string' AND jsonb_typeof(options->'B') = 'string' AND jsonb_typeof(options->'C') = 'string' AND jsonb_typeof(options->'D') = 'string')");
            DB::statement("ALTER TABLE placement_attempts ADD CHECK (status IN ('in_progress', 'completed')), ADD CHECK ((user_id IS NOT NULL AND owner_hash IS NULL) OR (user_id IS NULL AND owner_hash IS NOT NULL AND owner_hash ~ '^[0-9a-f]{64}$')), ADD CHECK (expires_at > started_at), ADD CHECK (jsonb_typeof(content_snapshot) = 'array' AND jsonb_array_length(content_snapshot) > 0), ADD CHECK ((status = 'completed' AND completed_at IS NOT NULL AND result_snapshot IS NOT NULL) OR (status = 'in_progress' AND completed_at IS NULL AND result_snapshot IS NULL)), ADD CHECK (completed_at IS NULL OR completed_at >= started_at)");
            DB::unprepared(<<<'SQL'
CREATE FUNCTION guard_placement_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Placement attempts are immutable';
    END IF;
    IF OLD.status = 'completed' OR
       ROW(NEW.placement_config_id, NEW.user_id, NEW.owner_hash, NEW.applicant_snapshot, NEW.config_snapshot, NEW.content_snapshot, NEW.grading_snapshot, NEW.started_at, NEW.expires_at)
       IS DISTINCT FROM
       ROW(OLD.placement_config_id, OLD.user_id, OLD.owner_hash, OLD.applicant_snapshot, OLD.config_snapshot, OLD.content_snapshot, OLD.grading_snapshot, OLD.started_at, OLD.expires_at) THEN
        RAISE EXCEPTION 'Attempt snapshots and completed attempts are immutable';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER placement_attempt_immutable BEFORE UPDATE OR DELETE ON placement_attempts FOR EACH ROW EXECUTE FUNCTION guard_placement_attempt();
SQL);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('placement_attempts');
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('DROP FUNCTION IF EXISTS guard_placement_attempt()');
        }
        Schema::dropIfExists('placement_questions');
        Schema::dropIfExists('placement_configs');
    }
};
