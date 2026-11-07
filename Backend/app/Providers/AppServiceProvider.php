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
            // Process-only opt-in: never read credentials from .env or config cache.
            if (getenv('HIRU_LOCAL_RESEND') === '1') {
                $key = getenv('HIRU_LOCAL_RESEND_KEY');
                if ($this->app->configurationIsCached() || ! is_string($key) || trim($key) === '') {
                    throw new \RuntimeException('Local Resend requires uncached config and a process API key.');
                }
                config([
                    'mail.default' => 'local_resend',
                    'mail.mailers.local_resend' => [
                        'transport' => 'smtp',
                        'scheme' => 'smtps',
                        'url' => null,
                        'host' => 'smtp.resend.com',
                        'port' => 465,
                        'username' => 'resend',
                        'password' => $key,
                        'timeout' => 20,
                    ],
                    'mail.from' => ['address' => 'noreply@mail.hiruacademy.id', 'name' => 'HiruAcademy'],
                ]);
            }
        }
        ResetPassword::createUrlUsing(fn ($user, string $token) => rtrim(config('app.frontend_url'), '/').'/reset-password?'.http_build_query(['token' => $token, 'email' => $user->getEmailForPasswordReset()]));
        RateLimiter::for('api', function (Request $request) {
            $authenticated = in_array('auth:sanctum', $request->route()->gatherMiddleware(), true);
            $key = $request->user() ? 'user:'.$request->user()->getAuthIdentifier() : 'ip:'.$request->ip();

            if ($request->isMethodSafe()) {
                return $authenticated
                    ? Limit::perMinute(300)->by('authenticated-read:'.$key)
                    : Limit::perMinute(120)->by('public-read:'.$request->ip());
            }

            if ($request->routeIs('assessment.*')) {
                return Limit::none();
            }

            return Limit::perMinute(20)->by('write:'.$key);
        });
        RateLimiter::for('identity', fn (Request $request) => Limit::perMinute(20)->by($request->ip()));
        RateLimiter::for('recovery', fn (Request $request) => Limit::perMinute(5)->by($request->ip()));
        Event::listen(CommandStarting::class, function (CommandStarting $event) {
            if (str_starts_with($event->command ?? '', 'migrate') || in_array($event->command, ['db:wipe', 'db:seed', 'hiru:admin:create'], true)) {
                $programSeed = $event->command === 'db:seed'
                    && in_array($event->input->getOption('class'), ['ProgramSeeder', 'Database\\Seeders\\ProgramSeeder', 'ProgramOfferSeeder', 'Database\\Seeders\\ProgramOfferSeeder'], true);
                $demoSeed = $this->app->environment('local') && $event->command === 'db:seed'
                    && in_array($event->input->getOption('class'), ['TryOutN5DemoSeeder', 'Database\\Seeders\\TryOutN5DemoSeeder', 'DemoQuestionsSeeder', 'Database\\Seeders\\DemoQuestionsSeeder'], true);
                if (! $this->app->environment('testing') && ! $programSeed && ! $demoSeed && in_array($event->command, ['migrate:fresh', 'migrate:refresh', 'migrate:reset', 'migrate:rollback', 'db:wipe', 'db:seed'], true)) {
                    throw new \RuntimeException('Operasi destruktif diblokir pada database normal.');
                }
                $productionMigrate = $this->app->environment('production') && $event->command === 'migrate';
                if (! $productionMigrate) {
                    DatabaseSafety::assertTarget($this->app->environment('testing'));
                }
            }
        });
    }
}
