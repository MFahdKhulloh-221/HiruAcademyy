<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class ActiveUser
{
    public function handle(Request $request, Closure $next)
    {
        if ($request->user()?->account_status !== 'active') {
            auth('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
            abort(401);
        }

        return $next($request);
    }
}
