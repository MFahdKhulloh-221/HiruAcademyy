<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class RequireRole
{
    public function handle(Request $request, Closure $next, string $role)
    {
        abort_unless(in_array($role, ['admin', 'student'], true) && $request->user()?->role === $role, 403);

        return $next($request);
    }
}
