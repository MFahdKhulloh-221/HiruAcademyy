<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PublicAnalyticsConfigTest extends TestCase
{
    public function test_public_config_exposes_only_valid_enabled_measurement_id_and_falls_back_only_when_absent(): void
    {
        DB::beginTransaction();
        try {
            config(['services.ga4.measurement_id' => 'G-93DCMCP6N9']);
            DB::table('admin_settings')->where('section', 'integrations')->delete();
            $this->getJson('/api/public/analytics-config')->assertOk()
                ->assertExactJson(['data' => ['measurementId' => 'G-93DCMCP6N9']]);

            config(['services.ga4.measurement_id' => 'G-OVERRIDE']);
            $this->getJson('/api/public/analytics-config')->assertOk()
                ->assertExactJson(['data' => ['measurementId' => 'G-OVERRIDE']]);
            config(['services.ga4.measurement_id' => 'invalid']);
            $this->getJson('/api/public/analytics-config')->assertOk()
                ->assertExactJson(['data' => ['measurementId' => null]]);
            config(['services.ga4.measurement_id' => 'G-93DCMCP6N9']);

            foreach ([
                [['ga4Enabled' => true, 'ga4MeasurementId' => 'g-AbC123', 'senderEmail' => 'private@example.test'], 'g-AbC123'],
                [['ga4Enabled' => false, 'ga4MeasurementId' => 'G-VALID'], null],
                [['ga4Enabled' => 'true', 'ga4MeasurementId' => 'G-VALID'], null],
                [['ga4Enabled' => 1, 'ga4MeasurementId' => 'G-VALID'], null],
                [['ga4Enabled' => true, 'ga4MeasurementId' => 'invalid'], null],
                [['ga4Enabled' => true, 'ga4MeasurementId' => "G-VALID\n"], null],
                [['ga4Enabled' => true, 'ga4MeasurementId' => ['G-VALID']], null],
                [['ga4Enabled' => true], null],
                [[], null],
                [null, null],
            ] as [$settings, $expected]) {
                DB::table('admin_settings')->updateOrInsert(['section' => 'integrations'], [
                    'value' => json_encode($settings), 'created_at' => now(), 'updated_at' => now(),
                ]);
                $this->getJson('/api/public/analytics-config')->assertOk()
                    ->assertExactJson(['data' => ['measurementId' => $expected]]);
            }
        } finally {
            DB::rollBack();
        }
    }
}
