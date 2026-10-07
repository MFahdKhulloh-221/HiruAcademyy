<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('LOCK TABLE video_lessons IN ACCESS EXCLUSIVE MODE');
        if (DB::table('video_lessons')->select('chapter_id')->groupBy('chapter_id')->havingRaw('COUNT(*) > 1')->exists()) {
            throw new RuntimeException('Multiple videos exist in a chapter. No rows were deleted. Explicit canonical reconciliation approval is required before migration.');
        }
        Schema::table('video_lessons', fn (Blueprint $table) => $table->unique('chapter_id'));
        foreach ($this->fields() as $name => $field) {
            Schema::table($name, fn (Blueprint $table) => $table->text($field)->nullable()->change());
        }
    }

    public function down(): void
    {
        foreach ($this->fields() as $name => $field) {
            if (DB::table($name)->whereNull($field)->exists()) {
                throw new RuntimeException('Optional media exists. Rollback requires explicit content reconciliation; no rows were changed.');
            }
        }
        foreach ($this->fields() as $name => $field) {
            Schema::table($name, fn (Blueprint $table) => $table->text($field)->nullable(false)->change());
        }
        Schema::table('video_lessons', fn (Blueprint $table) => $table->dropUnique(['chapter_id']));
    }

    private function fields(): array
    {
        return [
            'showcase_items' => 'image_src', 'sensei_profiles' => 'photo',
            'video_lessons' => 'video_url', 'audio_questions' => 'audio_url',
            'learning_modules' => 'file_url', 'replay_videos' => 'video_url',
        ];
    }
};
