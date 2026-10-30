<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('affiliate_settings', function (Blueprint $table) {
            $table->unsignedSmallInteger('id')->primary();
            $table->boolean('enabled')->default(true);
            $table->boolean('withdrawals_enabled')->default(false);
            $table->decimal('rate', 5, 2)->nullable();
            $table->unsignedInteger('waiting_days')->nullable();
            $table->bigInteger('minimum')->nullable();
            $table->bigInteger('fee')->nullable();
            $table->timestampsTz();
        });
        DB::table('affiliate_settings')->insert(['id' => 1, 'created_at' => now(), 'updated_at' => now()]);
        DB::statement('ALTER TABLE affiliate_settings ADD CONSTRAINT affiliate_settings_values CHECK ((rate IS NULL OR rate BETWEEN 0 AND 100) AND (minimum IS NULL OR minimum > 0) AND (fee IS NULL OR fee >= 0))');
        Schema::table('users', fn (Blueprint $table) => $table->foreignId('referrer_affiliate_id')->nullable()->constrained('affiliates')->restrictOnDelete());
        Schema::create('affiliate_audits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('actor_id')->nullable()->constrained('users');
            $table->string('event');
            $table->string('subject');
            $table->jsonb('detail');
            $table->timestampTz('created_at');
        });
        Schema::create('commission_holds', function (Blueprint $table) {
            $table->foreignId('commission_id')->primary()->constrained()->restrictOnDelete();
            $table->foreignId('actor_id')->constrained('users');
            $table->text('reason');
            $table->timestampTz('created_at');
        });
        Schema::create('affiliate_withdrawals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('affiliate_id')->constrained()->restrictOnDelete();
            $table->uuid('request_key')->unique();
            $table->bigInteger('amount');
            $table->bigInteger('fee');
            $table->string('status')->default('pending');
            $table->text('destination');
            $table->string('destination_masked');
            $table->string('fingerprint', 64);
            $table->text('reason')->nullable();
            $table->string('transfer_reference')->nullable()->unique();
            $table->foreignId('payout_id')->nullable()->unique()->constrained('payouts');
            $table->timestampsTz();
        });
        DB::statement("ALTER TABLE affiliate_withdrawals ADD CONSTRAINT affiliate_withdrawals_values CHECK (amount > 0 AND fee >= 0 AND amount > fee AND status IN ('pending','approved','processing','paid','rejected','reconciliation'))");
        Schema::create('affiliate_withdrawal_allocations', function (Blueprint $table) {
            $table->foreignId('withdrawal_id')->constrained('affiliate_withdrawals')->restrictOnDelete();
            $table->foreignId('commission_id')->constrained()->restrictOnDelete();
            $table->bigInteger('amount');
            $table->primary(['withdrawal_id', 'commission_id']);
            $table->index('commission_id');
        });
        DB::statement('ALTER TABLE affiliate_withdrawal_allocations ADD CONSTRAINT affiliate_allocation_positive CHECK (amount > 0)');
    }

    public function down(): void
    {
        Schema::dropIfExists('affiliate_withdrawal_allocations');
        Schema::dropIfExists('affiliate_withdrawals');
        Schema::dropIfExists('commission_holds');
        Schema::dropIfExists('affiliate_audits');
        Schema::table('users', fn (Blueprint $table) => $table->dropConstrainedForeignId('referrer_affiliate_id'));
        Schema::dropIfExists('affiliate_settings');
    }
};
