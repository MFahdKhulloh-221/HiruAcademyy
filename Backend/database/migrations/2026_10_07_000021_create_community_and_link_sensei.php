<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('sensei_profiles', 'user_id')) {
            Schema::table('sensei_profiles', function (Blueprint $table) {
                $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            });
        }

        if (! Schema::hasTable('community_topics')) {
            Schema::create('community_topics', function (Blueprint $table) {
                $table->id();
                $table->string('slug')->unique();
                $table->string('title');
                $table->text('description')->nullable();
                $table->string('icon')->nullable();
                $table->integer('sort_order')->default(0);
                $table->string('status')->default('published');
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('community_threads')) {
            Schema::create('community_threads', function (Blueprint $table) {
                $table->id();
                $table->foreignId('topic_id')->constrained('community_topics')->cascadeOnDelete();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->string('title');
                $table->text('content');
                $table->boolean('is_ask_sensei')->default(false);
                $table->string('status')->default('published');
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('community_replies')) {
            Schema::create('community_replies', function (Blueprint $table) {
                $table->id();
                $table->foreignId('thread_id')->constrained('community_threads')->cascadeOnDelete();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->text('content');
                $table->string('status')->default('published');
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('community_replies');
        Schema::dropIfExists('community_threads');
        Schema::dropIfExists('community_topics');
        if (Schema::hasColumn('sensei_profiles', 'user_id')) {
            Schema::table('sensei_profiles', function (Blueprint $table) {
                $table->dropConstrainedForeignId('user_id');
            });
        }
    }
};
