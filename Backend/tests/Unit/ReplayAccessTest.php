<?php

namespace Tests\Unit;

use App\Http\Controllers\StudentScheduleReplayController;
use App\Models\Program;
use App\Models\ReplayVideo;
use App\Models\User;
use App\Services\EntitlementService;
use App\Services\MediaService;
use App\Services\ScheduleReplayService;
use Illuminate\Container\Container;
use Illuminate\Contracts\Routing\ResponseFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Routing\Route;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Fluent;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\PreserveGlobalState;
use PHPUnit\Framework\Attributes\RunTestsInSeparateProcesses;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpKernel\Exception\HttpException;

#[RunTestsInSeparateProcesses]
#[PreserveGlobalState(false)]
final class ReplayAccessTest extends TestCase
{
    private Container $previousContainer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->previousContainer = Container::getInstance();
        $container = new class extends Container
        {
            public function abort($code, $message = '', array $headers = []): never
            {
                throw new HttpException($code, $message, null, $headers);
            }
        };
        Container::setInstance($container);
        $responses = Mockery::mock(ResponseFactory::class);
        $responses->shouldReceive('json')->andReturnUsing(fn ($data) => new JsonResponse($data));
        $container->instance(ResponseFactory::class, $responses);
    }

    protected function tearDown(): void
    {
        try {
            Mockery::close();
        } finally {
            Container::setInstance($this->previousContainer);
            parent::tearDown();
        }
    }

    public static function listingCases(): array
    {
        return [
            'sensei levels' => [['n5', 'n4']],
            'free or lms without replay' => [[]],
        ];
    }

    #[DataProvider('listingCases')]
    public function test_listing_constrains_publication_and_effective_levels(array $levels): void
    {
        [$request, $entitlements] = $this->requestAndAccess($levels);
        $query = $this->playlistQuery();
        $query->shouldReceive('with')->once()->with('program')->andReturnSelf();
        $query->shouldReceive('whereHas')->once()->with('program', Mockery::on(function ($callback) use ($levels) {
            $programs = Mockery::mock();
            $programs->shouldReceive('whereIn')->once()->with('code', $levels)->andReturnSelf();
            $callback($programs);

            return true;
        }))->andReturnSelf();
        $query->shouldReceive('orderBy')->once()->with('sort_order')->andReturnSelf();
        $query->shouldReceive('orderBy')->once()->with('id')->andReturnSelf();
        $playlist = new class extends Model {};
        $playlist->setRawAttributes(['id' => 7]);
        $query->shouldReceive('get')->once()->andReturn(collect($levels === [] ? [] : [$playlist]));
        $content = Mockery::mock(ScheduleReplayService::class);
        if ($levels === []) {
            $content->shouldNotReceive('payload');
        } else {
            $content->shouldReceive('payload')->once()->with($playlist)->andReturn(['id' => 7]);
        }

        $result = (new StudentScheduleReplayController($entitlements, $content))->replays($request);

        $this->assertSame(['data' => $levels === [] ? [] : [['id' => 7]]], $result->getData(true));
    }

    public static function detailCases(): array
    {
        return [
            'allowed own level' => [['n5'], 'n5', true],
            'allowed lower level' => [['n5', 'n4'], 'n5', true],
            'no replay entitlement' => [[], 'n5', false],
            'incorrect level' => [['n5'], 'n4', false],
            'strict level comparison' => [['N5'], 'n5', false],
        ];
    }

    #[DataProvider('detailCases')]
    public function test_detail_checks_access_before_payload_or_video_query(array $levels, string $code, bool $allowed): void
    {
        [$request, $entitlements] = $this->requestAndAccess($levels);
        $playlist = Mockery::mock(Model::class)->makePartial();
        $playlist->setRawAttributes(['id' => 7]);
        $playlist->setRelation('program', new Fluent(['code' => $code]));
        $this->playlistQuery()->shouldReceive('findOrFail')->once()->with('7')->andReturn($playlist);
        $content = Mockery::mock(ScheduleReplayService::class);
        if (! $allowed) {
            $playlist->shouldNotReceive('videos');
            $content->shouldNotReceive('payload');
            $this->expectException(HttpException::class);
            $this->expectExceptionCode(0);
            try {
                (new StudentScheduleReplayController($entitlements, $content))->playlist($request);
            } catch (HttpException $exception) {
                $this->assertSame(403, $exception->getStatusCode());
                throw $exception;
            }

            return;
        }
        $videos = Mockery::mock();
        $playlist->shouldReceive('videos')->once()->andReturn($videos);
        $videos->shouldReceive('where')->once()->with('status', 'published')->andReturnSelf();
        $videos->shouldReceive('orderBy')->once()->with('sort_order')->andReturnSelf();
        $videos->shouldReceive('orderBy')->once()->with('id')->andReturnSelf();
        $video = new ReplayVideo;
        $video->setRawAttributes(['id' => 11, 'video_url' => null]);
        $videos->shouldReceive('get')->once()->andReturn(collect([$video]));
        $content->shouldReceive('payload')->once()->with($playlist)->andReturn(['id' => 7]);
        $content->shouldReceive('payload')->once()->with($video)->andReturn(['id' => 11, 'video_url_resolved_url' => null]);

        $result = (new StudentScheduleReplayController($entitlements, $content))->playlist($request);

        $this->assertSame(['data' => ['id' => 7, 'videos' => [['id' => 11, 'video_url_resolved_url' => null]]]], $result->getData(true));
    }

    public function test_unpublished_or_missing_playlist_stops_before_access_or_payload(): void
    {
        [$request, $entitlements] = $this->requestAndAccess([], false);
        $this->playlistQuery()->shouldReceive('findOrFail')->once()->with('7')
            ->andThrow(new ModelNotFoundException);
        $content = Mockery::mock(ScheduleReplayService::class);
        $content->shouldNotReceive('payload');
        $this->expectException(ModelNotFoundException::class);

        (new StudentScheduleReplayController($entitlements, $content))->playlist($request);
    }

    public static function videoReferences(): array
    {
        return [
            'missing video field' => [[], null],
            'null video' => [['video_url' => null], null],
            'empty video' => [['video_url' => ''], null],
            'managed video' => [['video_url' => 'media/replays/lesson.mp4'], 'https://cdn.example.test/signed-lesson.mp4'],
        ];
    }

    #[DataProvider('videoReferences')]
    public function test_real_payload_resolves_video_reference_and_preserves_missing_data(array $attributes, ?string $resolved): void
    {
        $video = new ReplayVideo;
        $video->setRawAttributes(['id' => 11, ...$attributes]);
        $media = Mockery::mock(MediaService::class)->makePartial();
        // Exercise real recursive payload mapping; storage URL generation stays outside this proof.
        $media->shouldReceive('url')->once()->with($attributes['video_url'] ?? null)->andReturn($resolved);
        app()->instance(MediaService::class, $media);

        $payload = (new ScheduleReplayService)->payload($video);

        $this->assertSame($attributes['video_url'] ?? null, $payload['video_url']);
        $this->assertSame($resolved, $payload['video_url_resolved_url']);
    }

    public function test_real_playlist_payload_exposes_only_program_summary(): void
    {
        $playlist = new \App\Models\ReplayPlaylist;
        $playlist->setRawAttributes(['id' => 7, 'status' => 'published']);
        $program = new Program;
        $program->setRawAttributes(['id' => 3, 'code' => 'n5', 'name' => 'JLPT N5', 'description' => 'Not in summary']);
        $playlist->setRelation('program', $program);
        app()->instance(MediaService::class, new MediaService);

        $payload = (new ScheduleReplayService)->payload($playlist);

        $this->assertSame(['id' => 3, 'code' => 'n5', 'name' => 'JLPT N5'], $payload['program']);
    }

    private function playlistQuery(): mixed
    {
        // Alias only static query entry point; no application or DB connection boots.
        $query = Mockery::mock();
        $query->shouldReceive('where')->once()->with('status', 'published')->andReturnSelf();
        Mockery::mock('alias:App\\Models\\ReplayPlaylist')->shouldReceive('query')->once()->andReturn($query);

        return $query;
    }

    private function requestAndAccess(array $levels, bool $called = true): array
    {
        $user = new User;
        $request = Request::create('/api/student/replay-playlists/7', 'GET');
        $request->setUserResolver(fn () => $user);
        $route = new Route('GET', 'api/student/replay-playlists/{playlist}', fn () => null);
        $route->bind($request);
        $request->setRouteResolver(fn () => $route);
        $entitlements = Mockery::mock(EntitlementService::class);
        if ($called) {
            $entitlements->shouldReceive('effectiveAccess')->once()->with($user)->andReturn(['replay_levels' => $levels]);
        } else {
            $entitlements->shouldNotReceive('effectiveAccess');
        }

        return [$request, $entitlements];
    }
}
