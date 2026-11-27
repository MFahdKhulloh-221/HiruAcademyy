<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notification_contents', function (Blueprint $table) {
            $table->timestampTz('popup_dismissed_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('notification_contents', function (Blueprint $table) {
            $table->dropColumn('popup_dismissed_at');
        });
    }
};
