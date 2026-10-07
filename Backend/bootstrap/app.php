<?php

use App\Http\Middleware\ActiveUser;
use App\Http\Middleware\RequireRole;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(web: __DIR__.'/../routes/web.php', commands: __DIR__.'/../routes/console.php', health: '/up')
    ->withMiddleware(function (Middleware $middleware) {
        if ($proxies = env('TRUSTED_PROXIES')) {
            $middleware->trustProxies(at: $proxies === '*' ? '*' : explode(',', $proxies), headers: Request::HEADER_X_FORWARDED_PROTO);
        }
        $middleware->statefulApi();
        $middleware->alias(['active' => ActiveUser::class, 'role' => RequireRole::class]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        $exceptions->shouldRenderJsonWhen(fn (Request $request) => $request->is('api/*') || $request->expectsJson());
        $exceptions->render(function (Throwable $exception, Request $request) {
            if (! $request->is('api/*') && ! $request->expectsJson()) {
                return null;
            }

            if ($exception instanceof ValidationException) {
                return response()->json([
                    'message' => 'Periksa kembali data yang kamu isi.',
                    'errors' => $exception->errors(),
                ], 422);
            }

            $status = match (true) {
                $exception instanceof UniqueConstraintViolationException => 422,
                $exception instanceof AuthenticationException => 401,
                $exception instanceof HttpExceptionInterface => $exception->getStatusCode(),
                default => 500,
            };
            $message = match ($status) {
                401 => 'Silakan masuk untuk melanjutkan.',
                403 => 'Akun kamu belum memiliki akses ke fitur ini.',
                404 => 'Data belum tersedia.',
                419 => 'Sesi kamu sudah berakhir. Silakan masuk kembali.',
                422 => 'Periksa kembali data yang kamu isi.',
                429 => 'Terlalu banyak percobaan. Silakan tunggu sebentar.',
                default => 'Terjadi gangguan. Silakan coba beberapa saat lagi.',
            };

            return response()->json(['message' => $message], $status,
                $exception instanceof HttpExceptionInterface ? $exception->getHeaders() : []);
        });
    })->create();
