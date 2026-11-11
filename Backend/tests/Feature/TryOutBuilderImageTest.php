<?php

namespace Tests\Feature;

use App\Models\TryOut;
use App\Models\TryOutPassage;
use App\Models\User;
use App\Services\ChapterAccessPolicy;
use App\Services\GamificationService;
use App\Services\MediaService;
use App\Services\TryOutAttemptService;
use App\Services\TryOutService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

require_once __DIR__.'/TryOutGrammarPassageTest.php';

class TryOutBuilderImageTest extends TryOutGrammarPassageTest
{
    private function installImageColumns(): void
    {
        foreach (['try_out_questions', 'try_out_passages'] as $table) {
            Schema::table($table, function (Blueprint $table) {
                $table->string('image')->nullable();
                $table->string('image_alt')->default('');
                $table->string('image_position')->default('before');
            });
        }
    }

    private function imageQuestion(string $session = 'grammar'): array
    {
        return ['session' => $session, 'question' => 'Choose', 'options' => ['A' => 'One', 'B' => 'Two', 'C' => 'Three', 'D' => 'Four'], 'correct_option' => 'A', 'point_value' => 1];
    }

    private function fixture(): TryOut
    {
        return TryOut::create(['program_id' => 1, 'title' => 'Images']);
    }

    private function rejectsImage(callable $operation, string $field = 'image'): void
    {
        try {
            $operation();
            $this->fail('Expected validation failure.');
        } catch (ValidationException $error) {
            $this->assertArrayHasKey($field, $error->errors());
        }
    }

    public function test_missing_and_partial_schema_reject_metadata_without_breaking_old_content(): void
    {
        $service = app(TryOutService::class);
        $parent = $this->fixture();
        $this->assertSame(['images' => false, 'decimal_points' => true], $service->builderCapabilities());
        $question = $service->saveQuestion($parent, $this->imageQuestion());
        $this->assertArrayNotHasKey('image', $service->adminQuestion($question));
        $this->assertSame([], $service->adminPassages($parent));
        foreach (['image', 'image_alt', 'image_position'] as $field) {
            $this->rejectsImage(fn () => $service->saveQuestion($parent, [$field => null], $question));
        }
        Schema::table('try_out_questions', fn (Blueprint $table) => $table->string('image')->nullable());
        $this->assertFalse($service->builderCapabilities()['images']);
        $fractional = $this->imageQuestion();
        $fractional['point_value'] = 1.75;
        $saved = $service->saveQuestion($parent, $fractional);
        $this->assertSame(1.75, $saved->fresh()->point_value);
        $fractional['point_value'] = 1.25;
        $this->assertSame(1.25, $service->saveQuestion($parent, $fractional)->fresh()->point_value);
        $fractional['point_value'] = 1.1;
        $this->rejectsImage(fn () => $service->saveQuestion($parent, $fractional), 'point_value');
        $this->rejectsImage(fn () => $service->saveQuestion($parent, ['image' => null], $question));
    }

    public function test_quarter_weights_round_trip_and_reject_other_fractions_through_sqlite_api(): void
    {
        $admin = new User;
        $admin->forceFill(['id' => 1, 'role' => 'admin', 'account_status' => 'active']);
        $this->actingAs($admin)->withoutMiddleware(\Laravel\Sanctum\Http\Middleware\AuthenticateSession::class);
        $parent = $this->fixture();
        $base = '/api/admin/try-outs/'.$parent->id;
        foreach ([1, 1.25, 1.5, 1.75, 179.25, 179.5, 179.75, 180] as $points) {
            \Illuminate\Support\Facades\RateLimiter::clear(md5('apiwrite:user:1'));
            $id = $this->postJson($base.'/questions', array_replace($this->imageQuestion(), ['point_value' => $points]))
                ->assertCreated()->assertJsonPath('data.point_value', $points)->json('data.id');
            $this->assertSame($points, $parent->questions()->findOrFail($id)->point_value);
        }
        foreach ([0.25, 0.5, 0.75, 1.1, 1.2, 1.3, 1.6, 1.9, 180.25, 181, true, null, 'bad'] as $points) {
            \Illuminate\Support\Facades\RateLimiter::clear(md5('apiwrite:user:1'));
            $this->postJson($base.'/questions', array_replace($this->imageQuestion(), ['point_value' => $points]))
                ->assertUnprocessable()->assertJsonValidationErrors('point_value');
            $this->patchJson($base.'/questions/'.$id, ['point_value' => $points])
                ->assertUnprocessable()->assertJsonValidationErrors('point_value');
        }
        $this->patchJson($base.'/questions/'.$id, ['point_value' => 2.25])->assertOk()->assertJsonPath('data.point_value', 2.25);
        $this->getJson($base)->assertOk()->assertJsonPath('data.questions.7.point_value', 2.25);
    }

