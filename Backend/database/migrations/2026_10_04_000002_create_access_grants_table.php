<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('access_grants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->foreignId('program_id')->constrained()->restrictOnDelete();
            $table->enum('plan_code', ['lms', 'sensei']);
            $table->date('starts_at');
            $table->date('ends_at');
            $table->enum('status', ['active', 'inactive']);
            $table->timestamps();
            $table->foreign(['program_id', 'plan_code'])->references(['program_id', 'plan_code'])->on('program_offers')->restrictOnDelete();
        });

        DB::statement('ALTER TABLE access_grants ADD CONSTRAINT access_grants_dates_check CHECK (ends_at >= starts_at)');
    }

    public function down(): void
    {
        Schema::dropIfExists('access_grants');
    }
};
