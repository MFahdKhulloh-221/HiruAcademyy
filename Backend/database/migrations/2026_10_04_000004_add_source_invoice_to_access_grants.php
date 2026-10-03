<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('access_grants', function (Blueprint $table) {
            $table->foreignId('source_invoice_id')->nullable()->unique()->constrained('invoices')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('access_grants', function (Blueprint $table) {
            $table->dropConstrainedForeignId('source_invoice_id');
        });
    }
};
