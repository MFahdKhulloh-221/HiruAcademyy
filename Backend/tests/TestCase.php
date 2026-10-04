<?php

namespace Tests;

use App\Support\DatabaseSafety;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\DB;

abstract class TestCase extends BaseTestCase
{
    public function createApplication()
    {
        $app = parent::createApplication();
        if (! $app->environment('testing') || $app->configurationIsCached()) {
            throw new \RuntimeException('Test memerlukan konfigurasi testing tanpa cache.');
        }
        DatabaseSafety::assertTarget(true);
        if ($schema = getenv('HIRU_TEST_SCHEMA')) {
            if (! preg_match('/^hiru_backend_test_[a-z0-9_]+$/D', $schema)
                || DB::selectOne('SELECT current_schema() AS name')->name !== $schema) {
                throw new \RuntimeException('Isolated Backend schema required.');
            }
        }

        return $app;
    }
}
