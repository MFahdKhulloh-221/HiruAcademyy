<?php

namespace Tests\Unit;

use App\Models\Chapter;
use App\Models\LearningAttempt;
use App\Models\Program;
use App\Models\User;
use App\Services\ChapterAccessPolicy;
use App\Services\EntitlementService;
use App\Services\GamificationService;
use App\Services\LearningAttemptService;
use App\Services\LearningProgressService;
use Illuminate\Container\Container;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Facade;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpKernel\Exception\HttpException;

final class MiniAccessTest extends TestCase
{
    private Container $previousContainer;

    private $previousFacadeApplication;

    private $previousDb;

    protected function setUp(): void
    {
        parent::setUp();
        $this->previousContainer = Container::getInstance();
        $this->previousFacadeApplication = Facade::getFacadeApplication();
        $this->previousDb = $this->previousFacadeApplication ? DB::getFacadeRoot() : null;
        $container = new class extends Container
        {
            public function abort($code, $message = '', array $headers = []): never
            {
                throw new HttpException($code, $message, null, $headers);
            }
        };
        Container::setInstance($container);
        Facade::clearResolvedInstance('db');
        Facade::setFacadeApplication($container);
    }

    protected function tearDown(): void
    {
        try {
            Mockery::close();
        } finally {
            Facade::clearResolvedInstance('db');
            Facade::setFacadeApplication($this->previousFacadeApplication);
            if ($this->previousDb !== null) {
                DB::swap($this->previousDb);
            }
            Container::setInstance($this->previousContainer);
            parent::tearDown();
        }
    }

    public static function eligibilityCases(): array
    {
        return [
            'sensei n5' => ['jlpt', 'n5', ['n5'], true],
            'sensei n4' => ['jlpt', 'n4', ['n5', 'n4'], true],
            'sensei n3' => ['jlpt', 'n3', ['n5', 'n4', 'n3'], true],
            'sensei n2' => ['jlpt', 'n2', ['n5', 'n4', 'n3', 'n2'], true],
            'no grants' => ['jlpt', 'n5', [], false],
            'other replay level only' => ['jlpt', 'n3', ['n5', 'n4'], false],
            'n1 excluded even with replay' => ['jlpt', 'n1', ['n1'], false],
            'foundation excluded' => ['foundation', 'n5', ['n5'], false],
            'ssw excluded' => ['ssw', 'ssw-food', ['ssw-food'], false],
            'interview excluded' => ['interview', 'interview', ['interview'], false],
            'unknown jlpt level excluded' => ['jlpt', 'n6', ['n6'], false],
            'level comparison is strict' => ['jlpt', 'n5', ['N5'], false],
        ];
    }

    #[DataProvider('eligibilityCases')]
    public function test_real_mini_eligibility_uses_effective_replay_levels(string $family, string $code, array $replayLevels, bool $expected): void
    {
        $user = $this->user();
        $program = new Program(['family' => $family, 'code' => $code]);
        $entitlements = Mockery::mock(EntitlementService::class);
        if ($family === 'jlpt' && in_array($code, ['n5', 'n4', 'n3', 'n2'], true)) {
            $entitlements->shouldReceive('effectiveAccess')->once()->with($user)->andReturn([
                'learning' => [$code => 'full'],
                'replay_levels' => $replayLevels,
                'source_grants' => [],
            ]);
        } else {
            $entitlements->shouldNotReceive('effectiveAccess');
        }
        app()->instance(EntitlementService::class, $entitlements);

        $this->assertSame($expected, $this->progress()->miniEligible($user, $program));
    }

    public static function unlockCases(): array
    {
        $resources = ['video' => [11], 'module' => [12, 16, 17], 'flashcard' => [13], 'audio' => [14], 'reading' => [15]];

        return [
            'all prerequisites complete' => [$resources, $resources, true, true, true],
            'grammar module incomplete' => [$resources, array_replace($resources, ['module' => [12, 17]]), true, true, false],
            'general module incomplete' => [$resources, array_replace($resources, ['module' => [16, 17]]), true, true, false],
            'kanji module incomplete' => [$resources, array_replace($resources, ['module' => [12, 16]]), true, true, false],
            'grammar only chapter complete' => [array_replace($resources, ['module' => [16]]), array_replace($resources, ['module' => [16]]), true, true, true],
            'general and grammar complete' => [array_replace($resources, ['module' => [12, 16]]), array_replace($resources, ['module' => [12, 16]]), true, true, true],
            'no modules stays locked' => [array_replace($resources, ['module' => []]), $resources, true, true, false],
            'completion missing' => [$resources, array_replace($resources, ['audio' => []]), true, true, false],
            'unrelated completion does not count' => [$resources, array_replace($resources, ['audio' => [99]]), true, true, false],
            'reading passage lacks questions' => [$resources, $resources, false, true, false],
            'no published resources' => [[], [], true, true, false],
            'missing completion data' => [$resources, [], true, true, false],
            'complete but not eligible' => [$resources, $resources, true, false, false],
            'missing required activities stay locked' => [['video' => [11]], ['video' => [11]], true, true, false],
        ];
    }

    #[DataProvider('unlockCases')]
    public function test_real_assemble_requires_eligibility_and_nonempty_complete_prerequisites(array $resources, array $completions, bool $readingReady, bool $eligible, bool $expected): void
    {
        $result = $this->progress()->assemble(new Program(['family' => 'jlpt', 'code' => 'n5']), $this->chapter(), $resources, $completions, $readingReady, $eligible);

        $this->assertSame(7, $result['chapter_id']);
        $this->assertSame($eligible, $result['mini_eligible']);
        $this->assertSame($expected, $result['mini_unlocked']);
        $this->assertCount(5, $result['activities']);
    }

