<?php

namespace Tests\Feature;

use App\Models\Chapter;
use App\Models\Program;
use App\Models\User;
use App\Services\LearningProgressService;
use App\Services\ProgramAchievementService;
use App\Support\DatabaseSafety;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ProgramAchievementApiTest extends TestCase
{
    private array $createdRows = [];

    private array $ownedUsers = [];

    private array $ownedPrograms = [];

    public function createApplication()
    {
        if (getenv('HIRU_DISPOSABLE_TESTING') !== '1') {
            throw new \RuntimeException('Disposable testing opt-in required.');
        }
        $app = parent::createApplication();
        $this->assertSafeTarget();

        return $app;
    }

    private function assertSafeTarget(): void
    {
        $config = DB::connection()->getConfig();
        if (getenv('HIRU_DISPOSABLE_TESTING') !== '1'
            || ! app()->environment('testing') || app()->configurationIsCached()
            || ($config['host'] ?? null) !== '127.0.0.1'
            || (string) ($config['port'] ?? '') !== '55432'
            || ($config['username'] ?? null) !== 'hiru_test_runner'
            || ($config['database'] ?? null) !== 'hiru_academy_test'
            || getenv('HIRU_TEST_SCHEMA') !== 'hiru_backend_test_gamification_final_20261008'
            || DB::selectOne('SELECT current_schema() AS name')->name !== 'hiru_backend_test_gamification_final_20261008') {
            throw new \RuntimeException('Program achievement API target rejected.');
        }
        DatabaseSafety::assertTarget(true);
    }

    protected function tearDown(): void
    {
        try {
            while (DB::transactionLevel() > 0) {
                DB::rollBack();
            }
            $this->assertSafeTarget();
            DB::transaction(function (): void {
                foreach ($this->ownedUsers as $id => $email) {
                    if (! str_ends_with($email, '@example.test') || ! Str::isUuid(substr($email, 0, -13))
                        || DB::table('users')->where('id', $id)->where('email', '!=', $email)->exists()) {
                        throw new \RuntimeException('Synthetic user cleanup ownership rejected.');
                    }
                }
                foreach ($this->ownedPrograms as $id => $slug) {
                    if (! str_starts_with($slug, 'c4a-') || ! Str::isUuid(substr($slug, 4))
                        || DB::table('programs')->where('id', $id)->where('slug', '!=', $slug)->exists()) {
                        throw new \RuntimeException('Synthetic program cleanup ownership rejected.');
                    }
                }
                $users = array_keys($this->ownedUsers);
                if (DB::table('program_achievements')->whereIn('user_id', $users)
                    ->whereNotIn('program_id', array_keys($this->ownedPrograms))->exists()) {
                    throw new \RuntimeException('Achievement cleanup program ownership rejected.');
                }
                // Capture exact service-created IDs only under verified synthetic owners.
                foreach (['program_achievements', 'gamification_rewards', 'gamification_days', 'activity_completions', 'learning_attempts'] as $table) {
                    $ids = DB::table($table)->whereIn('user_id', $users)->pluck('id')->all();
                    DB::table($table)->whereIn('user_id', $users)->whereIn('id', $ids)->delete();
                    $this->assertSame(0, DB::table($table)->whereIn('id', $ids)->count());
                }
                foreach (array_keys($this->ownedPrograms) as $programId) {
                    $ids = DB::table('program_achievement_settings')->where('program_id', $programId)->pluck('id')->all();
                    DB::table('program_achievement_settings')->where('program_id', $programId)->whereIn('id', $ids)->delete();
                    $this->assertSame(0, DB::table('program_achievement_settings')->whereIn('id', $ids)->count());
                }
                foreach (array_reverse($this->createdRows) as [$table, $id]) {
                    DB::table($table)->where('id', $id)->delete();
                }
                foreach ($this->createdRows as [$table, $id]) {
                    $this->assertFalse(DB::table($table)->where('id', $id)->exists(), 'Synthetic fixture remains: '.$table.'#'.$id);
                }
            });
        } finally {
            parent::tearDown();
        }
    }

    public function test_admin_settings_require_authentication_and_admin_role(): void
    {
        $program = $this->program();
        $this->getJson('/api/admin/program-achievements')->assertUnauthorized();
        $this->patchJson('/api/admin/program-achievements/'.$program->id, ['automatic_enabled' => false])->assertUnauthorized();
        $this->authenticate($this->user());
        $this->getJson('/api/admin/program-achievements')->assertForbidden();
        $this->patchJson('/api/admin/program-achievements/'.$program->id, ['automatic_enabled' => false])->assertForbidden();
        $this->getJson('/api/admin/program-achievements/'.$program->id.'/preview')->assertForbidden();
    }

    public function test_global_certificate_issuer_requires_admin_and_supports_upload_replace_position_and_removal(): void
    {
        $url = '/api/admin/certificate-issuer';
        $this->getJson($url)->assertUnauthorized();
        $this->postJson($url, [])->assertUnauthorized();
        $this->authenticate($this->user());
        $this->getJson($url)->assertForbidden();
        $this->postJson($url, [])->assertForbidden();
        $this->authenticate($this->user('admin'));
        // Global fixture changes never escape this transaction.
        DB::beginTransaction();
        try {
            DB::table('certificate_issuer_settings')->where('id', 1)->update(['signature_data_url' => null, 'signature_position' => 'bottom-right']);
            $this->getJson($url)->assertOk()->assertExactJson(['data' => ['signature_data_url' => null, 'signature_position' => 'bottom-right']]);
            $first = null;
            foreach ([20, 40] as $start) {
                $image = imagecreatetruecolor(600, 200);
                imagealphablending($image, false);
                imagesavealpha($image, true);
                imagefill($image, 0, 0, imagecolorallocatealpha($image, 255, 255, 255, 127));
                imageline($image, $start, 100, 560, 120, imagecolorallocatealpha($image, 0, 0, 0, 0));
                ob_start();
                imagepng($image);
                $bytes = ob_get_clean();
                imagedestroy($image);
                $file = \Illuminate\Http\UploadedFile::fake()->createWithContent('signature.png', $bytes);
                $data = $this->post($url, ['signature' => $file, 'signature_position' => 'bottom-left'], ['Accept' => 'application/json'])
                    ->assertOk()->assertJsonPath('data.signature_position', 'bottom-left')->json('data');
                $this->assertStringStartsWith('data:image/png;base64,', $data['signature_data_url']);
                if ($first !== null) {
                    $this->assertNotSame($first, $data['signature_data_url']);
                }
                $first = $data['signature_data_url'];
            }
            $this->postJson($url, ['signature_position' => 'bottom-right'])->assertOk()->assertJsonPath('data.signature_data_url', $first);
            foreach ([['signature_position' => 'top-left'], ['remove_signature' => 'yes'], ['signature_data_url' => 'data:image/png;base64,bad']] as $input) {
                $this->postJson($url, $input)->assertUnprocessable()->assertJsonValidationErrors(array_keys($input));
            }
            $this->post($url, ['signature' => \Illuminate\Http\UploadedFile::fake()->createWithContent('fake.png', '<svg/>')], ['Accept' => 'application/json'])
                ->assertUnprocessable()->assertJsonValidationErrors('signature');
            $this->post($url, ['signature' => $file, 'remove_signature' => '1'], ['Accept' => 'application/json'])
                ->assertUnprocessable()->assertJsonValidationErrors('signature');
            $this->getJson($url)->assertOk()->assertJsonPath('data.signature_data_url', $first);
            $this->postJson($url, ['remove_signature' => true])->assertOk()
                ->assertExactJson(['data' => ['signature_data_url' => null, 'signature_position' => 'bottom-right']]);
        } finally {
            DB::rollBack();
        }
    }

    public function test_program_defaults_on_and_explicit_off_is_scoped_to_one_program(): void
    {
        $first = $this->program();
        $second = $this->program();
        $this->authenticate($this->user('admin'));
        foreach ([$first, $second] as $program) {
            $this->getJson('/api/admin/program-achievements/'.$program->id.'/preview')->assertOk()
                ->assertJsonPath('data.program.id', $program->id)
                ->assertJsonPath('data.settings.automatic_enabled', true)->assertJsonPath('data.is_default', true);
        }
        $this->patchJson('/api/admin/program-achievements/'.$first->id, ['automatic_enabled' => false, 'title' => 'Completion title', 'description' => 'Completion description'])
            ->assertOk()->assertJsonPath('data.settings.automatic_enabled', false)->assertJsonPath('data.is_default', false)
            ->assertJsonPath('data.settings.title', 'Completion title')->assertJsonPath('data.settings.description', 'Completion description');
        $this->getJson('/api/admin/program-achievements/'.$first->id.'/preview')->assertOk()->assertJsonPath('data.settings.automatic_enabled', false);
        $this->getJson('/api/admin/program-achievements/'.$second->id.'/preview')->assertOk()->assertJsonPath('data.settings.automatic_enabled', true);
        $this->patchJson('/api/admin/program-achievements/'.$second->id, ['automatic_enabled' => true])->assertOk()
            ->assertJsonPath('data.settings.automatic_enabled', true)->assertJsonPath('data.is_default', false);
        $new = $this->program();
        $this->getJson('/api/admin/program-achievements/'.$new->id.'/preview')->assertOk()->assertJsonPath('data.settings.automatic_enabled', true);
        $rows = $this->getJson('/api/admin/program-achievements?per_page=100')->assertOk()->assertJsonStructure(['data', 'meta' => ['current_page', 'last_page', 'total', 'per_page']])->json('data');
        $this->assertContains($new->id, array_column(array_column($rows, 'program'), 'id'));
        $this->getJson('/api/admin/program-achievements?per_page=101')->assertUnprocessable()->assertJsonValidationErrors('per_page');
        $missing = (int) DB::table('programs')->max('id') + 100000;
        $this->getJson('/api/admin/program-achievements/'.$missing.'/preview')->assertNotFound();
        $this->patchJson('/api/admin/program-achievements/'.$missing, ['automatic_enabled' => false])->assertNotFound();
    }

    public function test_settings_reject_invalid_text_and_unsafe_or_unsupported_media(): void
    {
        $program = $this->program();
        $this->authenticate($this->user('admin'));
        foreach ([['title' => ''], ['title' => ['bad']], ['title' => '<script>alert(1)</script>'], ['description' => ['bad']], ['description' => '<img src=x onerror=alert(1)>'], ['automatic_enabled' => 'no'], ['background_image' => 'javascript:alert(1)'], ['background_image' => 'https://example.test/background.png'], ['presentation_version' => 99]] as $payload) {
            $this->patchJson('/api/admin/program-achievements/'.$program->id, $payload)
                ->assertUnprocessable()->assertJsonValidationErrors(array_keys($payload));
        }
        $this->assertFalse(DB::table('program_achievement_settings')->where('program_id', $program->id)->exists());
    }

    public function test_student_collection_detail_are_private_safe_and_snapshot_immutable(): void
    {
        $user = $this->user();
        $program = $this->program();
        $this->eligible($user, $program);
        $this->authenticate($this->user('admin'));
        $this->patchJson('/api/admin/program-achievements/'.$program->id, ['title' => 'Original title', 'description' => 'Original description'])->assertOk();
        $issuer = $this->createMock(\App\Services\CertificateIssuerSettings::class);
        $issuer->method('resolve')->willReturn(['signature_data_url' => null, 'signature_position' => 'bottom-left']);
        $this->app->instance(\App\Services\CertificateIssuerSettings::class, $issuer);
        $issued = app(ProgramAchievementService::class)->issue($user, $program);
        $this->assertSame('issued', $issued['reason']);
        $award = $issued['achievement'];
        $this->assertNotEmpty($award->completion_evidence_snapshot);
        $this->authenticate($user);
        $before = $this->getJson('/api/student/program-achievements/'.$award->id)->assertOk()->json('data');
        $this->assertSame($user->name, $before['student_name_snapshot']);
        $this->assertSame($program->name, $before['program_name_snapshot']);
        $this->assertSame('Original title', $before['presentation_snapshot']['title']);
        $this->assertSame('Original description', $before['presentation_snapshot']['description']);
        $this->assertSame('HiruAcademy', $before['presentation_snapshot']['issuer']);
        $this->assertSame('bottom-left', $before['presentation_snapshot']['signature_position']);
        $this->app->forgetInstance(\App\Services\CertificateIssuerSettings::class);
        $this->assertSame(['id', 'program_id', 'student_name_snapshot', 'program_name_snapshot', 'program_code_snapshot', 'learning_type_snapshot', 'presentation_snapshot', 'issued_at'], array_keys($before));
        $this->assertNull($before['presentation_snapshot']['background_image']);
        $this->assertNotEmpty($before['issued_at']);
        $collection = $this->getJson('/api/student/program-achievements')->assertOk()->assertJsonPath('meta.total', 1)->json('data');
        $this->assertSame([$before], $collection);
        $this->authenticate($this->user('admin'));
        $this->patchJson('/api/admin/program-achievements/'.$program->id, ['automatic_enabled' => false, 'title' => 'Changed title', 'description' => 'Changed description'])->assertOk();
        $this->patchJson('/api/admin/programs/'.$program->id, ['name' => 'Renamed synthetic program '.Str::uuid()])->assertOk();
        $user->update(['name' => 'Renamed synthetic student']);
        $this->authenticate($user);
        $this->assertSame($before, $this->getJson('/api/student/program-achievements/'.$award->id)->assertOk()->json('data'));
        $this->authenticate($this->user());
        $this->getJson('/api/student/program-achievements/'.$award->id)->assertNotFound();
        $this->getJson('/api/student/program-achievements')->assertOk()->assertJsonCount(0, 'data')->assertJsonPath('meta.total', 0);
        $this->getJson('/api/student/program-achievements?user_id='.$user->id)->assertUnprocessable()->assertJsonValidationErrors('user_id');
    }

    public function test_empty_collection_pagination_and_student_authorization(): void
    {
        $program = $this->program();
        $this->getJson('/api/student/program-achievements')->assertUnauthorized();
        $this->postJson('/api/student/program-achievements/programs/'.$program->id.'/reconcile', [])->assertUnauthorized();
        $this->authenticate($this->user('admin'));
        $this->getJson('/api/student/program-achievements')->assertForbidden();
        $this->postJson('/api/student/program-achievements/programs/'.$program->id.'/reconcile', [])->assertForbidden();
        $this->authenticate($this->user());
        $this->getJson('/api/student/program-achievements?page=2&per_page=1')->assertOk()->assertExactJson([
            'data' => [], 'meta' => ['current_page' => 2, 'last_page' => 1, 'total' => 0, 'per_page' => 1],
        ]);
        foreach (['page=0', 'per_page=0', 'per_page=101'] as $query) {
            $this->getJson('/api/student/program-achievements?'.$query)->assertUnprocessable();
        }
    }

    public function test_reconcile_issues_only_authenticated_users_selected_program_and_is_idempotent(): void
    {
        $user = $this->user();
        $otherUser = $this->user();
        $program = $this->program();
        $otherProgram = $this->program();
        $this->eligible($user, $program);
        $this->eligible($user, $otherProgram);
        $this->authenticate($user);
        $this->getJson('/api/student/program-achievements')->assertOk()->assertJsonCount(0, 'data');
        $this->assertSame(0, DB::table('program_achievements')->where('user_id', $user->id)->count());
        $url = '/api/student/program-achievements/programs/'.$program->id.'/reconcile';
        $this->postJson($url, ['user_id' => $otherUser->id])->assertUnprocessable()->assertJsonValidationErrors('user_id');
        $this->postJson($url, ['program_id' => $otherProgram->id])->assertUnprocessable()->assertJsonValidationErrors('program_id');
        $this->assertSame(0, DB::table('program_achievements')->whereIn('user_id', [$user->id, $otherUser->id])->count());
        $issued = $this->postJson($url)->assertOk()->assertJsonPath('reason', 'issued')
            ->assertJsonPath('data.program_id', $program->id)->json('data');
        $this->assertIsInt($issued['id']);
        $this->assertSame(0, DB::transactionLevel());
        $this->assertSame($issued, $this->postJson($url)->assertOk()->assertJsonPath('reason', 'existing')->json('data'));
        $this->assertSame(1, DB::table('program_achievements')->where('user_id', $user->id)->count());
        $this->assertFalse(DB::table('program_achievements')->where('user_id', $user->id)->where('program_id', $otherProgram->id)->exists());
        $this->assertFalse(DB::table('program_achievements')->where('user_id', $otherUser->id)->exists());
        $this->authenticate($otherUser);
        $this->postJson($url)->assertNotFound();
        $missing = (int) DB::table('programs')->max('id') + 100000;
        $this->postJson('/api/student/program-achievements/programs/'.$missing.'/reconcile')->assertNotFound();
        $this->postJson('/api/student/program-achievements/programs/not-an-id/reconcile')->assertNotFound();
        $this->assertFalse(DB::table('program_achievements')->where('user_id', $otherUser->id)->exists());
    }

    public function test_explicit_off_prevents_http_reconcile_without_disabling_other_program(): void
    {
        $user = $this->user();
        $program = $this->program();
        $other = $this->program();
        $this->eligible($user, $program);
        $this->eligible($user, $other);
        $this->authenticate($this->user('admin'));
        $this->patchJson('/api/admin/program-achievements/'.$program->id, ['automatic_enabled' => false])->assertOk();
        $this->authenticate($user);
        $this->postJson('/api/student/program-achievements/programs/'.$program->id.'/reconcile')->assertOk()->assertJsonPath('reason', 'disabled')->assertJsonPath('data', null);
        $this->postJson('/api/student/program-achievements/programs/'.$other->id.'/reconcile')->assertOk()->assertJsonPath('reason', 'issued')->assertJsonPath('data.program_id', $other->id);
        $this->assertFalse(DB::table('program_achievements')->where('user_id', $user->id)->where('program_id', $program->id)->exists());
    }

    public function test_reconcile_returns_incomplete_and_unresolved_without_creating_history(): void
    {
        $user = $this->user();
        $program = $this->program();
        $this->eligible($user, $program);
        $chapterId = $this->insert('chapters', ['program_id' => $program->id, 'chapter_number' => 2, 'title' => 'Uncompleted synthetic chapter', 'status' => 'published']);
        $this->insert('video_lessons', ['chapter_id' => $chapterId, 'status' => 'published', 'title' => 'Uncompleted synthetic video', 'video_url' => 'https://example.test/uncompleted']);
        $this->authenticate($user);
        $url = '/api/student/program-achievements/programs/'.$program->id.'/reconcile';
        $this->postJson($url)->assertOk()->assertJsonPath('reason', 'incomplete')->assertJsonPath('data', null);
        $this->insert('audio_questions', ['chapter_id' => $chapterId, 'status' => 'published', 'question' => 'Unsupported synthetic audio', 'options' => json_encode(['A' => 'One', 'B' => 'Two', 'C' => 'Three', 'D' => 'Four']), 'correct_option' => 'A', 'explanation' => 'Synthetic explanation', 'audio_url' => 'https://example.test/audio.mp3']);
        $this->postJson($url)->assertOk()->assertJsonPath('reason', 'policy_unresolved')->assertJsonPath('data', null);
        $this->assertFalse(DB::table('program_achievements')->where('user_id', $user->id)->exists());
        $this->getJson('/api/student/program-achievements')->assertOk()->assertJsonCount(0, 'data');
    }

    public static function outOfRangeRoutes(): array
    {
        $id = '999999999999999999999999999999999';

        return [
            'student detail' => ['student', 'GET', '/api/student/program-achievements/'.$id],
            'student reconcile' => ['student', 'POST', '/api/student/program-achievements/programs/'.$id.'/reconcile'],
            'admin preview' => ['admin', 'GET', '/api/admin/program-achievements/'.$id.'/preview'],
        ];
    }

    #[DataProvider('outOfRangeRoutes')]
    public function test_out_of_range_route_ids_return_not_found_without_database_errors(string $role, string $method, string $url): void
    {
        $this->authenticate($this->user($role));
        $this->json($method, $url)->assertNotFound();
    }

    private function authenticate(User $user): void
    {
        $this->app['session']->flush();
        $this->app['auth']->forgetGuards();
        $this->actingAs($user, 'web');
    }

    private function user(string $role = 'student'): User
    {
        $user = User::forceCreate(['name' => 'Synthetic API '.$role, 'email' => Str::uuid().'@example.test', 'whatsapp' => '+628'.random_int(1000000000, 9999999999), 'password' => 'synthetic-password-only', 'role' => $role, 'account_status' => 'active']);
        $this->createdRows[] = ['users', $user->id];
        $this->ownedUsers[$user->id] = $user->email;

        return $user;
    }

    private function program(): Program
    {
        $program = Program::forceCreate(['code' => 'c4a-'.Str::uuid(), 'slug' => 'c4a-'.Str::uuid(), 'name' => 'Synthetic API program '.Str::uuid(), 'family' => 'interview', 'status' => 'active', 'sort_order' => 0]);
        $this->createdRows[] = ['programs', $program->id];
        $this->ownedPrograms[$program->id] = $program->slug;

        return $program;
    }

    private function eligible(User $user, Program $program): void
    {
        $this->insert('program_offers', ['program_id' => $program->id, 'plan_code' => 'lms', 'duration_months' => 1, 'status' => 'active']);
        $this->insert('access_grants', ['user_id' => $user->id, 'program_id' => $program->id, 'plan_code' => 'lms', 'status' => 'active', 'starts_at' => now()->toDateString(), 'ends_at' => now()->addDays(10)->toDateString()]);
        $chapterId = $this->insert('chapters', ['program_id' => $program->id, 'chapter_number' => 1, 'title' => 'Synthetic API chapter', 'status' => 'published']);
        $videoId = $this->insert('video_lessons', ['chapter_id' => $chapterId, 'status' => 'published', 'title' => 'Synthetic video', 'video_url' => 'https://example.test/video']);
        // Record real progress without automatic reconciliation; HTTP reconcile must issue itself.
        $this->assertSame(0, DB::transactionLevel());
        DB::transaction(fn () => app(LearningProgressService::class)->record($user, Chapter::findOrFail($chapterId), 'video', $videoId));
        $this->assertSame(0, DB::transactionLevel());
        $this->assertSame(0, DB::table('program_achievements')->where('user_id', $user->id)->where('program_id', $program->id)->count());
    }

    private function insert(string $table, array $attributes): int
    {
        $id = DB::table($table)->insertGetId($attributes + ['created_at' => now(), 'updated_at' => now()]);
        $this->createdRows[] = [$table, $id];

        return $id;
    }
}
