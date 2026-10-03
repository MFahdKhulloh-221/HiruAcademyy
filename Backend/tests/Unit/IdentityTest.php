<?php

namespace Tests\Unit;

use App\Support\Identity;
use PHPUnit\Framework\TestCase;

class IdentityTest extends TestCase
{
    public function test_normalization_preserves_explicit_international_numbers(): void
    {
        $this->assertSame('user@example.com', Identity::email(' User@Example.COM '));
        $this->assertSame('628123456789', Identity::phone('0812-3456-789'));
        $this->assertSame('628123456789', Identity::phone('+62 812 3456 789'));
        $this->assertSame('447123456789', Identity::phone('+44 7123 456789'));
        $this->assertSame('', Identity::phone('0812letters'));
        $this->assertSame('', Identity::phone('++628123456789'));
    }
}
