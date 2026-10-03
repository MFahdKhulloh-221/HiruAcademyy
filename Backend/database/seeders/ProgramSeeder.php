<?php

namespace Database\Seeders;

use App\Models\Program;
use App\Support\DatabaseSafety;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class ProgramSeeder extends Seeder
{
    public function run(): void
    {
        DatabaseSafety::assertTarget(app()->environment('testing'));

        DB::transaction(function () {
            $programs = [
                ['dasar', 'DASAR', 'foundation', null],
                ['n5', 'JLPT N5', 'jlpt', 5],
                ['n4', 'JLPT N4', 'jlpt', 4],
                ['n3', 'JLPT N3', 'jlpt', 3],
                ['n2', 'JLPT N2', 'jlpt', 2],
                ['n1', 'JLPT N1', 'jlpt', 1],
                ['ssw-food', 'SSW Pengolahan Makanan', 'ssw', null],
                ['interview', 'Interview', 'interview', null],
            ];

            foreach ($programs as $index => [$code, $name, $family, $rank]) {
                Program::firstOrCreate(['code' => $code], [
                    'slug' => $code,
                    'name' => $name,
                    'family' => $family,
                    'cumulative_rank' => $rank,
                    'status' => 'active',
                    'sort_order' => $index + 1,
                ]);
            }
        });
    }
}
