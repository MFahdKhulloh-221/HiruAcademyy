<?php

namespace App\Providers;

use App\Support\DatabaseSafety;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Console\Events\CommandStarting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        if ($this->app->environment('local')) {
            config(['mail.default' => 'log']);
        }
        ResetPassword::createUrlUsing(fn ($user, string $token) => rtrim(config('app.frontend_url'), '/').'/reset-password?'.http_build_query(['token' => $token, 'email' => $user->getEmailForPasswordReset()]));
        RateLimiter::for('identity', fn (Request $request) => Limit::perMinute(20)->by($request->ip()));
        RateLimiter::for('recovery', fn (Request $request) => Limit::perMinute(5)->by($request->ip()));
        Event::listen(CommandStarting::class, function (CommandStarting $event) {
            if (str_starts_with($event->command ?? '', 'migrate') || in_array($event->command, ['db:wipe', 'db:seed', 'hiru:admin:create'], true)) {
                if (! $this->app->environment('testing') && in_array($event->command, ['migrate:fresh', 'migrate:refresh', 'migrate:reset', 'migrate:rollback', 'db:wipe', 'db:seed'], true)) {
                    throw new \RuntimeException('Operasi destruktif diblokir pada database normal.');
                }
                DatabaseSafety::assertTarget($this->app->environment('testing'));
            }
        });
    }
}
