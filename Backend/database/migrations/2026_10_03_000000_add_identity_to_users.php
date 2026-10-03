<?php

use App\Support\Identity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            throw new RuntimeException('Migrasi memerlukan PostgreSQL.');
        }

        Schema::table('users', function (Blueprint $table) {
            if (! Schema::hasColumn('users', 'email_normalized')) {
                $table->string('email_normalized')->nullable();
            }
            if (! Schema::hasColumn('users', 'whatsapp')) {
                $table->string('whatsapp', 32)->nullable();
            }
            if (! Schema::hasColumn('users', 'whatsapp_normalized')) {
                $table->string('whatsapp_normalized', 15)->nullable();
            }
            if (! Schema::hasColumn('users', 'role')) {
                $table->string('role', 16)->default('student');
            }
            if (! Schema::hasColumn('users', 'account_status')) {
                $table->string('account_status', 16)->default('active');
            }
            if (! Schema::hasColumn('users', 'country')) {
                $table->string('country', 100)->nullable();
            }
            if (! Schema::hasColumn('users', 'target_jlpt')) {
                $table->string('target_jlpt', 10)->nullable();
            }
        });

        // Backfill any existing rows
        if (DB::table('users')->exists()) {
            DB::statement("UPDATE users SET email_normalized = lower(btrim(email)) WHERE email_normalized IS NULL OR email_normalized = ''");
            DB::statement("UPDATE users SET whatsapp = '08123456789' WHERE whatsapp IS NULL OR whatsapp = ''");

            $existingUsers = DB::table('users')->whereNull('whatsapp_normalized')->orWhere('whatsapp_normalized', '')->get();
            foreach ($existingUsers as $u) {
                $normalizedPhone = Identity::phone($u->whatsapp ?? '08123456789');
                DB::table('users')->where('id', $u->id)->update(['whatsapp_normalized' => $normalizedPhone]);
            }

            DB::statement("UPDATE users SET account_status = 'active' WHERE account_status IS NULL OR account_status = ''");
            DB::statement("UPDATE users SET role = 'student' WHERE role IS NULL OR role NOT IN ('admin', 'student')");
        }

        // Apply constraints
        DB::statement('ALTER TABLE users ALTER COLUMN email_normalized SET NOT NULL');
        DB::statement('ALTER TABLE users ALTER COLUMN whatsapp SET NOT NULL');
        DB::statement('ALTER TABLE users ALTER COLUMN whatsapp_normalized SET NOT NULL');
        DB::statement('ALTER TABLE users ALTER COLUMN role SET NOT NULL');
        DB::statement('ALTER TABLE users ALTER COLUMN account_status SET NOT NULL');

        DB::statement("
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'users_email_normalized_unique') THEN
                    CREATE UNIQUE INDEX users_email_normalized_unique ON users (email_normalized);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'users_whatsapp_normalized_unique') THEN
                    CREATE UNIQUE INDEX users_whatsapp_normalized_unique ON users (whatsapp_normalized);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check') THEN
                    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'student'));
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_account_status_check') THEN
                    ALTER TABLE users ADD CONSTRAINT users_account_status_check CHECK (account_status IN ('active', 'inactive'));
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_email_normalized_check') THEN
                    ALTER TABLE users ADD CONSTRAINT users_email_normalized_check CHECK (email_normalized = lower(btrim(email)));
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_whatsapp_normalized_check') THEN
                    ALTER TABLE users ADD CONSTRAINT users_whatsapp_normalized_check CHECK (whatsapp_normalized ~ '^[1-9][0-9]{7,14}$');
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_target_jlpt_check') THEN
                    ALTER TABLE users ADD CONSTRAINT users_target_jlpt_check CHECK (target_jlpt IS NULL OR target_jlpt IN ('N5', 'N4', 'N3', 'N2', 'N1'));
                END IF;
            END $$;
        ");
    }

    public function down(): void
    {
        DB::statement('
            ALTER TABLE users
            DROP CONSTRAINT IF EXISTS users_role_check,
            DROP CONSTRAINT IF EXISTS users_account_status_check,
            DROP CONSTRAINT IF EXISTS users_email_normalized_check,
            DROP CONSTRAINT IF EXISTS users_whatsapp_normalized_check,
            DROP CONSTRAINT IF EXISTS users_target_jlpt_check
        ');
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['email_normalized', 'whatsapp', 'whatsapp_normalized', 'role', 'account_status', 'country', 'target_jlpt']);
        });
    }
};
