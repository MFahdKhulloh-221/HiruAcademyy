<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('testimonials', function (Blueprint $table) {
            $table->string('type')->default('text');
            $table->string('title')->nullable();
            $table->text('video_thumbnail')->nullable();
            $table->boolean('show_on_testimonials')->default(false);
            $table->timestampTz('first_approved_at')->nullable();
            $table->dropUnique(['user_id']);
            $table->unique(['user_id', 'type']);
        });
        DB::statement("UPDATE testimonials SET type = CASE WHEN NULLIF(video_url, '') IS NOT NULL THEN 'video' ELSE 'text' END, title = video_title, show_on_testimonials = published, first_approved_at = CASE WHEN moderation_status = 'approved' THEN COALESCE(updated_at, CURRENT_TIMESTAMP) ELSE NULL END");
        DB::statement('ALTER TABLE testimonials DROP CONSTRAINT testimonials_quote_check');
        DB::statement("ALTER TABLE testimonials ADD CONSTRAINT testimonials_quote_check CHECK (type = 'video' OR length(btrim(quote)) > 0), ADD CONSTRAINT testimonials_type_check CHECK (type IN ('text', 'video'))");
    }

    public function down(): void
    {
        throw new RuntimeException('Forward-only migration: rolling back would lose independent testimonial records.');
    }
};
