<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->foreignId('renewal_grant_id')->nullable()->constrained('access_grants')->restrictOnDelete();
        });
        DB::unprepared("CREATE FUNCTION protect_invoice_renewal() RETURNS trigger AS $$ BEGIN
            IF NEW.renewal_grant_id IS DISTINCT FROM OLD.renewal_grant_id THEN
                RAISE EXCEPTION 'Invoice renewal identity is immutable';
            END IF;
            RETURN NEW;
        END; $$ LANGUAGE plpgsql;
        CREATE TRIGGER invoices_renewal_immutable BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION protect_invoice_renewal()");
    }

    public function down(): void
    {
        DB::statement('DROP TRIGGER IF EXISTS invoices_renewal_immutable ON invoices');
        DB::statement('DROP FUNCTION IF EXISTS protect_invoice_renewal()');
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropConstrainedForeignId('renewal_grant_id');
        });
    }
};
