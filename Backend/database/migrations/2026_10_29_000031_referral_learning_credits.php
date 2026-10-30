<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('referral_credit_settings', function (Blueprint $table) {
            $table->unsignedSmallInteger('id')->primary();
            $table->boolean('enabled')->default(true);
            $table->bigInteger('inviter_reward')->default(25000);
            $table->bigInteger('friend_discount')->default(10000);
            $table->bigInteger('minimum_purchase')->default(0);
            $table->bigInteger('credit_limit')->nullable();
            $table->unsignedInteger('expiry_days')->nullable();
            $table->boolean('combine_promo')->default(false);
            $table->jsonb('program_ids');
            $table->timestampsTz();
        });
        DB::table('referral_credit_settings')->insert(['id' => 1, 'program_ids' => '[]', 'created_at' => now(), 'updated_at' => now()]);
        DB::statement('ALTER TABLE referral_credit_settings ADD CONSTRAINT referral_credit_settings_values CHECK (inviter_reward >= 0 AND friend_discount >= 0 AND minimum_purchase >= 0 AND (credit_limit IS NULL OR credit_limit > 0) AND (expiry_days IS NULL OR expiry_days > 0))');
        Schema::table('invoices', function (Blueprint $table) {
            $table->uuid('credit_request_key')->nullable();
            $table->bigInteger('referral_discount')->default(0);
            $table->bigInteger('credit_discount')->default(0);
            $table->bigInteger('promo_discount')->default(0);
            $table->jsonb('credit_policy')->nullable();
            $table->unique(['user_id', 'credit_request_key']);
        });
        Schema::create('referral_credit_purchases', function (Blueprint $table) {
            $table->id();
            $table->foreignId('invoice_id')->unique()->constrained()->restrictOnDelete();
            $table->foreignId('buyer_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('affiliate_id')->constrained()->restrictOnDelete();
            $table->foreignId('owner_id')->constrained('users')->restrictOnDelete();
            $table->bigInteger('reward');
            $table->bigInteger('friend_discount');
            $table->string('status')->default('pending');
            $table->timestampsTz();
        });
        DB::statement("CREATE UNIQUE INDEX referral_first_purchase ON referral_credit_purchases (buyer_id) WHERE status <> 'cancelled'");
        DB::statement("ALTER TABLE referral_credit_purchases ADD CONSTRAINT referral_purchase_values CHECK (reward >= 0 AND friend_discount >= 0 AND buyer_id <> owner_id AND status IN ('pending','verified','held','cancelled'))");
        Schema::create('referral_learning_credits', function (Blueprint $table) {
            $table->id();
            $table->uuid('reference')->unique();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->foreignId('source_invoice_id')->unique()->constrained('invoices')->restrictOnDelete();
            $table->bigInteger('amount');
            $table->string('status')->default('available');
            $table->timestampTz('expires_at')->nullable();
            $table->timestampsTz();
        });
        DB::statement("ALTER TABLE referral_learning_credits ADD CONSTRAINT referral_credit_values CHECK (amount >= 0 AND status IN ('available','held','reversed'))");
        Schema::create('referral_credit_uses', function (Blueprint $table) {
            $table->foreignId('invoice_id')->constrained()->restrictOnDelete();
            $table->foreignId('credit_id')->constrained('referral_learning_credits')->restrictOnDelete();
            $table->bigInteger('amount');
            $table->string('status')->default('reserved');
            $table->timestampsTz();
            $table->primary(['invoice_id', 'credit_id']);
        });
        DB::statement("ALTER TABLE referral_credit_uses ADD CONSTRAINT referral_use_values CHECK (amount > 0 AND status IN ('reserved','used','released'))");
        Schema::create('referral_invoice_controls', function (Blueprint $table) {
            $table->foreignId('invoice_id')->primary()->constrained()->restrictOnDelete();
            $table->string('status');
            $table->text('reason');
            $table->timestampsTz();
        });
        DB::statement("ALTER TABLE referral_invoice_controls ADD CONSTRAINT referral_control_values CHECK (status IN ('held','cancelled'))");
        DB::unprepared("CREATE FUNCTION protect_credit_invoice_snapshot() RETURNS trigger AS $$ BEGIN
            IF ROW(NEW.credit_request_key, NEW.referral_discount, NEW.credit_discount, NEW.promo_discount, NEW.credit_policy)
                IS DISTINCT FROM ROW(OLD.credit_request_key, OLD.referral_discount, OLD.credit_discount, OLD.promo_discount, OLD.credit_policy) THEN
                RAISE EXCEPTION 'Referral snapshot is immutable';
            END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
            CREATE TRIGGER credit_invoice_snapshot BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION protect_credit_invoice_snapshot();
            CREATE FUNCTION protect_learning_credit_snapshot() RETURNS trigger AS $$ BEGIN
                IF ROW(NEW.reference, NEW.user_id, NEW.source_invoice_id, NEW.amount, NEW.expires_at)
                    IS DISTINCT FROM ROW(OLD.reference, OLD.user_id, OLD.source_invoice_id, OLD.amount, OLD.expires_at) THEN
                    RAISE EXCEPTION 'Credit snapshot is immutable';
                END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
            CREATE TRIGGER learning_credit_snapshot BEFORE UPDATE ON referral_learning_credits FOR EACH ROW EXECUTE FUNCTION protect_learning_credit_snapshot()");
        DB::table('affiliate_settings')->where('id', 1)->update(['withdrawals_enabled' => false]);
    }

    public function down(): void
    {
        DB::statement('DROP TRIGGER IF EXISTS credit_invoice_snapshot ON invoices');
        DB::statement('DROP FUNCTION IF EXISTS protect_credit_invoice_snapshot()');
        DB::statement('DROP TRIGGER IF EXISTS learning_credit_snapshot ON referral_learning_credits');
        DB::statement('DROP FUNCTION IF EXISTS protect_learning_credit_snapshot()');
        Schema::dropIfExists('referral_invoice_controls');
        Schema::dropIfExists('referral_credit_uses');
        Schema::dropIfExists('referral_learning_credits');
        Schema::dropIfExists('referral_credit_purchases');
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropUnique(['user_id', 'credit_request_key']);
            $table->dropColumn(['credit_request_key', 'referral_discount', 'credit_discount', 'promo_discount', 'credit_policy']);
        });
        Schema::dropIfExists('referral_credit_settings');
    }
};
