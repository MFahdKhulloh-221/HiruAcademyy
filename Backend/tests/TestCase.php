<?php

namespace Tests;

use App\Support\DatabaseSafety;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    public function createApplication()
    {
        $app = parent::createApplication();
        if (! $app->environment('testing') || $app->configurationIsCached()) {
            throw new \RuntimeException('Test memerlukan konfigurasi testing tanpa cache.');
        }
        DatabaseSafety::assertTarget(true);

        return $app;
    }
}
