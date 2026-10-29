<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('community_message_reports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('message_id')->constrained('community_messages')->restrictOnDelete();
            $table->foreignId('reporter_id')->constrained('users')->restrictOnDelete();
            $table->text('reason');
            $table->string('status')->default('pending');
            $table->timestampTz('handled_at')->nullable();
            $table->foreignId('handled_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestampsTz();
            $table->unique(['message_id', 'reporter_id']);
            $table->index(['status', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('community_message_reports');
    }
};
