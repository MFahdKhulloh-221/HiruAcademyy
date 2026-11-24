<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('try_outs', function (Blueprint $table) {
            $table->json('session_duration_minutes')->nullable();
            $table->unsignedInteger('break_duration_minutes')->nullable();
        });
        Schema::table('try_out_attempts', function (Blueprint $table) {
            $table->timestampTz('expires_at', 6)->nullable()->change();
            $table->string('phase')->nullable();
            $table->timestampTz('session_started_at', 6)->nullable();
            $table->timestampTz('break_ends_at', 6)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('try_out_attempts', fn (Blueprint $table) => $table->dropColumn(['phase', 'session_started_at', 'break_ends_at']));
        Schema::table('try_outs', fn (Blueprint $table) => $table->dropColumn(['session_duration_minutes', 'break_duration_minutes']));
    }
};
