<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('try_out_passages', function (Blueprint $table) {
            $table->json('blocks')->nullable();
        });
    }

    public function down(): void
    {
        if (DB::table('try_out_passages')->whereNotNull('blocks')->exists()) {
            throw new RuntimeException('Ordered Try Out passages exist; convert them explicitly before rollback.');
        }
        Schema::table('try_out_passages', function (Blueprint $table) {
            $table->dropColumn('blocks');
        });
    }
};
