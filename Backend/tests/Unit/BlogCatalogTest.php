<?php

namespace Tests\Unit;

use App\Http\Controllers\PublicContentController;
use App\Models\BlogArticle;
use App\Models\BlogCategory;
use App\Services\BlogCatalogService;
use App\Services\MediaService;
use App\Services\PublicContentService;
use Illuminate\Container\Container;
use Illuminate\Contracts\Routing\ResponseFactory;
use Illuminate\Database\ConnectionResolver;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\PostgresConnection;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Facade;
use Illuminate\Support\Facades\Validator;
use Illuminate\Translation\ArrayLoader;
use Illuminate\Translation\Translator;
use Illuminate\Validation\Factory;
use Illuminate\Validation\ValidationException;
use Mockery;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpKernel\Exception\HttpException;

final class BlogCatalogTest extends TestCase
{
    private Container $previous;

    private $previousFacade;

    private $previousResolver;

    private PostgresConnection $connection;

    private BlogCatalogService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->previous = Container::getInstance();
        $this->previousFacade = Facade::getFacadeApplication();
        $this->previousResolver = Model::getConnectionResolver();
        $container = new class extends Container
        {
            public function abort($code, $message = '', array $headers = []): never
            {
                throw new HttpException($code, $message, null, $headers);
            }
        };
        Container::setInstance($container);
        Facade::clearResolvedInstances();
        Facade::setFacadeApplication($container);
        Validator::swap(new Factory(new Translator(new ArrayLoader, 'en'), $container));
        $media = Mockery::mock(MediaService::class);
        $media->shouldReceive('locked')->andReturnUsing(fn ($operation) => $operation());
        $media->shouldReceive('payload')->andReturnUsing(fn ($data) => $data);
        $container->instance(MediaService::class, $media);
        $this->connection = Mockery::mock(PostgresConnection::class)->makePartial();
        $this->connection->useDefaultQueryGrammar();
        $this->connection->useDefaultPostProcessor();
        $resolver = new ConnectionResolver(['test' => $this->connection]);
        $resolver->setDefaultConnection('test');
        Model::setConnectionResolver($resolver);
        $this->service = new BlogCatalogService;
    }

    protected function tearDown(): void
    {
        try {
            Mockery::close();
        } finally {
            if ($this->previousResolver) {
                Model::setConnectionResolver($this->previousResolver);
            } else {
                Model::unsetConnectionResolver();
            }
            Facade::clearResolvedInstances();
            Facade::setFacadeApplication($this->previousFacade);
            Container::setInstance($this->previous);
            parent::tearDown();
        }
    }

    public function test_empty_name_and_invalid_active_are_rejected_without_queries(): void
    {
        foreach ([['name' => '   '], ['name' => '<b>Name</b>'], ['name' => "Name\nOther"], ['name' => 'Valid', 'active' => 'yes'], ['active' => true], ['name' => 'Valid', 'extra' => true]] as $input) {
            try {
                $this->service->save('blog-categories', $input);
                $this->fail('Expected validation failure.');
            } catch (ValidationException $error) {
                $this->assertNotEmpty($error->errors());
            }
        }
    }

    public function test_normalized_duplicate_is_rejected(): void
    {
        $this->connection->shouldReceive('select')->once()->withArgs(function ($sql, $bindings) {
            return str_contains($sql, 'lower(trim(name))') && $bindings === ['JLPT'];
        })->andReturn([(object) ['exists' => true]]);
        $this->expectException(ValidationException::class);
        $this->service->save('blog-categories', ['name' => ' JLPT ']);
    }

    public function test_duplicate_race_is_mapped_to_validation(): void
    {
        $error = new \PDOException('duplicate');
        $error->errorInfo = ['23505', 7, 'duplicate'];
        $this->connection->shouldReceive('select')->once()->andThrow(new QueryException('test', 'insert', [], $error));
        $this->expectException(ValidationException::class);
        $this->service->save('blog-categories', ['name' => 'JLPT']);
    }

    public function test_article_selection_allows_active_or_unchanged_inactive_only(): void
    {
        foreach ([[true, false, 'New', true], [false, true, 'Existing', true], [false, false, 'Existing', false], [false, true, 'Other', false]] as [$active, $exists, $previous, $allowed]) {
            $this->connection->shouldReceive('select')->once()->withArgs(fn ($sql) => str_contains($sql, 'for update'))
                ->andReturn([(object) ['id' => 1, 'name' => 'Existing', 'active' => $active]]);
            $article = (new BlogArticle)->forceFill(['category' => $previous]);
            $article->exists = $exists;
            $failed = false;
            ($this->service->articleRule('category', $article))('category', 'Existing', function () use (&$failed) {
                $failed = true;
            });
            $this->assertSame(! $allowed, $failed);
        }
    }

    public function test_missing_catalog_selection_is_rejected(): void
    {
        $this->connection->shouldReceive('select')->once()->andReturn([]);
        $failed = false;
        ($this->service->articleRule('author', null))('author', 'Unknown', function () use (&$failed) {
            $failed = true;
        });
        $this->assertTrue($failed);
    }

    public function test_in_use_delete_returns_conflict_without_mutation(): void
    {
        $this->connection->shouldReceive('select')->once()->andReturn([(object) ['id' => 1, 'name' => 'JLPT', 'active' => true]]);
        $this->connection->shouldReceive('select')->once()->andReturn([(object) ['exists' => true]]);
        try {
            $this->service->delete('blog-categories', '1');
            $this->fail('Expected conflict.');
        } catch (HttpException $error) {
            $this->assertSame(409, $error->getStatusCode());
        }
    }

    public function test_rename_runs_inside_lock_and_database_update_targets_catalog_only(): void
    {
        $this->connection->shouldReceive('select')->once()->andReturn([(object) ['id' => 1, 'name' => 'Old', 'active' => true]]);
        $this->connection->shouldReceive('select')->once()->andReturn([(object) ['exists' => false]]);
        $this->connection->shouldReceive('update')->once()->withArgs(fn ($sql, $bindings) => str_contains($sql, 'update "blog_categories"') && in_array('New', $bindings, true))->andReturn(1);
        $this->connection->shouldReceive('select')->once()->andReturn([(object) ['id' => 1, 'name' => 'New', 'active' => true]]);
        $this->assertSame('New', $this->service->save('blog-categories', ['name' => 'New'], '1')->name);
    }

    public function test_payloads_keep_catalog_and_public_article_contracts(): void
    {
        $category = (new BlogCategory)->forceFill(['id' => 1, 'name' => 'JLPT', 'active' => false]);
        $this->assertSame(['id' => 1, 'name' => 'JLPT', 'active' => false], $this->service->payload($category));
        $article = (new BlogArticle)->forceFill(['id' => 2, 'category' => 'Renamed', 'author' => 'Contributor', 'published' => true]);
        $payload = (new PublicContentService)->payload($article, true);
        $this->assertSame('Renamed', $payload['category']);
        $this->assertSame('Contributor', $payload['author']);
        $this->assertArrayNotHasKey('published', $payload);
        $this->assertArrayNotHasKey('category_id', $payload);
    }

    public function test_public_blog_accepts_dynamic_and_unknown_category_filters(): void
    {
        $responses = Mockery::mock(ResponseFactory::class);
        $responses->shouldReceive('json')->twice()->andReturnUsing(fn ($data) => new JsonResponse($data));
        Container::getInstance()->instance(ResponseFactory::class, $responses);
        $content = Mockery::mock(PublicContentService::class);
        foreach (['Dynamic category outside legacy list', 'Unknown or inactive category'] as $category) {
            $request = Mockery::mock(Request::class)->makePartial();
            $request->shouldReceive('validate')->once()->andReturnUsing(function ($rules) use ($category) {
                $this->assertSame(['sometimes', 'required', 'string', 'max:255'], $rules['category']);

                return Validator::make(['category' => $category], $rules)->validate();
            });
            $query = Mockery::mock(Builder::class);
            $content->shouldReceive('articles')->once()->andReturn($query);
            $query->shouldReceive('where')->once()->with('category', $category)->andReturnSelf();
            $query->shouldReceive('get')->once()->andReturn(new Collection);
            $response = (new PublicContentController($content))->blog($request);
            $this->assertSame(200, $response->getStatusCode());
            $this->assertSame(['data' => []], $response->getData(true));
        }
    }

    public function test_catalog_routes_are_registered_inside_existing_admin_middleware_group(): void
    {
        $routes = file_get_contents(__DIR__.'/../../routes/web.php');
        $start = strpos($routes, "Route::middleware(['auth:sanctum', 'active', 'role:admin'])->prefix('admin')->group(function () {");
        $catalog = strpos($routes, 'foreach (array_keys(BlogCatalogService::RESOURCES) as $resource)');
        $student = strpos($routes, "Route::middleware(['auth:sanctum', 'active', 'role:student'])");
        $this->assertIsInt($start);
        $this->assertIsInt($catalog);
        $this->assertIsInt($student);
        $this->assertTrue($start < $catalog && $catalog < $student);
        foreach (['get' => 'index', 'post' => 'store', 'patch' => 'update', 'delete' => 'destroy'] as $verb => $action) {
            $this->assertMatchesRegularExpression("/Route::{$verb}\\([^\\n]+AdminBlogCatalogController::class, '{$action}'/", $routes);
        }
    }

    public function test_migration_has_cascade_restrict_and_non_destructive_rollback(): void
    {
        $path = __DIR__.'/../../database/migrations/2026_10_27_000001_create_blog_catalogs.php';
        $source = file_get_contents($path);
        $this->assertStringContainsString('cascadeOnUpdate()->restrictOnDelete()', $source);
        $this->assertStringContainsString('pg_constraint', $source);
        $this->assertStringContainsString('lower(trim(name))', $source);
        $migration = require $path;
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('rollback blocked before changes');
        $migration->down();
    }
}
