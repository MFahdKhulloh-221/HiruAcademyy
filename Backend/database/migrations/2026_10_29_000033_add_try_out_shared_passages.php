<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('try_out_passages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('try_out_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->text('body');
            $table->timestamps();
        });
        Schema::table('try_out_questions', function (Blueprint $table) {
            $table->foreignId('passage_id')->nullable()->constrained('try_out_passages')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('try_out_questions', fn (Blueprint $table) => $table->dropConstrainedForeignId('passage_id'));
        Schema::dropIfExists('try_out_passages');
    }
};
