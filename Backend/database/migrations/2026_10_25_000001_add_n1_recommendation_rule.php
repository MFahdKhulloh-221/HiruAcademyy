<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $complete = [
            ['minScore' => 0, 'maxScore' => 24, 'recommendedProgramCode' => 'N5', 'resultTitle' => 'Rekomendasi Level N5', 'resultDescription' => 'Mulai dari dasar huruf, kosakata harian, dan pola kalimat N5.'],
            ['minScore' => 25, 'maxScore' => 49, 'recommendedProgramCode' => 'N4', 'resultTitle' => 'Rekomendasi Level N4', 'resultDescription' => 'Tingkatkan kemampuan ke percakapan praktis dan tata bahasa N4.'],
            ['minScore' => 50, 'maxScore' => 69, 'recommendedProgramCode' => 'N3', 'resultTitle' => 'Rekomendasi Level N3', 'resultDescription' => 'Siap mendalami pemahaman teks dan tata bahasa level menengah N3.'],
            ['minScore' => 70, 'maxScore' => 84, 'recommendedProgramCode' => 'N2', 'resultTitle' => 'Rekomendasi Level N2', 'resultDescription' => 'Persiapan intensif level lanjutan N2 untuk studi atau karir di Jepang.'],
            ['minScore' => 85, 'maxScore' => 100, 'recommendedProgramCode' => 'N1', 'resultTitle' => 'Rekomendasi Level N1', 'resultDescription' => 'Kemampuanmu sudah sangat baik. Persiapan akhir menuju level tertinggi JLPT N1.'],
        ];

        // Replace the old 4-rule default (N5–N2 only) with complete 5-rule set (N5–N1).
        // Only updates configs still using the exact old default; admin-customized rules are preserved.
        $old = json_encode([
            ['minScore' => 0, 'maxScore' => 39, 'recommendedProgramCode' => 'N5', 'resultTitle' => 'Rekomendasi Level N5', 'resultDescription' => 'Mulai dari dasar huruf, kosakata harian, dan pola kalimat N5.'],
            ['minScore' => 40, 'maxScore' => 59, 'recommendedProgramCode' => 'N4', 'resultTitle' => 'Rekomendasi Level N4', 'resultDescription' => 'Tingkatkan kemampuan ke percakapan praktis dan tata bahasa N4.'],
            ['minScore' => 60, 'maxScore' => 74, 'recommendedProgramCode' => 'N3', 'resultTitle' => 'Rekomendasi Level N3', 'resultDescription' => 'Siap mendalami pemahaman teks dan tata bahasa level menengah N3.'],
            ['minScore' => 75, 'maxScore' => 100, 'recommendedProgramCode' => 'N2', 'resultTitle' => 'Rekomendasi Level N2', 'resultDescription' => 'Persiapan intensif level lanjutan N2 untuk studi atau karir di Jepang.'],
        ], JSON_THROW_ON_ERROR);

        DB::table('placement_configs')
            ->whereRaw("recommendation_rules @> ?::jsonb AND ?::jsonb @> recommendation_rules", [$old, $old])
            ->update(['recommendation_rules' => json_encode($complete, JSON_THROW_ON_ERROR)]);

        // Also catch any still-empty configs
        DB::table('placement_configs')
            ->whereRaw("recommendation_rules = '[]'::jsonb")
            ->update(['recommendation_rules' => json_encode($complete, JSON_THROW_ON_ERROR)]);
    }

    public function down(): void {}
};
