<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('try_outs', function (Blueprint $table) {
            $table->integer('duration_minutes')->nullable();
        });
        Schema::table('try_out_attempts', function (Blueprint $table) {
            $table->timestampTz('expires_at')->nullable();
        });
        DB::statement('ALTER TABLE try_outs ADD CONSTRAINT try_out_duration_positive CHECK (duration_minutes > 0)');
        DB::statement('ALTER TABLE try_out_attempts ADD CONSTRAINT try_out_deadline_after_start CHECK (expires_at > started_at)');
    }

    public function down(): void
    {
        Schema::table('try_out_attempts', function (Blueprint $table) {
            $table->dropColumn('expires_at');
        });
        Schema::table('try_outs', function (Blueprint $table) {
            $table->dropColumn('duration_minutes');
        });
    }
};
