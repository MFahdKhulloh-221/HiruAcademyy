<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// DRAFT ONLY: outside migration discovery; promotion requires review. Never deletes storage objects.
return new class extends Migration
{
    public function up(): void
    {
        DB::transaction(function () {
            foreach (['try_out_questions', 'try_out_passages'] as $tableName) {
                Schema::table($tableName, function (Blueprint $table) {
                    $table->text('image')->nullable();
                    $table->text('image_alt')->default('');
                    $table->string('image_position')->default('before');
                });

                if (DB::getDriverName() === 'pgsql') {
                    DB::statement("ALTER TABLE {$tableName} ADD CONSTRAINT {$tableName}_image_position_check CHECK (image_position IN ('before', 'after'))");
                }
            }
        });
    }

    public function down(): void
    {
        DB::transaction(function () {
            if (DB::getDriverName() === 'pgsql') {
                // Hold both locks through inspection and DDL; concurrent writes cannot escape the guard.
                DB::statement('LOCK TABLE try_out_questions, try_out_passages IN ACCESS EXCLUSIVE MODE');
            }

            foreach (['try_out_questions', 'try_out_passages'] as $tableName) {
                if (DB::table($tableName)->where(function ($query) {
                    $query->whereNotNull('image')
                        ->orWhere('image_alt', '<>', '')
                        ->orWhere('image_position', '<>', 'before');
                })->exists()) {
                    throw new RuntimeException("Refusing rollback: {$tableName} contains image references or image metadata. Preserve data before reconsidering rollback.");
                }
            }

            foreach (['try_out_questions', 'try_out_passages'] as $tableName) {
                if (DB::getDriverName() === 'pgsql') {
                    DB::statement("ALTER TABLE {$tableName} DROP CONSTRAINT {$tableName}_image_position_check");
                }

                Schema::table($tableName, fn (Blueprint $table) => $table->dropColumn(['image', 'image_alt', 'image_position']));
            }
        });
    }
};