    public function test_checkpoint_decimal_capability_and_integer_validation_remain_unchanged(): void
    {
        $service = app(\App\Services\CheckpointPackageService::class);
        $parent = \App\Models\CheckpointPackage::create(['program_id' => 1, 'title' => 'Integer checkpoint']);
        $this->assertFalse($service->builderCapabilities()['decimal_points']);
        $question = $service->saveQuestion($parent, $this->imageQuestion());
        $this->assertSame(1, $question->fresh()->point_value);
        foreach ([1.25, 1.5, 1.75] as $points) {
            $this->rejectsImage(fn () => $service->saveQuestion($parent, ['point_value' => $points], $question), 'point_value');
        }
        $this->assertSame(1, $question->fresh()->point_value);
    }

    public function test_real_storage_image_rules_all_sessions_reload_clear_and_alt_validation(): void
    {
        $this->installImageColumns();
        config(['media.disk' => 'public']);
        Storage::fake('public');
        $path = 'media/image/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png';
        // Real PNG bytes, not a file-extension-only fake.
        Storage::disk('public')->put($path, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII='));
        $service = app(TryOutService::class);
        $parent = $this->fixture();
        $this->assertTrue($service->builderCapabilities()['images']);
        foreach (array_keys(TryOutService::SESSIONS) as $session) {
            $question = $service->saveQuestion($parent, $this->imageQuestion($session) + ['image' => $path, 'image_alt' => 'Diagram']);
            $payload = $service->adminQuestion($question->fresh());
            $this->assertSame($path, $payload['image']);
            $this->assertNotEmpty($payload['image_resolved_url']);
            $service->saveQuestion($parent, ['question' => 'Changed'], $question);
            $this->assertSame('Diagram', $question->fresh()->image_alt);
            $service->saveQuestion($parent, ['image' => null, 'image_alt' => null], $question);
            $this->assertNull($question->fresh()->image);
            $this->assertSame('', $question->fresh()->image_alt);
        }
        foreach (['../bad.png', 'javascript:alert(1)', 'https://user:pass@example.test/image.png', 'media/missing.png', 'https://example.test/audio.mp3'] as $image) {
            $this->rejectsImage(fn () => $service->saveQuestion($parent, $this->imageQuestion() + ['image' => $image, 'image_alt' => 'Invalid']));
        }
        $this->rejectsImage(fn () => $service->saveQuestion($parent, $this->imageQuestion() + ['image' => 'https://example.test/image.png']), 'image_alt');
        $service->saveQuestion($parent, $this->imageQuestion() + ['image' => 'https://example.test/image.png', 'image_alt' => 'Remote']);
    }

    public function test_position_contract_default_update_clear_and_invalid_values(): void
    {
        $this->installImageColumns();
        $service = app(TryOutService::class);
        $parent = $this->fixture();
        $question = $service->saveQuestion($parent, $this->imageQuestion());
        $this->assertSame('before', $question->image_position);
        $revision = $service->studioRevision($parent);
        $service->saveQuestion($parent, ['image_position' => 'after'], $question);
        $this->assertSame('after', $service->adminQuestion($question->fresh())['image_position']);
        $this->assertNotSame($revision, $service->studioRevision($parent));
        $this->rejectsImage(fn () => $service->saveQuestion($parent, ['image_position' => 'left'], $question), 'image_position');
        $service->saveQuestion($parent, ['image_position' => null], $question);
        $this->assertSame('before', $question->fresh()->image_position);
    }

    public function test_uploader_validates_real_bytes_and_preserves_storage_on_rejection(): void
    {
        config(['media.disk' => 'public']);
        Storage::fake('public');
        $media = app(MediaService::class);
        $bytes = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=');
        $upload = $media->upload(UploadedFile::fake()->createWithContent('diagram.png', $bytes), 'image');
        $this->assertSame('image/png', $upload['mime_type']);
        $this->assertTrue($media->valid($upload['path'], 'image'));
        foreach ([['spoof.png', 'not an image'], ['wrong.jpg', $bytes]] as [$name, $content]) {
            $this->rejectsImage(fn () => $media->upload(UploadedFile::fake()->createWithContent($name, $content), 'image'), 'file');
        }
        $this->assertSame([$upload['path']], Storage::disk('public')->allFiles());
    }

    public function test_passage_media_invalidated_before_lock_is_rejected_and_rolled_back(): void
    {
        $this->installImageColumns();
        config(['media.disk' => 'public']);
        Storage::fake('public');
        $path = app(MediaService::class)->upload(UploadedFile::fake()->createWithContent('diagram.png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=')), 'image')['path'];
        $this->app->instance(MediaService::class, new class($path) extends MediaService
        {
            public function __construct(private string $path) {}

            public function locked(callable $operation): mixed
            {
                Storage::disk('public')->delete($this->path);

                return DB::transaction($operation);
            }
        });
        $service = app(TryOutService::class);
        $parent = $this->fixture();
        $revision = $service->studioRevision($parent);
        $this->rejectsImage(fn () => $service->saveStudio($parent, [
            'revision' => $revision, 'settings' => ['title' => 'Must roll back'],
            'passages' => [['id' => 'group', 'title' => 'Group', 'body' => 'Body', 'image' => $path, 'image_alt' => 'Diagram']],
            'questions' => [], 'deleted_question_ids' => [], 'deleted_passage_ids' => [],
        ]));
        $this->assertSame($revision, $service->studioRevision($parent));
        $this->assertSame(0, TryOutPassage::count());
    }

