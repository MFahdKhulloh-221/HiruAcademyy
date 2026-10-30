<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('content_transfer_records', function (Blueprint $table) {
            $table->id();
            $table->char('archive_hash', 64);
            $table->string('category', 64);
            $table->unsignedBigInteger('source_id');
            $table->unsignedBigInteger('target_id');
            $table->char('record_hash', 64);
            $table->unique(['archive_hash', 'category', 'source_id'], 'content_transfer_source_unique');
        });
    }

    public function down(): void
    {
        throw new LogicException('Transfer mappings protect idempotency; retain them when rolling back application code.');
    }
};
