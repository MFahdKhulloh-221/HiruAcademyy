<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $rules = [
            ['minScore' => 0, 'maxScore' => 39, 'recommendedProgramCode' => 'N5', 'resultTitle' => 'Rekomendasi Level N5', 'resultDescription' => 'Mulai dari dasar huruf, kosakata harian, dan pola kalimat N5.'],
            ['minScore' => 40, 'maxScore' => 59, 'recommendedProgramCode' => 'N4', 'resultTitle' => 'Rekomendasi Level N4', 'resultDescription' => 'Tingkatkan kemampuan ke percakapan praktis dan tata bahasa N4.'],
            ['minScore' => 60, 'maxScore' => 74, 'recommendedProgramCode' => 'N3', 'resultTitle' => 'Rekomendasi Level N3', 'resultDescription' => 'Siap mendalami pemahaman teks dan tata bahasa level menengah N3.'],
            ['minScore' => 75, 'maxScore' => 100, 'recommendedProgramCode' => 'N2', 'resultTitle' => 'Rekomendasi Level N2', 'resultDescription' => 'Persiapan intensif level lanjutan N2 untuk studi atau karir di Jepang.'],
        ];
        DB::table('placement_configs')->whereRaw("recommendation_rules = '[]'::jsonb")->update(['recommendation_rules' => json_encode($rules, JSON_THROW_ON_ERROR)]);
    }

    public function down(): void {}
};
