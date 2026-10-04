<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('class_schedules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('program_id')->constrained()->restrictOnDelete();
            $table->string('title');
            $table->text('description')->nullable();
            $table->timestampTz('scheduled_at');
            $table->integer('duration_minutes')->nullable();
            $table->text('meeting_url')->nullable();
            $table->string('chapter')->nullable();
            $table->string('session')->nullable();
            $table->string('sensei_name')->nullable();
            $table->string('status')->default('draft');
            $table->integer('sort_order')->default(0);
            $table->timestamps();
            $table->index(['program_id', 'status', 'scheduled_at', 'id']);
        });

        Schema::create('replay_playlists', function (Blueprint $table) {
            $table->id();
            $table->foreignId('program_id')->constrained()->restrictOnDelete();
            $table->string('title');
            $table->text('description')->nullable();
            $table->integer('sort_order')->default(0);
            $table->string('status')->default('draft');
            $table->timestamps();
            $table->index(['program_id', 'status', 'sort_order', 'id']);
        });

        Schema::create('replay_videos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('replay_playlist_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->text('video_url');
            $table->text('description')->nullable();
            $table->date('recorded_at')->nullable();
            $table->string('chapter')->nullable();
            $table->string('session')->nullable();
            $table->string('sensei_name')->nullable();
            $table->integer('sort_order')->default(0);
            $table->string('status')->default('draft');
            $table->timestamps();
            $table->index(['replay_playlist_id', 'status', 'sort_order', 'id']);
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE class_schedules ADD CHECK (status IN ('draft', 'published', 'cancelled')), ADD CHECK (duration_minutes IS NULL OR duration_minutes > 0)");
            DB::unprepared(<<<'SQL'
                CREATE FUNCTION validate_schedule_replay_program() RETURNS trigger AS $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM programs p
                        WHERE p.id = NEW.program_id AND p.family = 'jlpt'
                            AND p.code IN ('n5', 'n4', 'n3', 'n2', 'n1')
                            AND EXISTS (SELECT 1 FROM program_offers o WHERE o.program_id = p.id AND o.plan_code = 'sensei')
                    ) THEN
                        RAISE EXCEPTION 'Requires a JLPT program with a Sensei offer identity.' USING ERRCODE = '23514';
                    END IF;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;
                SQL);
            foreach (['class_schedules', 'replay_playlists'] as $table) {
                DB::statement("CREATE TRIGGER {$table}_validate_program BEFORE INSERT OR UPDATE ON {$table} FOR EACH ROW EXECUTE FUNCTION validate_schedule_replay_program()");
            }
            foreach (['replay_playlists', 'replay_videos'] as $table) {
                DB::statement("ALTER TABLE {$table} ADD CHECK (status IN ('draft', 'published'))");
            }
            foreach (['class_schedules', 'replay_playlists', 'replay_videos'] as $table) {
                DB::statement("ALTER TABLE {$table} ADD CHECK (sort_order >= 0), ADD CHECK (length(btrim(title)) > 0)");
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('replay_videos');
        Schema::dropIfExists('replay_playlists');
        Schema::dropIfExists('class_schedules');
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('DROP FUNCTION IF EXISTS validate_schedule_replay_program()');
        }
    }
};
