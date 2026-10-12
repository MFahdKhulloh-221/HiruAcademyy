<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notification_contents', function (Blueprint $table) {
            $table->foreignId('user_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('event_key')->nullable();
            $table->unique(['user_id', 'event_key']);
        });
    }

    public function down(): void
    {
        Schema::table('notification_contents', function (Blueprint $table) {
            $table->dropUnique(['user_id', 'event_key']);
            $table->dropConstrainedForeignId('user_id');
            $table->dropColumn('event_key');
        });
    }
};
