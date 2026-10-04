<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payouts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('affiliate_id')->constrained();
            $table->string('request_key')->unique();
            $table->bigInteger('amount');
            $table->date('paid_at');
            $table->text('note')->nullable();
            $table->timestampsTz();
        });
        Schema::create('payout_commissions', function (Blueprint $table) {
            $table->foreignId('payout_id')->constrained();
            $table->foreignId('commission_id')->unique()->constrained();
            $table->primary(['payout_id', 'commission_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payout_commissions');
        Schema::dropIfExists('payouts');
    }
};
