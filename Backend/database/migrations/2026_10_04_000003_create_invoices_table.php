<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('invoices', function (Blueprint $table) {
            $table->id();
            $table->uuid('reference')->unique();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->foreignId('program_offer_id')->constrained()->restrictOnDelete();
            $table->foreignId('program_id')->constrained()->restrictOnDelete();
            $table->enum('plan_code', ['lms', 'sensei']);
            $table->enum('status', ['draft', 'awaiting_payment', 'paid', 'verified', 'active'])->default('draft');
            $table->unsignedBigInteger('base_price');
            $table->decimal('discount_percent', 5, 2);
            $table->unsignedBigInteger('discount_amount');
            $table->unsignedBigInteger('total_price');
            $table->string('currency', 3);
            $table->unsignedSmallInteger('duration_months');
            $table->date('due_date')->nullable();
            $table->text('note')->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamp('verified_at')->nullable();
            $table->timestamp('activated_at')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'id']);
        });
        DB::statement('ALTER TABLE invoices ADD CONSTRAINT invoices_commercial_check CHECK (base_price >= 0 AND discount_percent BETWEEN 0 AND 100 AND discount_amount BETWEEN 0 AND base_price AND total_price = base_price - discount_amount AND duration_months > 0)');
        DB::unprepared('CREATE FUNCTION protect_invoice_snapshot() RETURNS trigger AS $$ BEGIN
            IF ROW(NEW.reference, NEW.user_id, NEW.program_offer_id, NEW.program_id, NEW.plan_code, NEW.base_price, NEW.discount_percent, NEW.discount_amount, NEW.total_price, NEW.currency, NEW.duration_months)
                IS DISTINCT FROM ROW(OLD.reference, OLD.user_id, OLD.program_offer_id, OLD.program_id, OLD.plan_code, OLD.base_price, OLD.discount_percent, OLD.discount_amount, OLD.total_price, OLD.currency, OLD.duration_months) THEN
                RAISE EXCEPTION \'Invoice commercial snapshot is immutable\';
            END IF;
            RETURN NEW;
        END; $$ LANGUAGE plpgsql;
        CREATE TRIGGER invoices_snapshot_immutable BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION protect_invoice_snapshot()');
    }

    public function down(): void
    {
        Schema::dropIfExists('invoices');
        DB::statement('DROP FUNCTION IF EXISTS protect_invoice_snapshot()');
    }
};