    public function test_group_image_studio_revision_snapshot_and_historical_retention(): void
    {
        $this->installImageColumns();
        $service = app(TryOutService::class);
        $parent = $this->fixture();
        $image = 'https://example.test/group.png';
        $input = ['revision' => $service->studioRevision($parent), 'settings' => ['title' => 'Images'], 'passages' => [['id' => 'group', 'title' => 'Group', 'body' => 'Body', 'image' => $image, 'image_alt' => 'Group diagram', 'image_position' => 'after']], 'questions' => [], 'deleted_question_ids' => [], 'deleted_passage_ids' => []];
        foreach (['one', 'two'] as $id) {
            $input['questions'][] = ['id' => $id, 'content' => $this->imageQuestion() + ['passage_id' => 'group', 'status' => 'published', 'image' => $image, 'image_alt' => 'Question diagram']];
        }
        $service->saveStudio($parent, $input);
        $this->assertSame($image, $service->adminPassages($parent)[0]['image']);
        $this->assertNotSame($input['revision'], $service->studioRevision($parent));
        foreach (['vocabulary_kanji', 'reading', 'audio'] as $session) {
            $service->saveQuestion($parent, $this->imageQuestion($session) + ['status' => 'published', 'audio_url' => $session === 'audio' ? 'https://example.test/audio.mp3' : null]);
        }
        $parent->update(['status' => 'published', 'max_score' => 5]);
        $attempts = new class(app(ChapterAccessPolicy::class), $service) extends TryOutAttemptService
        {
            public function authorize(User $user, Model $tryOut, ?Model $attempt = null): void {}
        };
        $user = new User;
        $user->id = 1;
        $attempt = $attempts->start($user, $parent);
        $this->app->instance(GamificationService::class, new class extends GamificationService
        {
            public function lock(User $user): void {}

            public function award(User $user, string $key, int $points): void {}
        });
        $saved = $attempts->save($user, $parent, $attempt, [], 0);
        try {
            $attempts->save($user, $parent, $attempt, [], 0);
            $this->fail('Stale autosave must fail.');
        } catch (HttpException $error) {
            $this->assertSame(409, $error->getStatusCode());
        }
        $completed = $attempts->submit($user, $parent, $saved, 1);
        $this->assertSame($completed->revision, $attempts->submit($user, $parent, $completed, 0)->revision);
        $timed = $attempts->start($user, $parent);
        DB::table('try_out_attempts')->where('id', $timed->id)->update(['expires_at' => now()->subSecond()]);
        $automatic = $attempts->refresh($user, $parent, $timed);
        $this->assertSame('completed', $automatic->status);
        $this->assertSame($automatic->revision, $attempts->submit($user, $parent, $timed, 0)->revision);
        // Keep an in-progress snapshot for immutability checks; lifecycle itself is unchanged.
        $attempt = $attempts->start($user, $parent);
        $before = $attempt->getAttributes();
        $ownership = app(TryOutAttemptService::class);
        $other = new User;
        $other->id = 2;
        $other->role = 'student';
        $other->account_status = 'active';
        try {
            $ownership->authorize($other, $parent, $attempt);
            $this->fail('Attempt ownership must fail before entitlement lookup.');
        } catch (HttpException $error) {
            $this->assertSame(404, $error->getStatusCode());
        }
        $tainted = $attempt->replicate();
        $grading = $tainted->grading_snapshot;
        foreach ($grading['passages'] as &$passage) {
            $passage['correct_option'] = 'SECRET';
        }
        unset($passage);
        $tainted->grading_snapshot = $grading;
        $this->assertArrayNotHasKey('correct_option', collect($attempts->payload($tainted)['questions'])->firstWhere('session', 'grammar')['passage']);
        $grammar = collect($attempts->payload($attempt)['questions'])->firstWhere('session', 'grammar');
        $this->assertSame($image, $grammar['image']);
        $this->assertSame($image, $grammar['passage']['image']);
        $this->assertSame('after', $grammar['passage']['image_position']);
        $this->assertSame('before', $grammar['image_position']);
        $this->assertArrayNotHasKey('correct_option', $grammar);
        $this->assertArrayNotHasKey('explanation', $grammar);
        TryOutPassage::query()->update(['image' => null]);
        $parent->questions()->update(['image' => null]);
        $this->assertSame($before, $attempt->fresh()->getAttributes());
        $guard = new class extends MediaService
        {
            public function check(string $path): void
            {
                $this->assertTryOutImagesUnreferenced($path);
            }
        };
        try {
            $guard->check($image);
            $this->fail('Historical passage image must retain media.');
        } catch (HttpException $error) {
            $this->assertSame(409, $error->getStatusCode());
        }
        DB::table('try_out_attempts')->update(['grading_snapshot' => '{}']);
        try {
            $guard->check($image);
            $this->fail('Historical question image must retain media.');
        } catch (HttpException $error) {
            $this->assertSame(409, $error->getStatusCode());
        }
        DB::table('try_out_attempts')->update(['content_snapshot' => '[]']);
        $guard->check($image);
        $this->assertTrue(true);
    }
}
