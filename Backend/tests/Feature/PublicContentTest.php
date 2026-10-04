<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\PublicContentService;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class PublicContentTest extends TestCase
{
    use DatabaseTransactions;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('pgsql', DB::connection()->getDriverName());
        $this->assertSame('hiru_academy_test', DB::connection()->getDatabaseName());
        $this->travelTo(CarbonImmutable::parse('2026-10-04T12:00:00Z'));
        $this->admin = $this->user('admin');
    }

    protected function tearDown(): void
    {
        $this->travelBack();
        parent::tearDown();
    }

    private function user(string $role, string $status = 'active'): User
    {
        $user = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $user->forceFill(['role' => $role, 'account_status' => $status])->save();

        return $user;
    }

    private function payload(string $resource): array
    {
        return match ($resource) {
            'showcase-items' => ['key' => 'dashboard', 'image_src' => 'public/dashboard.png', 'alt' => 'Dashboard preview'],
            'sensei-profiles' => ['name' => 'Fixture Sensei', 'role' => 'JLPT mentor', 'bio' => 'Fixture bio', 'photo' => 'public/sensei.png', 'expertise' => ['JLPT', 'Grammar'], 'level' => 'n1'],
            'testimonials' => ['name' => 'Fixture student', 'context' => 'JLPT N1', 'quote' => 'Fixture quote'],
            'blog-articles' => ['title' => 'Fixture article', 'slug' => 'fixture-article', 'body' => "Plain text\nSecond paragraph", 'category' => 'JLPT'],
            'certificate-templates' => ['program' => 'JLPT N1', 'title' => 'Fixture certificate', 'description' => 'Fixture description'],
        };
    }

    private function create(string $resource, array $overrides = []): array
    {
        return $this->actingAs($this->admin)->postJson('/api/admin/'.$resource, array_replace($this->payload($resource), $overrides))
            ->assertCreated()->json('data');
    }

    public static function resources(): array
    {
        return array_map(fn ($resource) => [$resource], array_keys(PublicContentService::RESOURCES));
    }

    #[DataProvider('resources')]
    public function test_admin_crud_defaults_partial_update_and_missing_ids(string $resource): void
    {
        $item = $this->create($resource);
        $url = '/api/admin/'.$resource;
        foreach ($this->payload($resource) as $field => $value) {
            $this->assertSame($value, $item[$field]);
        }
        $default = match ($resource) {
            'showcase-items' => ['visible', false],
            'sensei-profiles' => ['active', false],
            'testimonials', 'blog-articles' => ['published', false],
            'certificate-templates' => ['status', 'draft'],
        };
        $this->assertSame($default[1], $item[$default[0]]);
        $this->getJson($url)->assertOk()->assertJsonFragment(['id' => $item['id']]);
        $this->getJson($url.'/'.$item['id'])->assertOk()->assertJsonPath('data', $item);
        $change = $resource === 'blog-articles' ? ['excerpt' => 'Updated excerpt'] : ['sort_order' => 2];
        $updated = $this->patchJson($url.'/'.$item['id'], $change)->assertOk();
        foreach ($change as $field => $value) {
            $updated->assertJsonPath('data.'.$field, $value);
        }
        $this->patchJson($url.'/'.$item['id'], ['internal' => 'secret'])->assertUnprocessable()->assertJsonValidationErrors('internal');
        $this->deleteJson($url.'/'.$item['id'])->assertNoContent();
        $this->getJson($url.'/'.$item['id'])->assertNotFound();
        $this->patchJson($url.'/'.$item['id'], $change)->assertNotFound();
        $this->getJson($url.'/9223372036854775808')->assertNotFound();
    }

    #[DataProvider('resources')]
    public function test_admin_endpoints_require_active_admin_for_every_operation(string $resource): void
    {
        $url = '/api/admin/'.$resource;
        $operations = [['GET', $url], ['POST', $url], ['GET', $url.'/1'], ['PATCH', $url.'/1'], ['DELETE', $url.'/1']];
        foreach ($operations as [$method, $endpoint]) {
            $this->json($method, $endpoint, $this->payload($resource))->assertUnauthorized();
        }
        foreach ([['student', 'active', 403], ['admin', 'inactive', 401]] as [$role, $status, $expected]) {
            $user = $this->user($role, $status);
            foreach ($operations as [$method, $endpoint]) {
                $this->actingAs($user)->json($method, $endpoint, $this->payload($resource))->assertStatus($expected);
            }
        }
    }

    public function test_showcase_keys_labels_uniqueness_visibility_and_order(): void
    {
        $this->actingAs($this->admin);
        foreach (PublicContentService::SHOWCASE_LABELS as $key => $label) {
            $item = $this->create('showcase-items', ['key' => $key, 'visible' => $key !== 'lesson', 'sort_order' => $key === 'evaluation' ? 1 : 2]);
            $this->assertSame($label, $item['label']);
        }
        $this->postJson('/api/admin/showcase-items', $this->payload('showcase-items'))->assertUnprocessable()->assertJsonValidationErrors('key');
        $this->postJson('/api/admin/showcase-items', array_replace($this->payload('showcase-items'), ['key' => 'generic']))->assertUnprocessable();
        $id = DB::table('showcase_items')->where('key', 'dashboard')->value('id');
        $this->patchJson('/api/admin/showcase-items/'.$id, ['label' => 'Custom copy'])->assertUnprocessable()->assertJsonValidationErrors('label');
        $this->patchJson('/api/admin/showcase-items/'.$id, ['sort_order' => 0])->assertUnprocessable();
        auth('web')->logout();
        $response = $this->getJson('/api/showcase')->assertOk();
        $this->assertSame(['evaluation', 'dashboard', 'journey', 'flashcard'], array_column($response->json('data'), 'key'));
        $this->assertSame(['id', 'key', 'label', 'image_src', 'alt'], array_keys($response->json('data.0')));
    }

    public function test_sensei_active_filter_n1_and_expertise_validation(): void
    {
        $this->create('sensei-profiles');
        $first = $this->create('sensei-profiles', ['active' => true, 'sort_order' => 2]);
        $second = $this->create('sensei-profiles', ['active' => true, 'sort_order' => 1]);
        foreach ([[], ['JLPT', 'JLPT'], [''], ['JLPT', 5], ['named' => 'JLPT']] as $expertise) {
            $this->postJson('/api/admin/sensei-profiles', array_replace($this->payload('sensei-profiles'), ['expertise' => $expertise]))->assertUnprocessable();
        }
        $this->patchJson('/api/admin/sensei-profiles/'.$first['id'], ['level' => 'n0'])->assertUnprocessable();
        auth('web')->logout();
        $response = $this->getJson('/api/sensei-profiles')->assertOk();
        $this->assertSame([$second['id'], $first['id']], array_column($response->json('data'), 'id'));
        $response->assertJsonPath('data.0.level', 'n1');
        $this->assertArrayNotHasKey('active', $response->json('data.0'));
        $this->assertSame('admin', $this->admin->fresh()->role);
    }

    public function test_testimonial_publication_landing_and_video_pair_partial_updates(): void
    {
        $this->create('testimonials', ['landing' => true]);
        $landing = $this->create('testimonials', ['published' => true, 'landing' => true]);
        $other = $this->create('testimonials', ['published' => true]);
        $url = '/api/admin/testimonials/'.$landing['id'];
        $this->patchJson($url, ['video_url' => 'https://media.example.test/video'])->assertUnprocessable();
        $this->patchJson($url, ['video_title' => 'Video'])->assertUnprocessable();
        $this->patchJson($url, ['video_url' => 'https://media.example.test/video', 'video_title' => 'Video'])->assertOk();
        $this->patchJson($url, ['video_url' => null])->assertUnprocessable();
        $this->patchJson($url, ['video_title' => 'Updated'])->assertOk();
        $this->patchJson($url, ['video_url' => null, 'video_title' => null])->assertOk();
        $this->patchJson($url, ['consent' => true])->assertUnprocessable();
        auth('web')->logout();
        $this->getJson('/api/testimonials')->assertOk()->assertJsonCount(2, 'data');
        $this->getJson('/api/testimonials?landing=true')->assertOk()->assertJsonPath('data.0.id', $landing['id'])->assertJsonCount(1, 'data');
        $this->getJson('/api/testimonials?landing=false')->assertOk()->assertJsonPath('data.0.id', $other['id']);
        $this->getJson('/api/testimonials?landing=anything')->assertUnprocessable();
    }

    public function test_blog_public_time_boundary_offsets_order_filters_and_internal_secrecy(): void
    {
        DB::statement("SET LOCAL TIME ZONE 'Asia/Jakarta'");
        $this->create('blog-articles', ['slug' => 'draft']);
        $this->create('blog-articles', ['slug' => 'future', 'published' => true, 'published_at' => '2026-10-04T12:00:00.000001Z']);
        $undated = $this->create('blog-articles', ['slug' => 'undated', 'published' => true]);
        $old = $this->create('blog-articles', ['slug' => 'old', 'published' => true, 'published_at' => '2026-10-03']);
        $boundary = $this->create('blog-articles', ['slug' => 'boundary', 'published' => true, 'published_at' => '2026-10-04T19:00:00+07:00', 'featured' => true]);
        $tie = $this->create('blog-articles', ['slug' => 'tie', 'published' => true, 'published_at' => '2026-10-04T12:00:00Z', 'category' => 'Tips Belajar']);
        auth('web')->logout();
        $response = $this->getJson('/api/blog')->assertOk();
        $this->assertSame([$tie['id'], $boundary['id'], $old['id'], $undated['id']], array_column($response->json('data'), 'id'));
        $this->getJson('/api/blog?featured=true&category=JLPT')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.slug', 'boundary');
        $this->getJson('/api/blog?featured=false')->assertOk()->assertJsonCount(3, 'data');
        foreach (['category=Other', 'featured=maybe', 'category[]=JLPT'] as $filter) {
            $this->getJson('/api/blog?'.$filter)->assertUnprocessable();
        }
        foreach (['draft', 'future', 'unknown', 'Invalid-Slug'] as $slug) {
            $this->getJson('/api/blog/'.$slug)->assertNotFound();
        }
        $detail = $this->getJson('/api/blog/boundary')->assertOk()->assertJsonPath('data.author', 'Hiru Academy')
            ->assertJsonPath('data.published_at', '2026-10-04T12:00:00.000000Z');
        foreach (['published', 'created_at', 'updated_at', 'status'] as $field) {
            $this->assertArrayNotHasKey($field, $detail->json('data'));
        }
        $this->actingAs($this->admin)->patchJson('/api/admin/blog-articles/'.$boundary['id'], ['published' => false])->assertOk();
        $this->getJson('/api/blog/boundary')->assertNotFound();
    }

    public function test_blog_slug_author_plain_text_and_real_dates(): void
    {
        $item = $this->create('blog-articles');
        $url = '/api/admin/blog-articles/'.$item['id'];
        foreach ([
            ['slug' => 'UPPER'], ['slug' => 'a--b'], ['slug' => '-prefix'], ['slug' => 'space slug'],
            ['author' => 'Other'], ['status' => 'Scheduled'], ['body' => '<script>alert(1)</script>'],
            ['body' => '<img src=x onerror=alert(1)>'], ['published_at' => '2026-02-30'],
            ['published_at' => '2026-10-04T12:00:00'], ['published_at' => '2026-10-04T25:00:00Z'],
            ['published_at' => '2026-10-04T12:00:00+99:00'], ['category' => 'Grammar'],
        ] as $invalid) {
            $this->patchJson($url, $invalid)->assertUnprocessable();
        }
        $this->postJson('/api/admin/blog-articles', $this->payload('blog-articles'))->assertUnprocessable()->assertJsonValidationErrors('slug');
        $this->patchJson($url, ['slug' => 'fixture-article'])->assertOk();
        $this->patchJson($url, ['published_at' => '2026-10-04'])->assertOk()->assertJsonPath('data.published_at', '2026-10-04T00:00:00.000000Z');
        $this->patchJson($url, ['published_at' => null])->assertOk()->assertJsonPath('data.published_at', null);
    }

    public static function mediaFields(): array
    {
        return [
            ['showcase-items', 'image_src'], ['sensei-profiles', 'photo'], ['testimonials', 'image'],
            ['testimonials', 'video_url'], ['blog-articles', 'thumbnail'], ['certificate-templates', 'image'],
        ];
    }

    #[DataProvider('mediaFields')]
    public function test_media_references_reject_credentials_schemes_and_traversal(string $resource, string $field): void
    {
        $item = $this->create($resource);
        $url = '/api/admin/'.$resource.'/'.$item['id'];
        foreach ([
            'https://username:password@media.example.test/file', 'https://username@media.example.test/file',
            '//media.example.test/file', 'javascript:alert(1)', 'data:image/png;base64,AAAA', 'blob:https://media.example.test/id',
            '../private/file', 'public/../../file', 'public/%2e%2e/file', 'public/%252e%252e/file',
            'public\\..\\file', 'https://media.example.test/%2e%2e/private', 'public/file%00.png', '/absolute/file',
        ] as $unsafe) {
            $data = [$field => $unsafe];
            if ($field === 'video_url') {
                $data['video_title'] = 'Video';
            }
            $response = $this->patchJson($url, $data)->assertUnprocessable()->assertJsonValidationErrors($field);
            $this->assertStringNotContainsString('username:password', $response->getContent());
        }
        foreach (['https://media.example.test/file.png', 'http://media.example.test/file.png'] as $safe) {
            $data = [$field => $safe];
            if ($field === 'video_url') {
                $data['video_title'] = 'Video';
            }
            $this->patchJson($url, $data)->assertOk();
        }
        if ($field !== 'video_url') {
            $this->patchJson($url, [$field => 'public/media/file.png'])->assertOk();
        }
    }

    #[DataProvider('resources')]
    public function test_required_fields_types_and_positive_orders(string $resource): void
    {
        $item = $this->create($resource);
        $url = '/api/admin/'.$resource.'/'.$item['id'];
        foreach ($this->payload($resource) as $field => $value) {
            if ($field !== 'level') {
                $this->patchJson($url, [$field => null])->assertUnprocessable();
            }
        }
        if ($resource !== 'blog-articles') {
            foreach ([0, -1, 1.5, 2147483648, null] as $order) {
                $this->patchJson($url, ['sort_order' => $order])->assertUnprocessable();
            }
        }
        $flag = match ($resource) {
            'showcase-items' => 'visible',
            'sensei-profiles' => 'active',
            'testimonials', 'blog-articles' => 'published',
            'certificate-templates' => null,
        };
        if ($flag !== null) {
            $this->patchJson($url, [$flag => 'yes'])->assertUnprocessable();
        }
    }

    public function test_n1_catalog_and_offer_values_remain_unchanged(): void
    {
        $programs = DB::table('programs')->where('code', 'n1')->orderBy('id')->get()->toArray();
        $offers = DB::table('program_offers')->whereIn('program_id', array_column($programs, 'id'))->orderBy('id')->get()->toArray();
        $this->create('sensei-profiles', ['active' => true, 'level' => 'n1']);
        $this->create('certificate-templates', ['program' => 'JLPT N1', 'status' => 'published']);
        $this->assertEquals($programs, DB::table('programs')->where('code', 'n1')->orderBy('id')->get()->toArray());
        $this->assertEquals($offers, DB::table('program_offers')->whereIn('program_id', array_column($programs, 'id'))->orderBy('id')->get()->toArray());
    }

    public function test_certificates_admin_only_required_fields_and_statuses(): void
    {
        $item = $this->create('certificate-templates');
        foreach (['issued', 'Scheduled', 'cancelled'] as $status) {
            $this->patchJson('/api/admin/certificate-templates/'.$item['id'], ['status' => $status])->assertUnprocessable();
        }
        $this->patchJson('/api/admin/certificate-templates/'.$item['id'], ['status' => 'published'])->assertOk();
        foreach (PublicContentService::RESOURCES as $resource => $class) {
            $this->postJson('/api/admin/'.$resource, [])->assertUnprocessable();
        }
        auth('web')->logout();
        $this->getJson('/api/certificate-templates')->assertNotFound();
        $this->getJson('/api/certificate-templates/'.$item['id'])->assertNotFound();
    }

    public function test_database_constraints_reject_invalid_orders_statuses_and_duplicate_slugs(): void
    {
        $sensei = $this->create('sensei-profiles');
        $certificate = $this->create('certificate-templates');
        $article = $this->create('blog-articles');
        foreach ([
            ['sensei_profiles', $sensei['id'], ['sort_order' => 0]],
            ['sensei_profiles', $sensei['id'], ['level' => 'n0']],
            ['certificate_templates', $certificate['id'], ['status' => 'issued']],
            ['blog_articles', $article['id'], ['slug' => 'BAD SLUG']],
        ] as [$table, $id, $change]) {
            DB::beginTransaction();
            try {
                DB::table($table)->where('id', $id)->update($change);
                $this->fail('Database accepted invalid content.');
            } catch (QueryException $exception) {
                $this->assertSame('23514', $exception->errorInfo[0]);
            } finally {
                DB::rollBack();
            }
        }
        DB::beginTransaction();
        try {
            DB::table('blog_articles')->insert($this->payload('blog-articles'));
            $this->fail('Database accepted duplicate slug.');
        } catch (QueryException $exception) {
            $this->assertSame('23505', $exception->errorInfo[0]);
        } finally {
            DB::rollBack();
        }
    }
}
