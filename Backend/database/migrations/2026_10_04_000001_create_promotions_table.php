<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('promotions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('program_offer_id')->constrained()->restrictOnDelete();
            $table->string('name');
            $table->double('discount_percent');
            $table->date('starts_at')->nullable();
            $table->date('ends_at')->nullable();
            $table->enum('status', ['draft', 'active', 'inactive'])->default('draft');
            $table->text('note')->nullable();
            $table->timestamps();
        });

        DB::statement('ALTER TABLE promotions ADD CONSTRAINT promotions_discount_check CHECK (discount_percent >= 0 AND discount_percent <= 100)');
        DB::statement('ALTER TABLE promotions ADD CONSTRAINT promotions_dates_check CHECK (ends_at >= starts_at)');
        DB::statement("CREATE UNIQUE INDEX promotions_one_active_offer ON promotions (program_offer_id) WHERE status = 'active'");
    }

    public function down(): void
    {
        Schema::dropIfExists('promotions');
    }
};
