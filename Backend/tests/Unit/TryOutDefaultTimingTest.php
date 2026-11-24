<?php

namespace Tests\Unit;

use App\Models\TryOut;
use App\Services\TryOutAttemptService;
use App\Services\TryOutService;
use Carbon\Carbon;
use PHPUnit\Framework\TestCase;

final class TryOutDefaultTimingTest extends TestCase
{
    public function test_missing_break_defaults_to_five_minutes_and_preserves_custom_values(): void
    {
        $tryOut = new TryOut;
        $this->assertSame(5, $tryOut->break_duration_minutes);
        $tryOut->break_duration_minutes = null;
        $this->assertSame(5, $tryOut->only(['break_duration_minutes'])['break_duration_minutes']);

        $service = (new \ReflectionClass(TryOutAttemptService::class))->newInstanceWithoutConstructor();
        $metadata = new \ReflectionMethod(TryOutAttemptService::class, 'snapshotMetadata');
        $this->assertSame(5, $metadata->invoke($service, $tryOut, [])['break_duration_minutes']);

        $tryOut->break_duration_minutes = 10;
        $this->assertSame(10, $tryOut->break_duration_minutes);
        $this->assertSame(10, $metadata->invoke($service, $tryOut, [])['break_duration_minutes']);
    }

    public function test_missing_session_timing_defaults_to_thirty_minutes_and_sets_server_deadline(): void
    {
        $tryOut = new TryOut;
        $expected = array_fill_keys(array_keys(TryOutService::SESSIONS), 30);
        $this->assertSame($expected, $tryOut->session_duration_minutes);
        $tryOut->session_duration_minutes = null;
        $this->assertSame($expected, $tryOut->session_duration_minutes);

        $startedAt = Carbon::parse('2026-11-24T09:00:00+07:00');
        $service = (new \ReflectionClass(TryOutAttemptService::class))->newInstanceWithoutConstructor();
        $deadline = new \ReflectionMethod(TryOutAttemptService::class, 'deadline');
        $this->assertTrue($startedAt->copy()->addMinutes(30)->equalTo($deadline->invoke($service, $tryOut, $startedAt)));

        $custom = array_fill_keys(array_keys(TryOutService::SESSIONS), 45);
        $tryOut->session_duration_minutes = $custom;
        $this->assertSame($custom, $tryOut->session_duration_minutes);
        $this->assertSame($custom, $tryOut->only(['session_duration_minutes'])['session_duration_minutes']);
        $this->assertTrue($startedAt->copy()->addMinutes(45)->equalTo($deadline->invoke($service, $tryOut, $startedAt)));
    }
}
