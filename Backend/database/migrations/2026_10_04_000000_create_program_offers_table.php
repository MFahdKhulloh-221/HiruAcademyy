<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('program_offers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('program_id')->constrained()->restrictOnDelete();
            $table->enum('plan_code', ['lms', 'sensei']);
            $table->integer('base_price')->nullable();
            $table->enum('currency', ['IDR'])->default('IDR');
            $table->smallInteger('duration_months');
            $table->enum('status', ['active', 'inactive'])->default('inactive');
            $table->timestamps();
            $table->unique(['program_id', 'plan_code']);
        });

        DB::statement('ALTER TABLE program_offers ADD CONSTRAINT program_offers_base_price_check CHECK (base_price >= 0)');
        DB::statement('ALTER TABLE program_offers ADD CONSTRAINT program_offers_duration_check CHECK (duration_months > 0)');
    }

    public function down(): void
    {
        Schema::dropIfExists('program_offers');
    }
};
