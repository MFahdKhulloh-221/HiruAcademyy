<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('placement_configs', function (Blueprint $table) {
            $table->jsonb('recommendation_rules')->default('[]');
        });
        Schema::create('placement_lead_contacts', function (Blueprint $table) {
            $table->foreignId('placement_attempt_id')->primary()->constrained();
            $table->string('status')->default('new');
            $table->timestampsTz();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('placement_lead_contacts');
        Schema::table('placement_configs', fn (Blueprint $table) => $table->dropColumn('recommendation_rules'));
    }
};
