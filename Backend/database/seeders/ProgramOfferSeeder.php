<?php

namespace Database\Seeders;

use App\Models\Program;
use App\Models\ProgramOffer;
use App\Support\DatabaseSafety;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class ProgramOfferSeeder extends Seeder
{
    public function run(): void
    {
        DatabaseSafety::assertTarget(app()->environment('testing'));

        DB::transaction(function () {
            $prices = [
                'n5' => ['lms' => 99000, 'sensei' => 350000],
                'n4' => ['lms' => 99000, 'sensei' => 350000],
                'n3' => ['lms' => 199000, 'sensei' => 450000],
                'n2' => ['lms' => 249000, 'sensei' => 550000],
                'n1' => ['lms' => null, 'sensei' => null],
                'ssw-food' => ['lms' => 299000],
                'interview' => ['lms' => 199000],
            ];

            foreach ($prices as $code => $plans) {
                $program = Program::where('code', $code)->firstOrFail();
                foreach ($plans as $plan => $price) {
                    ProgramOffer::firstOrCreate(['program_id' => $program->id, 'plan_code' => $plan], [
                        'base_price' => $price,
                        'currency' => 'IDR',
                        'duration_months' => $plan === 'lms' ? 6 : 1,
                        'status' => $price === null ? 'inactive' : 'active',
                    ]);
                }
            }
        });
    }
}
