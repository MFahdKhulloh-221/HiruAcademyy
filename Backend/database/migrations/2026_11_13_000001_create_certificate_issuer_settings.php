<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('certificate_issuer_settings', function (Blueprint $table): void {
            $table->unsignedTinyInteger('id')->primary();
            $table->text('signature_data_url')->nullable();
            $table->enum('signature_position', ['bottom-left', 'bottom-right'])->default('bottom-right');
        });
        DB::table('certificate_issuer_settings')->insert(['id' => 1, 'signature_data_url' => null, 'signature_position' => 'bottom-right']);
    }

    public function down(): void
    {
        Schema::dropIfExists('certificate_issuer_settings');
    }
};
