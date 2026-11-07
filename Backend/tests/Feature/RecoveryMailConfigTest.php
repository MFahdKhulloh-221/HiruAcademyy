<?php

namespace Tests\Feature;

use App\Providers\AppServiceProvider;
use Illuminate\Mail\Transport\LogTransport;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport;
use Tests\TestCase;

class RecoveryMailConfigTest extends TestCase
{
    private array $processEnvironment = [];

    protected function setUp(): void
    {
        parent::setUp();
        foreach (['HIRU_LOCAL_RESEND', 'HIRU_LOCAL_RESEND_KEY'] as $name) {
            $this->processEnvironment[$name] = getenv($name);
            putenv($name);
        }
    }

    protected function tearDown(): void
    {
        foreach ($this->processEnvironment as $name => $value) {
            putenv($value === false ? $name : $name.'='.$value);
        }
        parent::tearDown();
    }

    private function bootMail(string $environment): void
    {
        $this->app->instance('env', $environment);
        (new AppServiceProvider($this->app))->boot();
    }

    public function test_local_defaults_to_log_even_when_smtp_is_configured(): void
    {
        config(['mail.default' => 'smtp']);
        $this->bootMail('local');
        $this->assertSame('log', config('mail.default'));
        $this->assertInstanceOf(LogTransport::class, Mail::mailer()->getSymfonyTransport());
    }

    public function test_process_opt_in_selects_smtps_without_network_or_delivery(): void
    {
        putenv('HIRU_LOCAL_RESEND=1');
        putenv('HIRU_LOCAL_RESEND_KEY=not-a-real-key');
        $this->bootMail('local');
        $this->assertSame('local_resend', config('mail.default'));
        $this->assertSame('smtps', config('mail.mailers.local_resend.scheme'));
        $this->assertSame('smtp.resend.com', config('mail.mailers.local_resend.host'));
        $this->assertSame(465, config('mail.mailers.local_resend.port'));
        $this->assertSame('resend', config('mail.mailers.local_resend.username'));
        $this->assertSame('noreply@mail.hiruacademy.id', config('mail.from.address'));
        $transport = Mail::mailer()->getSymfonyTransport();
        $this->assertInstanceOf(EsmtpTransport::class, $transport);
        $this->assertTrue($transport->getStream()->isTLS());
    }

    public function test_missing_key_fails_without_log_fallback(): void
    {
        putenv('HIRU_LOCAL_RESEND=1');
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Local Resend requires uncached config and a process API key.');
        $this->bootMail('local');
    }

    public function test_production_ignores_local_opt_in(): void
    {
        putenv('HIRU_LOCAL_RESEND=1');
        putenv('HIRU_LOCAL_RESEND_KEY=not-a-real-key');
        config(['mail.default' => 'array']);
        $this->bootMail('production');
        $this->assertSame('array', config('mail.default'));
        $this->assertNull(config('mail.mailers.local_resend'));
    }
}
