<?php

namespace Tests\Feature;

use Tests\TestCase;

class CheckpointHttpTest extends TestCase
{
    public function test_checkpoint_endpoints_require_login_without_database_access(): void
    {
        foreach ([
            ['GET', '/api/student/checkpoint-packages'],
            ['GET', '/api/student/checkpoint-packages/1'],
            ['POST', '/api/student/checkpoint-packages/1/attempts'],
            ['GET', '/api/student/checkpoint-packages/1/attempts/1'],
            ['PUT', '/api/student/checkpoint-packages/1/attempts/1/answers'],
            ['POST', '/api/student/checkpoint-packages/1/attempts/1/submit'],
            ['GET', '/api/student/checkpoint-packages/1/attempts/1/result'],
            ['GET', '/api/student/checkpoint-packages/1/attempts/1/review'],
            ['GET', '/api/admin/checkpoint-packages'],
            ['POST', '/api/admin/checkpoint-packages'],
            ['PATCH', '/api/admin/checkpoint-packages/1'],
            ['PUT', '/api/admin/checkpoint-packages/1/studio'],
            ['POST', '/api/student/checkpoint-packages/1/attempts/1/abandon'],
        ] as [$method, $url]) {
            $this->json($method, $url)->assertUnauthorized();
        }
    }
}
