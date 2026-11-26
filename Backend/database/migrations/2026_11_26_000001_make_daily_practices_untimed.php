<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('daily_practices', function (Blueprint $table) {
            $table->timestampTz('starts_at', 6)->nullable()->change();
            $table->timestampTz('ends_at', 6)->nullable()->change();
        });
        Schema::table('daily_practice_attempts', function (Blueprint $table) {
            $table->timestampTz('expires_at', 6)->nullable()->change();
        });

        // One-time data migration bypasses model expiry immutability, not frozen snapshots.
        // Completed attempts retain every stored value and are never reopened.
        DB::table('daily_practice_attempts')->where('status', 'in_progress')->update(['expires_at' => null]);
    }

    public function down(): void
    {
        throw new \RuntimeException('Daily practice deadlines cannot be restored without inventing schedules. Restore an approved backup instead.');
    }
};
