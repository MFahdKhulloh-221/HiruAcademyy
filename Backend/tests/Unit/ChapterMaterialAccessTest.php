<?php

namespace Tests\Unit;

use App\Http\Controllers\StudentLearningController;
use App\Models\Chapter;
use App\Models\Program;
use App\Models\User;
use App\Services\ChapterAccessPolicy;
use App\Services\EntitlementService;
use App\Services\LearningProgressService;
use Illuminate\Container\Container;
use Illuminate\Http\Request;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpKernel\Exception\HttpException;

final class ChapterMaterialAccessTest extends TestCase
{
    private Container $previousContainer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->previousContainer = Container::getInstance();
        Container::setInstance(new class extends Container
        {
            public function abort($code, $message = '', array $headers = []): never
            {
                throw new HttpException($code, $message, null, $headers);
            }
        });
    }

    protected function tearDown(): void
    {
        Container::setInstance($this->previousContainer);
        parent::tearDown();
    }

    public static function deniedCases(): array
    {
        return [
            'no entitlement' => ['active', 7, 'published', 2, 'none', 403],
            'preview cannot read later chapter' => ['active', 7, 'published', 2, 'preview', 403],
            'missing program entitlement' => ['active', 7, 'published', 1, null, 403],
            'invalid chapter number' => ['active', 7, 'published', 0, 'full', 403],
            'wrong program even with full access' => ['active', 8, 'published', 2, 'full', 404],
            'unpublished even with full access' => ['active', 7, 'draft', 2, 'full', 404],
            'draft program even with full access' => ['draft', 7, 'published', 2, 'full', 404],
        ];
    }

    #[DataProvider('deniedCases')]
    public function test_show_denies_before_loading_materials(
        string $programStatus,
        int $chapterProgramId,
        string $chapterStatus,
        int $chapterNumber,
        ?string $access,
        int $status,
    ): void {
        $user = new User;
        $request = Request::create('/api/student/programs/n5/chapters/11', 'GET');
        $request->setUserResolver(fn () => $user);
        $program = new Program;
        $program->setRawAttributes(['id' => 7, 'code' => 'n5', 'status' => $programStatus]);
        $chapter = $this->getMockBuilder(Chapter::class)->onlyMethods(['load', 'loadExists', 'refresh', 'modules'])->getMock();
        $chapter->setRawAttributes(['id' => 11, 'program_id' => $chapterProgramId, 'chapter_number' => $chapterNumber, 'status' => $chapterStatus]);
        $chapter->expects($this->never())->method('load');
        $chapter->expects($this->never())->method('loadExists');
        $chapter->expects($this->never())->method('refresh');
        $chapter->expects($this->never())->method('modules');
        $entitlements = $this->createMock(EntitlementService::class);
        if ($status === 403 && $chapterNumber > 0) {
            $entitlements->expects($this->once())->method('effectiveAccess')->with($user)
                ->willReturn(['learning' => $access === null ? [] : ['n5' => $access]]);
        } else {
            $entitlements->expects($this->never())->method('effectiveAccess');
        }

        try {
            (new StudentLearningController)->show($request, $program, $chapter, $entitlements, new ChapterAccessPolicy($entitlements));
            $this->fail('Protected chapter materials must not be returned.');
        } catch (HttpException $exception) {
            $this->assertSame($status, $exception->getStatusCode());
            $this->assertNull($chapter->getAttribute('access'));
        }
    }

    public static function authorizationCases(): array
    {
        return [
            'full later chapter allowed' => ['full', 2, true],
            'preview first chapter allowed' => ['preview', 1, true],
            'preview later chapter denied' => ['preview', 2, false],
            'no access denied' => ['none', 1, false],
        ];
    }

    #[DataProvider('authorizationCases')]
    public function test_progress_authorize_uses_real_policy_without_database(string $access, int $chapterNumber, bool $allowed): void
    {
        $user = new User;
        $program = $this->getMockBuilder(Program::class)->onlyMethods(['refresh'])->getMock();
        $program->setRawAttributes(['id' => 7, 'code' => 'n5', 'status' => 'active']);
        $program->expects($this->once())->method('refresh')->willReturnSelf();
        $chapter = $this->getMockBuilder(Chapter::class)->onlyMethods(['refresh', 'load', 'modules'])->getMock();
        $chapter->setRawAttributes(['id' => 11, 'program_id' => 7, 'chapter_number' => $chapterNumber, 'status' => 'published']);
        $chapter->expects($this->once())->method('refresh')->willReturnSelf();
        $chapter->expects($this->never())->method('load');
        $chapter->expects($this->never())->method('modules');
        $entitlements = $this->createMock(EntitlementService::class);
        $entitlements->expects($this->once())->method('effectiveAccess')->with($user)
            ->willReturn(['learning' => ['n5' => $access]]);

        try {
            (new LearningProgressService(new ChapterAccessPolicy($entitlements)))->authorize($user, $program, $chapter);
            $this->assertTrue($allowed, 'Unauthorized chapter must be denied.');
        } catch (HttpException $exception) {
            $this->assertFalse($allowed, 'Authorized chapter must be allowed.');
            $this->assertSame(403, $exception->getStatusCode());
        }
    }
}
