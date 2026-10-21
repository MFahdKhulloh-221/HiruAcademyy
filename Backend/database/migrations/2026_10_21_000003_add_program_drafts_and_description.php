<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('programs', function (Blueprint $table) {
            $table->text('description')->nullable();
        });

        foreach ([
            'dasar' => 'Hiragana, Katakana, salam, dan pola dasar pemula.',
            'n5' => 'Tata bahasa dasar, kanji pemula, dan percakapan harian.',
            'n4' => 'Pola kalimat lanjutan, kanji esensial, dan percakapan kontekstual.',
            'n3' => 'Tata bahasa menengah, teks umum, dan kemampuan komunikasi.',
            'n2' => 'Tata bahasa kompleks, artikel opini, dan pemahaman profesional.',
            'n1' => 'Nuansa bahasa tingkat tinggi, teks kompleks, dan strategi JLPT N1.',
            'ssw-food' => 'SOP industri makanan Jepang, higienitas, dan instruksi lapangan.',
            'interview' => 'Etika wawancara kerja, motivasi, dan simulasi profesional.',
        ] as $code => $description) {
            DB::table('programs')->where('code', $code)->update(['description' => $description]);
        }

        if (DB::getDriverName() === 'pgsql') {
            foreach (DB::select("SELECT conname FROM pg_constraint WHERE conrelid = 'programs'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%status%'") as $constraint) {
                DB::statement('ALTER TABLE programs DROP CONSTRAINT "'.str_replace('"', '""', $constraint->conname).'"');
            }
            DB::statement("ALTER TABLE programs ALTER COLUMN status SET DEFAULT 'draft'");
            DB::statement("ALTER TABLE programs ADD CONSTRAINT programs_status_check CHECK (status IN ('draft', 'active', 'inactive'))");
        } else {
            Schema::table('programs', function (Blueprint $table) {
                $table->enum('status', ['draft', 'active', 'inactive'])->default('draft')->change();
            });
        }
    }

    public function down(): void
    {
        throw new RuntimeException('Review draft programs and descriptions before reverting this migration.');
    }
};
