<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chapters', function (Blueprint $table) {
            $table->integer('mini_checkpoint_duration_minutes')->nullable();
            $table->integer('mini_checkpoint_passing_score')->nullable();
        });
        DB::statement('ALTER TABLE chapters ADD CONSTRAINT chapters_mini_checkpoint_settings_check CHECK ((mini_checkpoint_duration_minutes IS NULL AND mini_checkpoint_passing_score IS NULL) OR (mini_checkpoint_duration_minutes IS NOT NULL AND mini_checkpoint_passing_score IS NOT NULL AND mini_checkpoint_duration_minutes > 0 AND mini_checkpoint_passing_score BETWEEN 0 AND 100))');
        // Never choose a group or infer defaults from ambiguous legacy content.
        DB::statement('UPDATE chapters c SET mini_checkpoint_duration_minutes = q.duration_minutes, mini_checkpoint_passing_score = q.passing_score FROM (SELECT chapter_id, MIN(duration_minutes) AS duration_minutes, MIN(passing_score) AS passing_score FROM mini_checkpoint_questions GROUP BY chapter_id HAVING COUNT(DISTINCT (session, part)) = 1 AND MIN(session) > 0 AND MIN(part) > 0 AND COUNT(duration_minutes) = COUNT(*) AND COUNT(passing_score) = COUNT(*) AND MIN(duration_minutes) > 0 AND MIN(duration_minutes) = MAX(duration_minutes) AND MIN(passing_score) >= 0 AND MAX(passing_score) <= 100 AND MIN(passing_score) = MAX(passing_score)) q WHERE c.id = q.chapter_id');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE chapters DROP CONSTRAINT chapters_mini_checkpoint_settings_check');
        Schema::table('chapters', fn (Blueprint $table) => $table->dropColumn(['mini_checkpoint_duration_minutes', 'mini_checkpoint_passing_score']));
    }
};
