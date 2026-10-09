<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('gamification_days', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->date('activity_on');
            $table->unsignedSmallInteger('xp')->default(0);
            $table->unique(['user_id', 'activity_on']);
        });
        Schema::create('gamification_rewards', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('reward_key');
            $table->date('activity_on');
            $table->unsignedSmallInteger('xp');
            $table->timestampTz('created_at');
            $table->unique(['user_id', 'reward_key']);
            $table->index(['activity_on', 'user_id']);
        });
        DB::statement('ALTER TABLE gamification_days ADD CHECK (xp BETWEEN 0 AND 50)');
        DB::statement('ALTER TABLE gamification_rewards ADD CHECK (xp BETWEEN 0 AND 30)');
    }

    public function down(): void
    {
        Schema::dropIfExists('gamification_rewards');
        Schema::dropIfExists('gamification_days');
    }
};
