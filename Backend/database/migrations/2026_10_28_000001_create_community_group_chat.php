<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('community_rooms', function (Blueprint $table) {
            $table->id();
            $table->foreignId('topic_id')->unique()->constrained('community_topics')->restrictOnDelete();
            $table->timestamps();
        });

        Schema::create('community_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('room_id')->constrained('community_rooms')->restrictOnDelete();
            $table->foreignId('user_id')->constrained('users')->restrictOnDelete();
            $table->uuid('client_message_id');
            $table->text('content');
            $table->string('status')->default('published');
            $table->timestamps();
            $table->unique(['room_id', 'user_id', 'client_message_id'], 'community_messages_idempotency_unique');
            $table->index(['room_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('community_messages');
        Schema::dropIfExists('community_rooms');
    }
};
