<?php

namespace Tests\Unit;

use App\Models\Program;
use App\Models\TryOut;
use App\Models\TryOutAttempt;
use App\Models\User;
use App\Services\ChapterAccessPolicy;
use App\Services\TryOutAttemptService;
use App\Services\TryOutService;
use Illuminate\Container\Container;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpKernel\Exception\HttpException;

final class TryOutAccessTest extends TestCase
{
    public static function accessCases(): array
    {
        $cases = [];
        foreach (['free', 'membership'] as $type) {
            foreach (['full', 'preview', 'expired', 'revoked', 'other-program'] as $state) {
                foreach (['detail/start', 'attempt/save/submit/review'] as $stage) {
                    $cases["$type $state $stage"] = [$type, $state, $stage !== 'detail/start', $type === 'free' || $state === 'full'];
                }
            }
        }
        return $cases;
    }

    #[DataProvider('accessCases')]
    public function test_all_entry_points_use_same_access_guard(string $type, string $state, bool $existing, bool $allowed): void
    {
        $previous = Container::getInstance();
        Container::setInstance(new class extends Container {
            public function abort($code, $message = '', array $headers = []): never
            {
                throw new HttpException($code, $message, null, $headers);
            }
        });
        try {
            $user = (new User)->forceFill(['id' => 1, 'role' => 'student', 'account_status' => 'active']);
            $program = (new Program)->forceFill(['id' => 2, 'code' => 'n4', 'family' => 'jlpt', 'status' => 'active']);
            $relation = Mockery::mock(BelongsTo::class);
            $relation->shouldReceive('firstOrFail')->once()->andReturn($program);
            $tryOut = Mockery::mock(TryOut::class)->makePartial();
            $tryOut->forceFill(['id' => 3, 'access_type' => $type, 'status' => 'published']);
            $tryOut->shouldReceive('program')->once()->andReturn($relation);
            $policy = $this->createMock(ChapterAccessPolicy::class);
            $policy->method('canAccessProgram')->willReturn(true);
            if ($type === 'free') {
                $policy->expects($this->never())->method('canAccessChapter');
            } else {
                $policy->expects($this->once())->method('canAccessChapter')->with($user, 'n4', 2)->willReturn($state === 'full');
            }
            $service = new TryOutAttemptService($policy, new TryOutService);
            $attempt = $existing ? (new TryOutAttempt)->forceFill(['user_id' => 1, 'try_out_id' => 3]) : null;
            try {
                $service->authorize($user, $tryOut, $attempt);
                $this->assertTrue($allowed);
            } catch (HttpException $error) {
                $this->assertFalse($allowed);
                $this->assertSame(403, $error->getStatusCode());
            }
        } finally {
            Mockery::close();
            Container::setInstance($previous);
        }
    }
}
