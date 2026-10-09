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
            $table->foreignId('user_id')->nullable()->unique()->constrained()->nullOnDelete();
            $table->string('source')->default('admin');
            $table->string('moderation_status')->default('approved');
            $table->boolean('consent_public')->default(true);
            $table->text('moderation_note')->nullable();
        });
        DB::statement("ALTER TABLE testimonials ADD CONSTRAINT testimonials_source_check CHECK (source IN ('admin', 'student')), ADD CONSTRAINT testimonials_moderation_status_check CHECK (moderation_status IN ('pending', 'approved', 'rejected'))");
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE testimonials DROP CONSTRAINT testimonials_source_check, DROP CONSTRAINT testimonials_moderation_status_check');
        Schema::table('testimonials', function (Blueprint $table) {
            $table->dropConstrainedForeignId('user_id');
            $table->dropColumn(['source', 'moderation_status', 'consent_public', 'moderation_note']);
        });
    }
};
