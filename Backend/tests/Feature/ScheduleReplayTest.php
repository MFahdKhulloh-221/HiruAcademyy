<?php

namespace Tests\Feature;

use App\Models\AccessGrant;
use App\Models\Chapter;
use App\Models\ClassSchedule;
use App\Models\Program;
use App\Models\ProgramOffer;
use App\Models\ReplayPlaylist;
use App\Models\ReplayVideo;
use App\Models\User;
use App\Services\EntitlementService;
use Carbon\CarbonImmutable;
use Database\Seeders\ProgramOfferSeeder;
use Database\Seeders\ProgramSeeder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Mockery\MockInterface;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ScheduleReplayTest extends TestCase
{
    use DatabaseTransactions;

    private const LEVELS = ['n5', 'n4', 'n3', 'n2', 'n1'];

    private const MODELS = [
        'class-schedules' => ClassSchedule::class,
        'replay-playlists' => ReplayPlaylist::class,
        'replay-videos' => ReplayVideo::class,
    ];

    private User $admin;

    private User $student;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('hiru_academy_test', DB::connection()->getDatabaseName());
        $this->travelTo(CarbonImmutable::parse('2026-10-04T12:00:00Z'));
        $this->seed([ProgramSeeder::class, ProgramOfferSeeder::class]);
        $this->student = $this->user('student');
        $this->admin = $this->user('admin');
    }

    public function test_published_sensei_overlap_is_rejected_but_adjacent_and_cancelled_are_allowed(): void
    {
        $program = Program::where('code', 'n4')->firstOrFail();
        $payload = ['program_id' => $program->id, 'title' => 'First', 'scheduled_at' => '2026-10-20T12:00:00Z', 'duration_minutes' => 60, 'sensei_name' => 'Hana', 'status' => 'published'];
        $this->actingAs($this->admin)->postJson('/api/admin/class-schedules', $payload)->assertCreated();
        $this->postJson('/api/admin/class-schedules', array_replace($payload, ['title' => 'Conflict', 'scheduled_at' => '2026-10-20T12:30:00Z', 'sensei_name' => ' hana ']))->assertUnprocessable()->assertJsonValidationErrors('scheduled_at');
        $this->postJson('/api/admin/class-schedules', array_replace($payload, ['title' => 'Adjacent', 'scheduled_at' => '2026-10-20T13:00:00Z']))->assertCreated();
        $this->postJson('/api/admin/class-schedules', array_replace($payload, ['title' => 'Cancelled', 'status' => 'cancelled']))->assertCreated();
    }

    protected function tearDown(): void
    {
        $this->travelBack();
        parent::tearDown();
    }

    private function user(string $role): User
    {
        $user = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $user->forceFill(['role' => $role, 'account_status' => 'active'])->save();

        return $user;
    }

    private function program(string $code = 'n5'): Program
    {
        return Program::where('code', $code)->firstOrFail();
    }

    private function playlist(string $code = 'n5', array $overrides = []): ReplayPlaylist
    {
        return ReplayPlaylist::create(array_replace([
            'program_id' => $this->program($code)->id,
            'title' => 'Fixture replay '.$code,
            'status' => 'published',
            'sort_order' => 0,
        ], $overrides))->fresh();
    }

    private function schedule(string $code = 'n5', array $overrides = []): ClassSchedule
    {
        return ClassSchedule::create(array_replace([
            'program_id' => $this->program($code)->id,
            'title' => 'Fixture live '.$code,
            'scheduled_at' => '2026-10-04T13:00:00Z',
            'meeting_url' => 'https://media.example.test/meeting',
            'status' => 'published',
            'sort_order' => 0,
        ], $overrides))->fresh();
    }

    private function video(ReplayPlaylist $playlist, array $overrides = []): ReplayVideo
    {
        return ReplayVideo::create(array_replace([
            'replay_playlist_id' => $playlist->id,
            'title' => 'Fixture replay video',
            'video_url' => 'https://media.example.test/video.mp4',
            'status' => 'published',
            'sort_order' => 0,
        ], $overrides))->fresh();
    }

    private function grant(string $code, string $plan = 'sensei', array $overrides = []): AccessGrant
    {
        return AccessGrant::create(array_replace([
            'user_id' => $this->student->id,
            'program_id' => $this->program($code)->id,
            'plan_code' => $plan,
            'starts_at' => '2026-10-01',
            'ends_at' => '2026-10-31',
            'status' => 'active',
        ], $overrides));
    }

    private function payload(string $resource): array
    {
        return ['title' => 'New fixture content', ...match ($resource) {
            'class-schedules' => [
                'program_id' => $this->program()->id,
                'scheduled_at' => '2026-10-04T13:00:00Z',
                'meeting_url' => 'https://media.example.test/meeting',
                'duration_minutes' => 60,
            ],
            'replay-playlists' => ['program_id' => $this->program()->id],
            'replay-videos' => [
                'replay_playlist_id' => $this->playlist()->id,
                'video_url' => 'https://media.example.test/video.mp4',
                'recorded_at' => '2026-10-03',
            ],
        }];
    }

    private function item(string $resource, array $payload): Model
    {
        $class = self::MODELS[$resource];

        return $class::create($payload)->fresh();
    }

    private function studentUrls(ClassSchedule $schedule, ReplayPlaylist $playlist): array
    {
        return [
            '/api/student/class-schedules',
            '/api/student/class-schedules/'.$schedule->id,
            '/api/student/replays',
            '/api/student/replay-playlists/'.$playlist->id,
        ];
    }

    public static function resources(): array
    {
        return array_map(fn ($resource) => [$resource], array_keys(self::MODELS));
    }

    #[DataProvider('resources')]
    public function test_admin_crud_defaults_payload_partial_updates_and_deterministic_order(string $resource): void
    {
        $payload = $this->payload($resource);
        $url = '/api/admin/'.$resource;
        $this->actingAs($this->admin);
        $created = $this->postJson($url, $payload)->assertCreated()
            ->assertJsonPath('data.status', 'draft')->assertJsonPath('data.sort_order', 0);
        $id = $created->json('data.id');
        $this->assertIsInt($id);
        foreach ($payload as $field => $value) {
            if (in_array($field, ['scheduled_at', 'recorded_at'], true)) {
                $this->assertTrue(CarbonImmutable::parse($value)->equalTo(CarbonImmutable::parse($created->json('data.'.$field))));
            } else {
                $created->assertJsonPath('data.'.$field, $value);
            }
        }
        if ($resource === 'replay-playlists') {
            $created->assertJsonMissingPath('data.level');
        }
        $class = self::MODELS[$resource];
        $this->assertNotNull($class::find($id));
        $this->getJson($url.'/'.$id)->assertOk()->assertJsonPath('data.id', $id);
        $second = $this->postJson($url, array_replace($payload, ['status' => 'published', 'sort_order' => 1]))
            ->assertCreated()->json('data.id');
        $this->patchJson($url.'/'.$id, ['title' => 'Edited fixture', 'status' => 'published', 'sort_order' => 2])
            ->assertOk()->assertJsonPath('data.title', 'Edited fixture')->assertJsonPath('data.status', 'published');
        $ids = array_column($this->getJson($url)->assertOk()->json('data'), 'id');
        $this->assertSame([$second, $id], array_values(array_intersect($ids, [$id, $second])));
        $this->patchJson($url.'/'.$id, ['sort_order' => 1])->assertOk();
        $ids = array_column($this->getJson($url)->assertOk()->json('data'), 'id');
        $this->assertSame([$id, $second], array_values(array_intersect($ids, [$id, $second])));
        $this->patchJson($url.'/'.$id, ['status' => 'draft'])->assertOk()->assertJsonPath('data.status', 'draft');
        $this->deleteJson($url.'/'.$id)->assertNoContent();
        $this->assertNull($class::find($id));
        $this->getJson($url.'/'.$id)->assertNotFound();
        $this->patchJson($url.'/'.$id, ['title' => 'Missing'])->assertNotFound();
        $this->deleteJson($url.'/'.$id)->assertNotFound();
    }

    #[DataProvider('resources')]
    public function test_admin_operations_require_active_admin_and_do_not_mutate_on_denial(string $resource): void
    {
        $payload = $this->payload($resource);
        $item = $this->item($resource, $payload);
        $url = '/api/admin/'.$resource;
        $requests = [['GET', $url], ['POST', $url], ['GET', $url.'/'.$item->id], ['PATCH', $url.'/'.$item->id], ['DELETE', $url.'/'.$item->id]];
        $class = self::MODELS[$resource];
        $count = $class::count();
        foreach ($requests as [$method, $endpoint]) {
            $this->json($method, $endpoint, $payload)->assertUnauthorized();
        }
        $this->actingAs($this->student);
        foreach ($requests as [$method, $endpoint]) {
            $this->json($method, $endpoint, $payload)->assertForbidden();
        }
        $this->admin->forceFill(['account_status' => 'inactive'])->save();
        $this->actingAs($this->admin);
        foreach ($requests as [$method, $endpoint]) {
            $this->json($method, $endpoint, $payload)->assertUnauthorized();
        }
        $this->assertSame($count, $class::count());
        $this->assertSame($item->getAttributes(), $item->fresh()->getAttributes());
    }

    public static function programMatrix(): array
    {
        $cases = [];
        foreach (['class-schedules', 'replay-playlists'] as $resource) {
            foreach (['n5', 'n3', 'n1', 'dasar', 'ssw-food', 'interview'] as $code) {
                $cases[$resource.' '.$code] = [$resource, $code, in_array($code, self::LEVELS, true)];
            }
        }

        return $cases;
    }

    #[DataProvider('programMatrix')]
    public function test_only_jlpt_sensei_program_identity_is_allowed_on_create_and_parent_change(string $resource, string $code, bool $allowed): void
    {
        $payload = $this->payload($resource);
        $item = $this->item($resource, $payload);
        $programId = $this->program($code)->id;
        $this->actingAs($this->admin);
        $created = $this->postJson('/api/admin/'.$resource, array_replace($payload, ['program_id' => $programId]));
        $updated = $this->patchJson('/api/admin/'.$resource.'/'.$item->id, ['program_id' => $programId]);
        if ($allowed) {
            $created->assertCreated()->assertJsonPath('data.program_id', $programId);
            $updated->assertOk()->assertJsonPath('data.program_id', $programId);
        } else {
            $created->assertUnprocessable()->assertJsonValidationErrors('program_id');
            $updated->assertUnprocessable()->assertJsonValidationErrors('program_id');
            $this->assertSame($item->getAttributes(), $item->fresh()->getAttributes());
        }
    }

    public function test_n1_inactive_unsellable_offer_identity_is_valid_but_missing_sensei_offer_is_not(): void
    {
        $offer = ProgramOffer::where('program_id', $this->program('n1')->id)->where('plan_code', 'sensei')->firstOrFail();
        $this->assertSame('inactive', $offer->status);
        $this->assertNull($offer->base_price);
        $this->actingAs($this->admin);
        foreach (['class-schedules', 'replay-playlists'] as $resource) {
            $payload = array_replace($this->payload($resource), ['program_id' => $offer->program_id]);
            $this->postJson('/api/admin/'.$resource, $payload)->assertCreated();
        }
        ProgramOffer::where('program_id', $this->program()->id)->where('plan_code', 'sensei')->delete();
        foreach (['class-schedules', 'replay-playlists'] as $resource) {
            $this->postJson('/api/admin/'.$resource, $this->payload($resource))
                ->assertUnprocessable()->assertJsonValidationErrors('program_id');
        }
    }

    #[DataProvider('resources')]
    public function test_validation_rejects_bad_shared_fields_and_missing_parents_without_mutation(string $resource): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $payload = $this->payload($resource);
        $item = $this->item($resource, $payload);
        $parent = $resource === 'replay-videos' ? 'replay_playlist_id' : 'program_id';
        $invalid = [
            ['title' => ''], ['title' => str_repeat('x', 256)], ['title' => null],
            ['description' => []], ['status' => 'active'], ['status' => null],
            ['sort_order' => -1], ['sort_order' => null], ['sort_order' => 2147483648],
            [$parent => 0], [$parent => 'bad'], [$parent => null],
        ];
        if ($resource !== 'class-schedules') {
            $invalid[] = ['status' => 'cancelled'];
        }
        $this->actingAs($this->admin);
        foreach ($invalid as $fields) {
            $field = array_key_first($fields);
            $this->postJson('/api/admin/'.$resource, array_replace($payload, $fields))
                ->assertUnprocessable()->assertJsonValidationErrors($field);
            $this->patchJson('/api/admin/'.$resource.'/'.$item->id, $fields)
                ->assertUnprocessable()->assertJsonValidationErrors($field);
        }
        $this->postJson('/api/admin/'.$resource, [])->assertUnprocessable()->assertJsonValidationErrors(['title', $parent]);
        $this->assertSame($item->getAttributes(), $item->fresh()->getAttributes());
    }

    public function test_playlist_requires_canonical_program_id_not_legacy_level(): void
    {
        $this->actingAs($this->admin)->postJson('/api/admin/replay-playlists', ['title' => 'Legacy fixture', 'level' => 'n3'])
            ->assertUnprocessable()->assertJsonValidationErrors('level');
        $this->postJson('/api/admin/replay-playlists', ['title' => 'Canonical fixture', 'program_id' => $this->program('n3')->id, 'level' => 'n1'])
            ->assertUnprocessable()->assertJsonValidationErrors('level');
        $this->postJson('/api/admin/replay-playlists', ['title' => 'Canonical fixture', 'program_id' => $this->program('n3')->id])
            ->assertCreated()->assertJsonPath('data.program_id', $this->program('n3')->id)->assertJsonMissingPath('data.level');
    }

    public function test_schedule_dates_normalize_to_utc_and_nullable_metadata_round_trip(): void
    {
        $this->actingAs($this->admin);
        $payload = array_replace($this->payload('class-schedules'), [
            'scheduled_at' => '2026-10-04T20:00:00+07:00', 'description' => 'Fixture description',
            'chapter' => 'Chapter 2', 'session' => 'Session 1', 'sensei_name' => 'Fixture Sensei',
        ]);
        $created = $this->postJson('/api/admin/class-schedules', $payload)->assertCreated();
        $schedule = ClassSchedule::findOrFail($created->json('data.id'));
        $this->assertSame('2026-10-04T13:00:00+00:00', $schedule->scheduled_at->utc()->toIso8601String());
        $this->assertSame('2026-10-04T13:00:00+00:00', CarbonImmutable::parse($created->json('data.scheduled_at'))->toIso8601String());
        foreach (['description', 'chapter', 'session', 'sensei_name', 'duration_minutes', 'meeting_url'] as $field) {
            $created->assertJsonPath('data.'.$field, $payload[$field]);
        }
        $this->patchJson('/api/admin/class-schedules/'.$schedule->id, [
            'description' => null, 'chapter' => null, 'session' => null, 'sensei_name' => null,
            'duration_minutes' => null, 'meeting_url' => null, 'status' => 'cancelled',
        ])->assertOk()->assertJsonPath('data.meeting_url', null)->assertJsonPath('data.duration_minutes', null)
            ->assertJsonPath('data.status', 'cancelled');
        foreach (['scheduled_at' => 'not-a-date', 'duration_minutes' => 0, 'chapter' => str_repeat('x', 256), 'session' => [], 'sensei_name' => []] as $field => $value) {
            $this->postJson('/api/admin/class-schedules', array_replace($payload, [$field => $value]))
                ->assertUnprocessable()->assertJsonValidationErrors($field);
            $this->patchJson('/api/admin/class-schedules/'.$schedule->id, [$field => $value])
                ->assertUnprocessable()->assertJsonValidationErrors($field);
        }
    }

    public function test_replay_video_metadata_date_parent_move_and_playlist_delete_cascade(): void
    {
        $first = $this->playlist();
        $second = $this->playlist('n3');
        $payload = [
            'title' => 'Fixture video', 'replay_playlist_id' => $first->id,
            'video_url' => 'https://media.example.test/video.mp4', 'recorded_at' => '2026-10-03',
            'description' => 'Fixture description', 'chapter' => 'Chapter 2', 'session' => 'Session 1', 'sensei_name' => 'Fixture Sensei',
        ];
        $created = $this->actingAs($this->admin)->postJson('/api/admin/replay-videos', $payload)->assertCreated();
        $id = $created->json('data.id');
        foreach (['description', 'chapter', 'session', 'sensei_name', 'video_url'] as $field) {
            $created->assertJsonPath('data.'.$field, $payload[$field]);
        }
        $this->assertSame('2026-10-03', ReplayVideo::findOrFail($id)->recorded_at->toDateString());
        $this->patchJson('/api/admin/replay-videos/'.$id, ['replay_playlist_id' => $second->id, 'recorded_at' => null])
            ->assertOk()->assertJsonPath('data.replay_playlist_id', $second->id)->assertJsonPath('data.recorded_at', null);
        foreach (['2026-02-30', '2026-10-03T12:00:00Z', 'bad'] as $date) {
            $this->postJson('/api/admin/replay-videos', array_replace($payload, ['recorded_at' => $date]))
                ->assertUnprocessable()->assertJsonValidationErrors('recorded_at');
            $this->patchJson('/api/admin/replay-videos/'.$id, ['recorded_at' => $date])
                ->assertUnprocessable()->assertJsonValidationErrors('recorded_at');
        }
        $this->deleteJson('/api/admin/replay-playlists/'.$first->id)->assertNoContent();
        $this->assertNotNull(ReplayVideo::find($id));
        $this->deleteJson('/api/admin/replay-playlists/'.$second->id)->assertNoContent();
        $this->assertNull(ReplayVideo::find($id));
    }

    public static function invalidUrls(): array
    {
        $cases = [];
        foreach (['class-schedules' => 'meeting_url', 'replay-videos' => 'video_url'] as $resource => $field) {
            foreach (['javascript:alert(1)', 'data:text/plain,private', 'file:///private', 'ftp://media.example.test/file', '/relative', 'https://user:password@media.example.test/private'] as $url) {
                $cases[$resource.' '.$url] = [$resource, $field, $url];
            }
        }

        return $cases;
    }

    #[DataProvider('invalidUrls')]
    public function test_media_urls_reject_unsafe_schemes_relative_paths_and_credentials(string $resource, string $field, string $url): void
    {
        $payload = $this->payload($resource);
        $item = $this->item($resource, $payload);
        $this->actingAs($this->admin)->postJson('/api/admin/'.$resource, array_replace($payload, [$field => $url]))
            ->assertUnprocessable()->assertJsonValidationErrors($field);
        $this->patchJson('/api/admin/'.$resource.'/'.$item->id, [$field => $url])
            ->assertUnprocessable()->assertJsonValidationErrors($field);
        $this->assertSame($item->getAttributes(), $item->fresh()->getAttributes());
    }

    public function test_student_routes_require_active_student(): void
    {
        $urls = $this->studentUrls($this->schedule(), $this->playlist());
        foreach ($urls as $url) {
            $this->getJson($url)->assertUnauthorized();
        }
        $this->actingAs($this->admin);
        foreach ($urls as $url) {
            $this->getJson($url)->assertForbidden();
        }
        $this->student->forceFill(['account_status' => 'inactive'])->save();
        $this->actingAs($this->student);
        foreach ($urls as $url) {
            $this->getJson($url)->assertUnauthorized();
        }
    }

    public static function accessMatrix(): array
    {
        $cases = ['free' => [null, null, [], []]];
        foreach (self::LEVELS as $rank => $code) {
            $cases['lms '.$code] = [$code, 'lms', [], []];
            $cases['sensei '.$code] = [$code, 'sensei', [$code], array_slice(self::LEVELS, 0, $rank + 1)];
        }
        foreach (['ssw-food', 'interview'] as $code) {
            $cases[$code] = [$code, 'lms', [], []];
        }

        return $cases;
    }

    #[DataProvider('accessMatrix')]
    public function test_live_access_is_exact_and_replay_access_cumulative_for_all_levels(?string $code, ?string $plan, array $live, array $replay): void
    {
        $schedules = [];
        $playlists = [];
        foreach (self::LEVELS as $level) {
            $schedules[$level] = $this->schedule($level);
            $playlists[$level] = $this->playlist($level);
            $this->video($playlists[$level]);
        }
        if ($code !== null) {
            $this->grant($code, $plan);
        }
        $this->actingAs($this->student);
        $this->assertSame(array_map(fn ($level) => $schedules[$level]->id, $live), array_column($this->getJson('/api/student/class-schedules')->assertOk()->json('data'), 'id'));
        $this->assertSame(array_map(fn ($level) => $playlists[$level]->id, $replay), array_column($this->getJson('/api/student/replays')->assertOk()->json('data'), 'id'));
        foreach (self::LEVELS as $level) {
            $response = $this->getJson('/api/student/class-schedules/'.$schedules[$level]->id);
            if (in_array($level, $live, true)) {
                $response->assertOk()->assertJsonPath('data.meeting_url', $schedules[$level]->meeting_url);
            } else {
                $response->assertForbidden()->assertDontSee($schedules[$level]->meeting_url, false);
            }
            $response = $this->getJson('/api/student/replay-playlists/'.$playlists[$level]->id);
            if (in_array($level, $replay, true)) {
                $response->assertOk()->assertJsonPath('data.program_id', $this->program($level)->id)
                    ->assertJsonPath('data.videos.0.video_url', 'https://media.example.test/video.mp4');
            } else {
                $response->assertForbidden()->assertDontSee('https://media.example.test/video.mp4', false);
            }
        }
    }

    public static function grantDates(): array
    {
        return [
            'starts today' => ['2026-10-04', '2026-10-31', 'active', true],
            'ends today' => ['2026-10-01', '2026-10-04', 'active', true],
            'one day inclusive' => ['2026-10-04', '2026-10-04', 'active', true],
            'future' => ['2026-10-05', '2026-10-31', 'active', false],
            'expired' => ['2026-10-01', '2026-10-03', 'active', false],
            'inactive' => ['2026-10-01', '2026-10-31', 'inactive', false],
        ];
    }

    #[DataProvider('grantDates')]
    public function test_source_grant_date_bounds_are_inclusive_and_ineligible_grants_expose_no_urls(string $start, string $end, string $status, bool $allowed): void
    {
        $schedule = $this->schedule('n3');
        $playlist = $this->playlist('n3');
        $video = $this->video($playlist);
        $this->grant('n3', overrides: ['starts_at' => $start, 'ends_at' => $end, 'status' => $status]);
        $this->actingAs($this->student);
        $this->getJson('/api/student/class-schedules')->assertOk()->assertJsonCount($allowed ? 1 : 0, 'data');
        $this->getJson('/api/student/replays')->assertOk()->assertJsonCount($allowed ? 1 : 0, 'data');
        foreach ([$this->studentUrls($schedule, $playlist)[1], $this->studentUrls($schedule, $playlist)[3]] as $url) {
            $response = $this->getJson($url);
            if ($allowed) {
                $response->assertOk();
            } else {
                $response->assertForbidden()->assertDontSee($schedule->meeting_url, false)->assertDontSee($video->video_url, false);
            }
        }
    }

    public function test_multiple_grants_union_without_duplicates_and_revoke_without_cached_access(): void
    {
        $schedules = [];
        $playlists = [];
        foreach (self::LEVELS as $code) {
            $schedules[$code] = $this->schedule($code);
            $playlists[$code] = $this->playlist($code);
        }
        $first = $this->grant('n3');
        $duplicate = $this->grant('n3');
        $lower = $this->grant('n5');
        $this->grant('n1', 'lms');
        $this->actingAs($this->student);
        $this->assertSame([$schedules['n5']->id, $schedules['n3']->id], array_column($this->getJson('/api/student/class-schedules')->assertOk()->json('data'), 'id'));
        $this->assertSame(array_map(fn ($code) => $playlists[$code]->id, ['n5', 'n4', 'n3']), array_column($this->getJson('/api/student/replays')->assertOk()->json('data'), 'id'));
        $first->update(['status' => 'inactive']);
        $duplicate->update(['ends_at' => '2026-10-03']);
        $this->getJson('/api/student/class-schedules')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $schedules['n5']->id);
        $this->getJson('/api/student/replays')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $playlists['n5']->id);
        $lower->delete();
        $this->getJson('/api/student/class-schedules')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/student/replays')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_n2_and_n5_sensei_grants_union_exact_live_and_cumulative_replay(): void
    {
        $schedules = [];
        $playlists = [];
        foreach (self::LEVELS as $code) {
            $schedules[$code] = $this->schedule($code);
            $playlists[$code] = $this->playlist($code);
        }
        $this->grant('n2');
        $this->grant('n5');
        $this->actingAs($this->student);
        $this->assertSame([$schedules['n5']->id, $schedules['n2']->id], array_column($this->getJson('/api/student/class-schedules')->assertOk()->json('data'), 'id'));
        $this->assertSame(array_map(fn ($code) => $playlists[$code]->id, ['n5', 'n4', 'n3', 'n2']), array_column($this->getJson('/api/student/replays')->assertOk()->json('data'), 'id'));
        $this->getJson('/api/student/class-schedules/'.$schedules['n4']->id)->assertForbidden();
        $this->getJson('/api/student/replay-playlists/'.$playlists['n1']->id)->assertForbidden();
    }

    #[DataProvider('resources')]
    public function test_unknown_entitlement_fields_are_rejected_on_create_and_patch(string $resource): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $payload = $this->payload($resource);
        $item = $this->item($resource, $payload);
        $class = self::MODELS[$resource];
        $count = $class::count();
        $this->actingAs($this->admin);
        foreach ([
            'user_id' => $this->student->id, 'can_replay' => true, 'can_zoom' => true,
            'live_access' => true, 'replay_access' => true, 'sensei_level' => 'n1',
            'replay_levels' => ['n1'], 'learning' => ['n1' => 'full'],
            'source_grants' => [['program_code' => 'n1', 'plan_code' => 'sensei']],
            'replay_n1' => true, 'live_n1' => true, 'access' => 'full',
        ] as $field => $value) {
            $this->postJson('/api/admin/'.$resource, array_replace($payload, [$field => $value]))
                ->assertUnprocessable()->assertJsonValidationErrors($field);
            $this->patchJson('/api/admin/'.$resource.'/'.$item->id, [$field => $value])
                ->assertUnprocessable()->assertJsonValidationErrors($field);
        }
        $this->assertSame($count, $class::count());
        $this->assertSame($item->getAttributes(), $item->fresh()->getAttributes());
        $this->assertSame(0, AccessGrant::where('user_id', $this->student->id)->count());
    }

    public function test_schedule_publication_time_filters_program_filter_and_total_order(): void
    {
        $past = $this->schedule('n3', ['scheduled_at' => '2026-10-04T11:59:59Z', 'sort_order' => 99]);
        $second = $this->schedule('n3', ['scheduled_at' => '2026-10-04T12:00:00Z', 'sort_order' => 2]);
        $first = $this->schedule('n3', ['scheduled_at' => '2026-10-04T12:00:00Z', 'sort_order' => 1]);
        $tie = $this->schedule('n3', ['scheduled_at' => '2026-10-04T12:00:00Z', 'sort_order' => 1]);
        $future = $this->schedule('n5', ['scheduled_at' => '2026-10-05T12:00:00Z']);
        $draft = $this->schedule('n3', ['status' => 'draft']);
        $cancelled = $this->schedule('n3', ['status' => 'cancelled']);
        $this->grant('n3');
        $this->grant('n5');
        $this->actingAs($this->student);
        $this->assertSame([$past->id, $first->id, $tie->id, $second->id, $future->id], array_column($this->getJson('/api/student/class-schedules')->assertOk()->json('data'), 'id'));
        $this->assertSame([$first->id, $tie->id, $second->id, $future->id], array_column($this->getJson('/api/student/class-schedules?period=upcoming')->assertOk()->json('data'), 'id'));
        $this->getJson('/api/student/class-schedules?period=past')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $past->id);
        $this->getJson('/api/student/class-schedules?program_id='.$this->program('n5')->id.'&period=upcoming')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $future->id);
        $this->getJson('/api/student/class-schedules?program_id='.$this->program('n4')->id)->assertOk()->assertJsonCount(0, 'data');
        foreach ([$draft, $cancelled] as $schedule) {
            $this->getJson('/api/student/class-schedules/'.$schedule->id)->assertNotFound()->assertDontSee($schedule->meeting_url, false);
        }
        foreach (['period=invalid' => 'period', 'program_id=0' => 'program_id', 'program_id=bad' => 'program_id'] as $query => $field) {
            $this->getJson('/api/student/class-schedules?'.$query)->assertUnprocessable()->assertJsonValidationErrors($field);
        }
    }

    public function test_replay_lists_and_videos_are_published_only_and_order_by_sort_then_id(): void
    {
        $last = $this->playlist('n3', ['sort_order' => 2]);
        $first = $this->playlist('n5', ['sort_order' => 1]);
        $tie = $this->playlist('n4', ['sort_order' => 1]);
        $draft = $this->playlist('n3', ['status' => 'draft']);
        $this->video($draft);
        $lastVideo = $this->video($first, ['sort_order' => 2]);
        $firstVideo = $this->video($first, ['sort_order' => 1]);
        $tieVideo = $this->video($first, ['sort_order' => 1]);
        $draftVideo = $this->video($first, ['status' => 'draft', 'video_url' => 'https://media.example.test/draft.mp4']);
        $this->grant('n3');
        $this->actingAs($this->student);
        $listed = $this->getJson('/api/student/replays')->assertOk()->assertJsonCount(3, 'data')->json('data');
        $this->assertSame([$first->id, $tie->id, $last->id], array_column($listed, 'id'));
        foreach ($listed as $row) {
            $this->assertArrayHasKey('program_id', $row);
            $this->assertArrayNotHasKey('video_url', $row);
            $this->assertArrayNotHasKey('videos', $row);
            $this->assertArrayNotHasKey('level', $row);
        }
        $detail = $this->getJson('/api/student/replay-playlists/'.$first->id)->assertOk()->assertJsonCount(3, 'data.videos')
            ->assertDontSee($draftVideo->video_url, false);
        $this->assertSame([$firstVideo->id, $tieVideo->id, $lastVideo->id], array_column($detail->json('data.videos'), 'id'));
        foreach ($detail->json('data.videos') as $video) {
            $this->assertSame('https://media.example.test/video.mp4', $video['video_url']);
        }
        $this->getJson('/api/student/replay-playlists/'.$draft->id)->assertNotFound()->assertDontSee('https://media.example.test/video.mp4', false);
    }

    public function test_user_id_spoof_cannot_borrow_other_students_grants(): void
    {
        $other = $this->user('student');
        $this->grant('n1', overrides: ['user_id' => $other->id]);
        $schedule = $this->schedule('n1');
        $playlist = $this->playlist('n1');
        $video = $this->video($playlist);
        $this->actingAs($this->student);
        foreach (['/api/student/class-schedules', '/api/student/replays'] as $url) {
            $this->getJson($url.'?user_id='.$other->id)->assertOk()->assertJsonCount(0, 'data');
            $this->json('GET', $url, ['user_id' => $other->id])->assertOk()->assertJsonCount(0, 'data');
        }
        foreach (['/api/student/class-schedules/'.$schedule->id, '/api/student/replay-playlists/'.$playlist->id] as $url) {
            $this->getJson($url.'?user_id='.$other->id)->assertForbidden()
                ->assertDontSee($schedule->meeting_url, false)->assertDontSee($video->video_url, false);
            $this->json('GET', $url, ['user_id' => $other->id])->assertForbidden()
                ->assertDontSee($schedule->meeting_url, false)->assertDontSee($video->video_url, false);
        }
        $this->actingAs($other)->getJson('/api/student/replay-playlists/'.$playlist->id.'?user_id='.$this->student->id)
            ->assertOk()->assertJsonPath('data.videos.0.video_url', $video->video_url);
    }

    public function test_generic_model_serialization_never_exposes_private_urls(): void
    {
        $schedule = $this->schedule();
        $playlist = $this->playlist();
        $video = $this->video($playlist);
        $this->assertArrayNotHasKey('meeting_url', $schedule->toArray());
        $this->assertArrayNotHasKey('video_url', $video->toArray());
        $this->assertStringNotContainsString($schedule->meeting_url, $schedule->toJson());
        $this->assertStringNotContainsString($video->video_url, $video->toJson());
        $this->assertStringNotContainsString($video->video_url, $playlist->load('videos')->toJson());
        $this->actingAs($this->admin)->getJson('/api/admin/class-schedules/'.$schedule->id)
            ->assertOk()->assertJsonPath('data.meeting_url', $schedule->meeting_url);
        $this->getJson('/api/admin/replay-videos/'.$video->id)->assertOk()->assertJsonPath('data.video_url', $video->video_url);
    }

    public function test_replay_consumes_effective_replay_levels_not_learning_or_source_grants(): void
    {
        $allowed = $this->playlist('n4');
        $denied = $this->playlist('n1');
        $this->video($allowed);
        $schedule = $this->schedule('n1');
        $student = $this->student;
        $this->mock(EntitlementService::class, function (MockInterface $mock) use ($student) {
            $mock->shouldReceive('effectiveAccess')->times(5)
                ->withArgs(fn (User $user) => $user->is($student))
                ->andReturn([
                    'learning' => array_fill_keys(['dasar', ...self::LEVELS], 'full'),
                    'replay_levels' => ['n4'],
                    'source_grants' => [],
                ]);
        });
        $this->actingAs($this->student)->getJson('/api/student/replays')->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $allowed->id)->assertJsonPath('data.0.program_id', $this->program('n4')->id);
        $this->getJson('/api/student/replay-playlists/'.$allowed->id)->assertOk()->assertJsonCount(1, 'data.videos');
        $this->getJson('/api/student/replay-playlists/'.$denied->id)->assertForbidden();
        $this->getJson('/api/student/class-schedules')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/student/class-schedules/'.$schedule->id)->assertForbidden();
    }

    public function test_live_consumes_exact_sensei_source_not_cumulative_replay_or_learning(): void
    {
        $exact = $this->schedule('n3');
        $lower = $this->schedule('n5');
        $lms = $this->schedule('n1');
        $student = $this->student;
        $this->mock(EntitlementService::class, function (MockInterface $mock) use ($student) {
            $mock->shouldReceive('effectiveAccess')->times(4)
                ->withArgs(fn (User $user) => $user->is($student))
                ->andReturn([
                    'learning' => array_fill_keys(['dasar', ...self::LEVELS], 'full'),
                    'replay_levels' => self::LEVELS,
                    'source_grants' => [
                        ['program_code' => 'n3', 'plan_code' => 'sensei'],
                        ['program_code' => 'n3', 'plan_code' => 'sensei'],
                        ['program_code' => 'n1', 'plan_code' => 'lms'],
                    ],
                ]);
        });
        $this->actingAs($this->student)->getJson('/api/student/class-schedules')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $exact->id);
        $this->getJson('/api/student/class-schedules/'.$exact->id)->assertOk();
        $this->getJson('/api/student/class-schedules/'.$lower->id)->assertForbidden();
        $this->getJson('/api/student/class-schedules/'.$lms->id)->assertForbidden();
    }

    public function test_no_persisted_per_level_access_flags_or_request_driven_access(): void
    {
        $flags = ['can_replay', 'can_zoom', 'live_access', 'replay_access', 'sensei_level', 'replay_levels', 'learning', 'source_grants'];
        foreach (Schema::getTableListing() as $table) {
            $this->assertDoesNotMatchRegularExpression('/(?:replay|access|live).*n[1-5]|n[1-5].*(?:replay|access|live)/i', $table);
            $this->assertNotContains(basename(str_replace('.', '/', $table)), $flags);
            foreach (Schema::getColumnListing($table) as $column) {
                $this->assertDoesNotMatchRegularExpression('/(?:replay|access|live).*n[1-5]|n[1-5].*(?:replay|access|live)/i', $column);
                $this->assertNotContains($column, $flags);
            }
        }
        $playlist = $this->playlist('n1');
        $schedule = $this->schedule('n1');
        $before = $this->student->fresh()->getAttributes();
        $this->actingAs($this->student)->getJson('/api/student/replays?replay_levels[]=n1&access=full')
            ->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/student/replay-playlists/'.$playlist->id.'?replay_n1=true')->assertForbidden();
        $this->getJson('/api/student/class-schedules/'.$schedule->id.'?live_n1=true')->assertForbidden();
        $this->assertSame($before, $this->student->fresh()->getAttributes());
        $this->assertSame(0, AccessGrant::where('user_id', $this->student->id)->count());
    }

    public function test_n3_sensei_regression_learning_dasar_through_n3_replay_n5_through_n3_live_n3_only(): void
    {
        $this->grant('n3');
        $access = app(EntitlementService::class)->effectiveAccess($this->student);
        foreach (['dasar', 'n5', 'n4', 'n3'] as $code) {
            $this->assertSame('full', $access['learning'][$code]);
            $chapter = Chapter::create(['program_id' => $this->program($code)->id, 'chapter_number' => 2, 'title' => 'Paid fixture chapter', 'status' => 'published']);
            $this->actingAs($this->student)->getJson('/api/student/programs/'.$chapter->program_id.'/chapters/'.$chapter->id)
                ->assertOk()->assertJsonPath('data.access', 'full');
        }
        $this->assertSame('preview', $access['learning']['n2']);
        $this->assertSame('preview', $access['learning']['n1']);
        $this->assertSame(['n5', 'n4', 'n3'], $access['replay_levels']);
        foreach (self::LEVELS as $code) {
            $this->schedule($code);
            $this->playlist($code);
        }
        $this->getJson('/api/student/replays')->assertOk()->assertJsonCount(3, 'data');
        $this->getJson('/api/student/class-schedules')->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.program_id', $this->program('n3')->id);
    }

    public static function malformedIds(): array
    {
        return array_map(fn ($id) => [$id], ['0', '-1', 'abc', '01', '9223372036854775808', '999999999999999999999999999999']);
    }

    #[DataProvider('malformedIds')]
    public function test_malformed_ids_return_not_found_without_url_leaks(string $id): void
    {
        $this->actingAs($this->admin);
        foreach (array_keys(self::MODELS) as $resource) {
            foreach (['GET', 'PATCH', 'DELETE'] as $method) {
                $this->json($method, '/api/admin/'.$resource.'/'.$id, ['title' => 'Invalid fixture'])->assertNotFound();
            }
        }
        $this->actingAs($this->student);
        foreach (['class-schedules', 'replay-playlists'] as $resource) {
            $this->getJson('/api/student/'.$resource.'/'.$id)->assertNotFound();
        }
    }
}
