<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('try_out_attempts', function (Blueprint $table) {
            $table->timestampTz('abandoned_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('try_out_attempts', function (Blueprint $table) {
            $table->dropColumn('abandoned_at');
        });
    }
};
