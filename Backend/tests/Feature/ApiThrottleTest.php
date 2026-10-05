<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class ApiThrottleTest extends TestCase
{
    use DatabaseTransactions;

    private function user(string $role = 'student', int $number = 1): User
    {
        $user = new User([
            'name' => 'Throttle Test',
            'email' => "throttle{$number}@example.com",
            'whatsapp' => '08123456789'.$number,
            'password' => 'Password123!',
        ]);
        $user->role = $role;
        $user->account_status = 'active';
        $user->save();

        return $user;
    }

    public function test_navigation_exceeds_old_cap_for_public_student_and_admin(): void
    {
        for ($i = 0; $i < 25; $i++) {
            $this->getJson('/api/public/programs')->assertOk();
        }

        $this->actingAs($this->user());
        for ($i = 0; $i < 25; $i++) {
            $this->getJson('/api/me')->assertOk();
            $this->getJson('/api/student/library')->assertOk();
        }

        $this->actingAs($this->user('admin', 2));
        for ($i = 0; $i < 25; $i++) {
            $this->getJson('/api/admin/programs')->assertOk();
            $this->getJson('/api/admin/offers')->assertOk();
        }
    }

    public function test_read_buckets_are_isolated_and_still_bounded(): void
    {
        $first = $this->user();
        $second = $this->user('student', 2);
        $this->actingAs($first);

        for ($i = 0; $i < 300; $i++) {
            $this->getJson($i % 2 ? '/api/auth/me' : '/api/me')->assertOk();
        }
        $this->getJson('/api/me')->assertStatus(429)->assertHeader('Retry-After');
        $this->actingAs($second)->getJson('/api/me')->assertOk();

        for ($i = 0; $i < 120; $i++) {
            $this->getJson('/api/public/programs')->assertOk();
        }
        $this->actingAs($first)->getJson('/api/public/programs')->assertStatus(429);
        $this->actingAs($second)->getJson('/api/me')->assertOk();
        $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.2'])
            ->getJson('/api/public/programs')->assertOk();
    }

    public function test_writes_are_isolated_from_reads_auth_and_other_users(): void
    {
        $first = $this->user();
        $second = $this->user('student', 2);
        $this->actingAs($first);

        for ($i = 0; $i < 20; $i++) {
            $this->patchJson($i % 2 ? '/api/auth/me' : '/api/me', ['role' => 'admin'])->assertUnprocessable();
        }
        $this->patchJson('/api/me', ['role' => 'admin'])->assertStatus(429)->assertHeader('Retry-After');
        $this->getJson('/api/me')->assertOk();
        $this->getJson('/api/public/programs')->assertOk();
        $this->postJson('/api/auth/login')->assertUnprocessable();
        $this->actingAs($second)->patchJson('/api/me', ['role' => 'admin'])->assertUnprocessable();
    }

    public function test_guest_write_bucket_does_not_consume_public_reads_or_auth(): void
    {
        for ($i = 0; $i < 20; $i++) {
            $this->putJson('/api/placement/attempts/999999999/answers')->assertNotFound();
        }
        $this->postJson('/api/placement/attempts/999999999/submit')->assertStatus(429);
        $this->getJson('/api/public/programs')->assertOk();
        $this->postJson('/api/auth/login')->assertUnprocessable();
        $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.2'])
            ->putJson('/api/placement/attempts/999999999/answers')->assertNotFound();
    }

    public function test_auth_and_password_abuse_limits_remain_strict_and_separate(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->postJson($i % 2 ? '/api/auth/reset-password' : '/api/auth/forgot-password')->assertUnprocessable();
        }
        $this->postJson('/api/auth/reset-password')->assertStatus(429)->assertHeader('Retry-After');
        $this->postJson('/api/auth/forgot-password')->assertStatus(429);

        for ($i = 0; $i < 13; $i++) {
            $this->postJson($i % 2 ? '/api/auth/register' : '/api/auth/login')->assertUnprocessable();
        }
        $this->postJson('/api/auth/login')->assertStatus(429)->assertHeader('Retry-After');
        $this->actingAs($this->user())->postJson('/api/auth/login')->assertStatus(429);
        $this->getJson('/api/me')->assertOk();
        $this->patchJson('/api/me', ['role' => 'admin'])->assertUnprocessable();
        $this->getJson('/api/public/programs')->assertOk();
        $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.2'])
            ->postJson('/api/auth/login')->assertUnprocessable();
    }

    public function test_every_api_route_has_exactly_one_general_or_auth_throttle(): void
    {
        foreach (Route::getRoutes() as $route) {
            if (! str_starts_with($route->uri(), 'api/')) {
                continue;
            }

            $middleware = app('router')->gatherRouteMiddleware($route);
            $throttles = array_values(array_filter($middleware, fn ($name) => str_starts_with($name, 'Illuminate\\Routing\\Middleware\\ThrottleRequests:')));
            $auth = str_starts_with($route->uri(), 'api/auth/') && ! in_array($route->uri(), ['api/auth/me'], true);
            $expected = ['Illuminate\\Routing\\Middleware\\ThrottleRequests:'.($auth ? 'identity' : 'api')];
            if (in_array($route->uri(), ['api/auth/forgot-password', 'api/auth/reset-password'], true)) {
                $expected[] = 'Illuminate\\Routing\\Middleware\\ThrottleRequests:recovery';
            }

            $this->assertSame($expected, $throttles, $route->uri());
        }
    }
}
