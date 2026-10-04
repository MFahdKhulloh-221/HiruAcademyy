<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('affiliates', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('code');
            $table->foreignId('user_id')->nullable()->unique()->constrained()->restrictOnDelete();
            $table->string('email')->nullable();
            $table->string('whatsapp')->nullable();
            $table->enum('status', ['active', 'inactive']);
            $table->timestamps();
        });
        DB::statement('ALTER TABLE affiliates ADD COLUMN rate numeric NULL');
        DB::statement("ALTER TABLE affiliates ADD CONSTRAINT affiliates_values_check CHECK (code ~ '^[A-Z0-9_-]+$' AND (email IS NULL OR email = lower(btrim(email))) AND (rate IS NULL OR rate BETWEEN 0 AND 100))");
        DB::statement('CREATE UNIQUE INDEX affiliates_code_unique ON affiliates (upper(code))');
        DB::statement('CREATE UNIQUE INDEX affiliates_email_unique ON affiliates (lower(email))');
        Schema::create('invoice_attributions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('invoice_id')->unique()->constrained()->restrictOnDelete();
            $table->foreignId('affiliate_id')->constrained()->restrictOnDelete();
            $table->timestamps();
            $table->unique(['invoice_id', 'affiliate_id']);
        });
        Schema::create('commissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('invoice_id')->constrained()->restrictOnDelete();
            $table->foreignId('affiliate_id')->constrained()->restrictOnDelete();
            $table->bigInteger('amount');
            $table->enum('status', ['pending', 'approved', 'paid'])->default('pending');
            $table->date('paid_at')->nullable();
            $table->text('note')->nullable();
            $table->timestamps();
            $table->unique(['invoice_id', 'affiliate_id']);
            $table->foreign(['invoice_id', 'affiliate_id'])->references(['invoice_id', 'affiliate_id'])->on('invoice_attributions')->restrictOnDelete();
        });
        DB::statement('ALTER TABLE commissions ADD COLUMN rate numeric NOT NULL');
        DB::statement("ALTER TABLE commissions ADD CONSTRAINT commissions_values_check CHECK (amount >= 0 AND rate BETWEEN 0 AND 100 AND ((status = 'paid') = (paid_at IS NOT NULL)))");
        DB::unprepared('CREATE FUNCTION protect_affiliate_records() RETURNS trigger AS $$ BEGIN
            IF TG_TABLE_NAME = \'invoice_attributions\' THEN
                RAISE EXCEPTION \'Invoice attribution is immutable\';
            ELSIF TG_OP = \'DELETE\' THEN
                RAISE EXCEPTION \'Commission records cannot be deleted\';
            ELSIF ROW(NEW.invoice_id, NEW.affiliate_id, NEW.rate, NEW.amount) IS DISTINCT FROM ROW(OLD.invoice_id, OLD.affiliate_id, OLD.rate, OLD.amount) THEN
                RAISE EXCEPTION \'Commission monetary snapshot is immutable\';
            ELSIF NEW.status IS DISTINCT FROM OLD.status AND NOT ((OLD.status = \'pending\' AND NEW.status = \'approved\') OR (OLD.status = \'approved\' AND NEW.status = \'paid\')) THEN
                RAISE EXCEPTION \'Commission must advance exactly one state\';
            ELSIF OLD.status = \'paid\' AND ROW(NEW.paid_at, NEW.note) IS DISTINCT FROM ROW(OLD.paid_at, OLD.note) THEN
                RAISE EXCEPTION \'Paid commission is immutable\';
            END IF;
            RETURN NEW;
        END; $$ LANGUAGE plpgsql;
        CREATE TRIGGER invoice_attributions_immutable BEFORE UPDATE OR DELETE ON invoice_attributions FOR EACH ROW EXECUTE FUNCTION protect_affiliate_records();
        CREATE TRIGGER commissions_immutable BEFORE UPDATE OR DELETE ON commissions FOR EACH ROW EXECUTE FUNCTION protect_affiliate_records()');
        DB::unprepared('CREATE FUNCTION protect_paid_affiliate_rate() RETURNS trigger AS $$ BEGIN
            IF NEW.rate IS DISTINCT FROM OLD.rate AND EXISTS (SELECT 1 FROM commissions WHERE affiliate_id = OLD.id AND status = \'paid\') THEN
                RAISE EXCEPTION \'Rate cannot change after a paid commission\';
            END IF;
            RETURN NEW;
        END; $$ LANGUAGE plpgsql;
        CREATE TRIGGER affiliates_paid_rate_immutable BEFORE UPDATE ON affiliates FOR EACH ROW EXECUTE FUNCTION protect_paid_affiliate_rate()');
    }

    public function down(): void
    {
        Schema::dropIfExists('commissions');
        Schema::dropIfExists('invoice_attributions');
        Schema::dropIfExists('affiliates');
        DB::statement('DROP FUNCTION IF EXISTS protect_affiliate_records()');
        DB::statement('DROP FUNCTION IF EXISTS protect_paid_affiliate_rate()');
    }
};
