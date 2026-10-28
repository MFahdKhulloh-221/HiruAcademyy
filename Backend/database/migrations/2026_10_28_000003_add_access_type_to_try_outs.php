<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('try_outs', function (Blueprint $table) {
            $table->enum('access_type', ['free', 'membership'])->default('membership');
        });
    }

    public function down(): void
    {
        Schema::table('try_outs', function (Blueprint $table) {
            $table->dropColumn('access_type');
        });
    }
};
