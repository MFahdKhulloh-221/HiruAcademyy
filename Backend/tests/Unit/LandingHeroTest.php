<?php

namespace Tests\Unit;

use App\Http\Controllers\LandingHeroController;
use App\Services\LandingHeroService;
use Illuminate\Container\Container;
use Illuminate\Contracts\Routing\ResponseFactory;
use Illuminate\Database\DatabaseManager;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Facade;
use Illuminate\Support\Facades\Validator;
use Illuminate\Translation\ArrayLoader;
use Illuminate\Translation\Translator;
use Illuminate\Validation\Factory;
use Illuminate\Validation\ValidationException;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

final class LandingHeroTest extends TestCase
{
    private Container $previousContainer;

    private $previousFacadeApplication;

    private LandingHeroService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->previousContainer = Container::getInstance();
        $this->previousFacadeApplication = Facade::getFacadeApplication();
        $container = new Container;
        Container::setInstance($container);
        Facade::clearResolvedInstances();
        Facade::setFacadeApplication($container);
        Validator::swap(new Factory(new Translator(new ArrayLoader, 'en'), $container));
        DB::swap(Mockery::mock(DatabaseManager::class));
        $responses = Mockery::mock(ResponseFactory::class);
        $responses->shouldReceive('json')->andReturnUsing(fn ($data) => new JsonResponse($data));
        $container->instance(ResponseFactory::class, $responses);
        $this->service = new LandingHeroService;
    }

    protected function tearDown(): void
    {
        try {
            Mockery::close();
        } finally {
            Facade::clearResolvedInstances();
            Facade::setFacadeApplication($this->previousFacadeApplication);
            Container::setInstance($this->previousContainer);
            parent::tearDown();
        }
    }

    private static function hero(string $heading = 'Belajar Bahasa Jepang'): array
    {
        return [
            'eyebrow' => 'LIVE CLASS + LMS', 'heading' => $heading, 'support' => 'Dari dasar sampai siap JLPT.',
            'primaryCtaLabel' => 'Coba Gratis', 'secondaryCtaLabel' => 'Lihat Program',
            'primaryCtaPath' => '/register', 'secondaryCtaPath' => '#program',
        ];
    }

    private function query(?string $previous): Builder
    {
        $query = Mockery::mock(Builder::class);
        DB::shouldReceive('table')->with('admin_settings')->andReturn($query);
        $query->shouldReceive('where')->with('section', 'landing_hero')->andReturnSelf();
        $query->shouldReceive('value')->with('value')->once()->andReturn($previous);

        return $query;
    }

    public function test_missing_row_returns_null_default_without_writing(): void
    {
        $this->query(null);
        $this->assertSame(['draft' => null, 'published' => null, 'revision' => 0], $this->service->snapshot());
    }

    public function test_initial_draft_uses_unique_insert_and_does_not_publish(): void
    {
        $this->query(null)->shouldReceive('insertOrIgnore')->once()->with(Mockery::on(function ($values) {
            $this->assertSame('landing_hero', $values['section']);
            $this->assertSame(['draft' => self::hero(), 'published' => null, 'revision' => 1], json_decode($values['value'], true));
            $this->assertArrayHasKey('created_at', $values);

            return true;
        }))->andReturn(1);
        $this->assertSame(['draft' => self::hero(), 'published' => null, 'revision' => 1], $this->service->saveDraft(['revision' => 0, 'hero' => self::hero()]));
    }

    public function test_draft_update_preserves_published_snapshot_and_compares_full_previous_json(): void
    {
        $old = ['draft' => self::hero(), 'published' => self::hero(), 'revision' => 4];
        $previous = json_encode($old);
        $next = ['draft' => self::hero('Heading baru'), 'published' => $old['published'], 'revision' => 5];
        $query = $this->query($previous);
        $query->shouldReceive('where')->once()->with('value', $previous)->andReturnSelf();
        $query->shouldReceive('update')->once()->with(Mockery::on(fn ($values) => json_decode($values['value'], true) === $next))->andReturn(1);
        $this->assertSame($next, $this->service->saveDraft(['revision' => 4, 'hero' => self::hero('Heading baru')]));
    }

    public function test_publish_copies_draft_and_increments_revision(): void
    {
        $old = ['draft' => self::hero('Draft baru'), 'published' => self::hero(), 'revision' => 2];
        $next = ['draft' => $old['draft'], 'published' => $old['draft'], 'revision' => 3];
        $previous = json_encode($old);
        $query = $this->query($previous);
        $query->shouldReceive('where')->once()->with('value', $previous)->andReturnSelf();
        $query->shouldReceive('update')->once()->with(Mockery::on(fn ($values) => json_decode($values['value'], true) === $next))->andReturn(1);
        $this->assertSame($next, $this->service->publish(['revision' => 2]));
    }

    public static function mutations(): array
    {
        return ['draft' => ['saveDraft'], 'publish' => ['publish']];
    }

    #[DataProvider('mutations')]
    public function test_stale_expected_revision_rejects_both_mutations(string $method): void
    {
        $this->query(json_encode(['draft' => self::hero(), 'published' => null, 'revision' => 3]));
        $this->expectException(ConflictHttpException::class);
        $this->service->$method(['revision' => 2, 'hero' => self::hero()]);
    }

    #[DataProvider('mutations')]
    public function test_failed_cas_rejects_both_mutations(string $method): void
    {
        $previous = json_encode(['draft' => self::hero(), 'published' => null, 'revision' => 3]);
        $query = $this->query($previous);
        $query->shouldReceive('where')->once()->with('value', $previous)->andReturnSelf();
        // Simulate another writer winning between read and conditional update.
        $query->shouldReceive('update')->once()->andReturn(0);
        $this->expectException(ConflictHttpException::class);
        $this->service->$method(['revision' => 3, 'hero' => self::hero()]);
    }

    public function test_initial_row_race_returns_conflict_without_overwriting_winner(): void
    {
        $this->query(null)->shouldReceive('insertOrIgnore')->once()->andReturn(0);
        $this->expectException(ConflictHttpException::class);
        $this->service->saveDraft(['revision' => 0, 'hero' => self::hero()]);
    }

    public function test_publish_requires_expected_revision_before_database_access(): void
    {
        DB::shouldReceive('table')->never();
        $this->expectException(ValidationException::class);
        $this->service->publish([]);
    }

    public function test_other_settings_sections_are_never_selected_or_updated(): void
    {
        $query = $this->query(null);
        $query->shouldReceive('insertOrIgnore')->once()->with(Mockery::on(fn ($values) => $values['section'] === 'landing_hero'))->andReturn(1);
        $query->shouldNotReceive('update');
        $query->shouldNotReceive('upsert');
        $this->assertSame(1, $this->service->saveDraft(['revision' => 0, 'hero' => self::hero()])['revision']);
    }

    public function test_publish_storage_failure_propagates_without_fallback_write(): void
    {
        $previous = json_encode(['draft' => self::hero('Draft baru'), 'published' => self::hero('Published lama'), 'revision' => 2]);
        $query = $this->query($previous);
        $query->shouldReceive('where')->once()->with('value', $previous)->andReturnSelf();
        $query->shouldReceive('update')->once()->andThrow(new \RuntimeException('Storage unavailable'));
        $query->shouldNotReceive('insertOrIgnore');
        $this->expectExceptionMessage('Storage unavailable');
        $this->service->publish(['revision' => 2]);
    }

    public function test_publish_without_draft_is_validation_error(): void
    {
        $this->query(null);
        $this->expectException(ValidationException::class);
        $this->service->publish(['revision' => 0]);
    }

    public function test_publish_revalidates_stored_draft_before_write(): void
    {
        $this->query(json_encode(['draft' => self::hero('<script>alert(1)</script>'), 'published' => null, 'revision' => 1]));
        $this->expectException(ValidationException::class);
        $this->service->publish(['revision' => 1]);
    }

    public static function invalidInputs(): array
    {
        $cases = [
            'no revision' => [['hero' => self::hero()]],
            'negative revision' => [['revision' => -1, 'hero' => self::hero()]],
            'fraction revision' => [['revision' => 0.5, 'hero' => self::hero()]],
            'revision overflow' => [['revision' => 2147483647, 'hero' => self::hero()]],
            'no hero' => [['revision' => 0]],
            'unknown field' => [['revision' => 0, 'hero' => [...self::hero(), 'subheadline' => 'extra']]],
        ];
        foreach (['eyebrow', 'heading', 'support', 'primaryCtaLabel', 'secondaryCtaLabel'] as $field) {
            foreach (['', '   ', '<b>text</b>', '&lt;b&gt;text&lt;/b&gt;', "bad\0text", str_repeat('x', 1001)] as $index => $value) {
                $cases[$field.' invalid '.$index] = [['revision' => 0, 'hero' => [...self::hero(), $field => $value]]];
            }
            $hero = self::hero();
            unset($hero[$field]);
            $cases[$field.' missing'] = [['revision' => 0, 'hero' => $hero]];
        }
        foreach (['primaryCtaPath', 'secondaryCtaPath'] as $field) {
            foreach (['https://evil.test', '//evil.test', '/a//b', '/\\evil.test', ' /register', "/register\n", '/%2f%2fevil.test', '/%252f%252fevil.test', '/a/../admin', '/a?redirect=https://evil.test', 'javascript:alert(1)', '#', '/a#bad anchor', str_repeat('/a', 129)] as $index => $path) {
                $cases[$field.' invalid '.$index] = [['revision' => 0, 'hero' => [...self::hero(), $field => $path]]];
            }
        }

        return $cases;
    }

    #[DataProvider('invalidInputs')]
    public function test_invalid_draft_never_reads_or_writes_database(array $input): void
    {
        DB::shouldReceive('table')->never();
        $this->expectException(ValidationException::class);
        $this->service->saveDraft($input);
    }

    public static function validPaths(): array
    {
        return array_map(fn ($path) => [$path], ['/', '/program', '/program/n5', '/program/', '#program', '/program#pricing']);
    }

    #[DataProvider('validPaths')]
    public function test_canonical_internal_paths_and_anchors_are_accepted(string $path): void
    {
        $hero = [...self::hero(), 'primaryCtaPath' => $path];
        $this->query(null)->shouldReceive('insertOrIgnore')->once()->andReturn(1);
        $this->assertSame($path, $this->service->saveDraft(['revision' => 0, 'hero' => $hero])['draft']['primaryCtaPath']);
    }

    public static function deniedRequests(): array
    {
        $cases = [];
        foreach (['show', 'draft', 'publish'] as $method) {
            foreach ([null, 'student'] as $role) {
                $cases[$method.' '.($role ?? 'guest')] = [$method, $role];
            }
        }

        return $cases;
    }

    #[DataProvider('deniedRequests')]
    public function test_non_admin_is_denied_before_service_access(string $method, ?string $role): void
    {
        $request = Request::create('/');
        $request->setUserResolver(fn () => $role === null ? null : (object) ['role' => $role]);
        DB::shouldReceive('table')->never();
        $this->expectException(AccessDeniedHttpException::class);
        (new LandingHeroController($this->service))->$method($request);
    }

    public function test_admin_get_response_wraps_snapshot(): void
    {
        $this->query(null);
        $request = Request::create('/');
        $request->setUserResolver(fn () => (object) ['role' => 'admin']);
        $response = (new LandingHeroController($this->service))->show($request);
        $this->assertSame(['data' => ['draft' => null, 'published' => null, 'revision' => 0]], $response->getData(true));
    }

    public static function publicationStates(): array
    {
        return ['unpublished' => [null], 'published' => [self::hero()]];
    }

    #[DataProvider('publicationStates')]
    public function test_public_response_contains_only_published_hero(?array $published): void
    {
        $this->query(json_encode(['draft' => self::hero('SECRET DRAFT'), 'published' => $published, 'revision' => 7]));
        $response = (new LandingHeroController($this->service))->publicShow();
        $this->assertSame(['data' => $published], $response->getData(true));
        $this->assertTrue($response->headers->hasCacheControlDirective('no-store'));
    }

    public function test_routes_keep_admin_middleware_and_public_route_separate(): void
    {
        $routes = file_get_contents(__DIR__.'/../../routes/web.php');
        $this->assertStringContainsString("Route::middleware(['auth:sanctum', 'active', 'role:admin'])->prefix('admin')", $routes);
        foreach (["get('landing/hero'", "patch('landing/hero/draft'", "post('landing/hero/publish'", "get('public/landing/hero'"] as $route) {
            $this->assertStringContainsString($route, $routes);
        }
    }
}
