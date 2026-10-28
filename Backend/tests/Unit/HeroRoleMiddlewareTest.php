<?php

namespace Tests\Unit;

use App\Http\Middleware\RequireRole;
use App\Models\User;
use Illuminate\Container\Container;
use Illuminate\Http\Request;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpKernel\Exception\HttpException;

final class HeroRoleMiddlewareTest extends TestCase
{
    public function test_admin_role_middleware_rejects_student_and_guest_and_allows_admin(): void
    {
        $previous = Container::getInstance();
        Container::setInstance(new class extends Container
        {
            public function abort($code, $message = '', array $headers = []): never
            {
                throw new HttpException($code, $message, null, $headers);
            }
        });
        try {
            foreach ([null, 'student', 'admin'] as $role) {
                $request = Request::create('/api/admin/landing/hero');
                $request->setUserResolver(fn () => $role === null ? null : (new User)->forceFill(['role' => $role]));
                $called = false;
                try {
                    $result = (new RequireRole)->handle($request, function () use (&$called) {
                        $called = true;

                        return 'allowed';
                    }, 'admin');
                    $this->assertSame('admin', $role);
                    $this->assertSame('allowed', $result);
                } catch (HttpException $error) {
                    $this->assertNotSame('admin', $role);
                    $this->assertSame(403, $error->getStatusCode());
                }
                $this->assertSame($role === 'admin', $called);
            }
        } finally {
            Container::setInstance($previous);
        }
    }
}
