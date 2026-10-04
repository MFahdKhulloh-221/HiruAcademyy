<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['affiliates', 'commissions', 'invoice_attributions'] as $table) {
            DB::statement("ALTER TABLE {$table} ALTER COLUMN created_at TYPE timestamp(0) with time zone USING created_at AT TIME ZONE 'UTC', ALTER COLUMN updated_at TYPE timestamp(0) with time zone USING updated_at AT TIME ZONE 'UTC'");
        }
    }

    public function down(): void
    {
        foreach (['affiliates', 'commissions', 'invoice_attributions'] as $table) {
            DB::statement("ALTER TABLE {$table} ALTER COLUMN created_at TYPE timestamp(0) without time zone USING created_at AT TIME ZONE 'UTC', ALTER COLUMN updated_at TYPE timestamp(0) without time zone USING updated_at AT TIME ZONE 'UTC'");
        }
    }
};