    public function test_assemble_defaults_to_ineligible_even_with_complete_prerequisites(): void
    {
        $result = $this->progress()->assemble(new Program(['family' => 'jlpt']), $this->chapter(), ['video' => [11]], ['video' => [11]], true);

        $this->assertFalse($result['mini_eligible']);
        $this->assertFalse($result['mini_unlocked']);
    }

    public static function authorizationCases(): array
    {
        return [
            'eligible owner' => [3, 7, true, null],
            'ineligible owner' => [3, 7, false, 403],
            'wrong user' => [4, 7, true, 404],
            'wrong chapter' => [3, 8, true, 404],
        ];
    }

    #[DataProvider('authorizationCases')]
    public function test_real_attempt_authorize_checks_ownership_before_progress_and_eligibility(int $owner, int $chapterId, bool $eligible, ?int $status): void
    {
        $user = $this->user();
        $program = new Program(['family' => 'jlpt', 'code' => 'n5']);
        $chapter = $this->chapter();
        $attempt = new LearningAttempt;
        $attempt->setRawAttributes(['user_id' => $owner, 'chapter_id' => $chapterId, 'kind' => 'mini']);
        $progress = Mockery::mock(LearningProgressService::class);
        if ($status === 404) {
            $progress->shouldNotReceive('authorize', 'miniEligible');
        } else {
            $progress->shouldReceive('authorize')->once()->with($user, $program, $chapter)->ordered();
            $progress->shouldReceive('miniEligible')->once()->with($user, $program)->ordered()->andReturn($eligible);
        }

        try {
            (new LearningAttemptService($progress))->authorize($user, $program, $chapter, $attempt);
            $this->assertNull($status, 'Expected authorization to fail.');
        } catch (HttpException $exception) {
            $this->assertSame($status, $exception->getStatusCode());
        }
    }

    public function test_start_denies_locked_mini_before_question_query_or_attempt_creation(): void
    {
        $user = $this->user();
        $program = new Program(['family' => 'jlpt', 'code' => 'n5']);
        $chapter = Mockery::mock(Chapter::class)->makePartial();
        $chapter->setRawAttributes(['id' => 7]);
        $query = Mockery::mock(Builder::class);
        $chapter->shouldReceive('newQuery')->once()->andReturn($query);
        $query->shouldReceive('whereKey')->once()->with(7)->andReturnSelf();
        $query->shouldReceive('lockForUpdate')->once()->andReturnSelf();
        $query->shouldReceive('firstOrFail')->once()->andReturn($chapter);
        $chapter->shouldNotReceive('miniCheckpointQuestions');
        $gamification = Mockery::mock(GamificationService::class);
        $gamification->shouldReceive('lock')->once()->with($user);
        app()->instance(GamificationService::class, $gamification);
        $database = Mockery::mock();
        $database->shouldReceive('transaction')->once()->andReturnUsing(fn ($callback) => $callback());
        DB::swap($database);
        $progress = Mockery::mock(LearningProgressService::class);
        $progress->shouldReceive('authorize')->once()->with($user, $program, $chapter)->ordered();
        $progress->shouldReceive('progress')->once()->with($user, $program, $chapter)->ordered()->andReturn(['mini_unlocked' => false]);

        // No Eloquent connection resolver: reaching attempt creation would fail, not return 403.
        $this->expectException(HttpException::class);
        $this->expectExceptionCode(0);
        try {
            (new LearningAttemptService($progress))->start($user, $program, $chapter, 'mini', 1, 1);
        } catch (HttpException $exception) {
            $this->assertSame(403, $exception->getStatusCode());
            throw $exception;
        }
    }

    public function test_progress_denies_foreign_program_or_inaccessible_chapter_before_loading_resources(): void
    {
        foreach (['foreign_program', 'chapter_denied', 'program_denied'] as $case) {
            $program = Mockery::mock(Program::class)->makePartial();
            $program->setRawAttributes(['id' => 1, 'code' => 'n5']);
            $program->shouldReceive('refresh')->once()->andReturnSelf();
            $chapter = Mockery::mock(Chapter::class)->makePartial();
            $chapter->setRawAttributes(['id' => 7, 'program_id' => $case === 'foreign_program' ? 2 : 1, 'chapter_number' => 1, 'status' => 'published']);
            $chapter->shouldReceive('refresh')->once()->andReturnSelf();
            $chapter->shouldNotReceive('videoLessons', 'modules', 'miniCheckpointQuestions');
            $policy = Mockery::mock(ChapterAccessPolicy::class);
            $policy->shouldReceive('canAccessProgram')->once()->andReturn($case !== 'program_denied');
            if ($case === 'chapter_denied') {
                $policy->shouldReceive('canAccessChapter')->once()->andReturn(false);
            } else {
                $policy->shouldNotReceive('canAccessChapter');
            }
            try {
                (new LearningProgressService($policy))->progress($this->user(), $program, $chapter);
                $this->fail('Unauthorized progress must fail before loading resources.');
            } catch (HttpException $error) {
                $this->assertSame($case === 'chapter_denied' ? 403 : 404, $error->getStatusCode());
            }
        }
    }

    private function progress(): LearningProgressService
    {
        return new LearningProgressService(Mockery::mock(ChapterAccessPolicy::class));
    }

    private function user(): User
    {
        $user = new User;
        $user->setRawAttributes(['id' => 3, 'role' => 'student']);

        return $user;
    }

    private function chapter(): Chapter
    {
        $chapter = new Chapter;
        $chapter->setRawAttributes(['id' => 7]);

        return $chapter;
    }
}
