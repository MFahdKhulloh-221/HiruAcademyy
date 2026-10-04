<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notification_contents', function (Blueprint $table) {
            $table->id();
            $table->string('type');
            $table->string('title');
            $table->text('body');
            $table->string('cta_label')->nullable();
            $table->string('preset')->default('None');
            $table->string('path', 2048)->nullable();
            $table->string('audience')->default('All');
            $table->string('level')->nullable();
            $table->string('status')->default('draft');
            $table->timestampTz('time')->nullable();
            $table->timestampsTz();
            $table->index(['status', 'audience', 'level']);
        });
        Schema::create('notification_reads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('notification_content_id')->constrained()->cascadeOnDelete();
            $table->timestampTz('read_at');
            $table->timestampsTz();
            $table->unique(['user_id', 'notification_content_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_reads');
        Schema::dropIfExists('notification_contents');
    }
};
