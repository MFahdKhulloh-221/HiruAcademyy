<?php

namespace Tests\Feature;

use App\Models\CheckpointPackage;
use App\Models\TryOut;
use App\Models\TryOutPassage;
use App\Models\User;
use App\Services\ChapterAccessPolicy;
use App\Services\CheckpointPackageService;
use App\Services\MediaService;
use App\Services\TryOutAttemptService;
use App\Services\TryOutService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

require_once __DIR__.'/TryOutGrammarPassageTest.php';

class TryOutPassageBlocksTest extends TryOutGrammarPassageTest
{
    protected function setUp(): void
    {
        parent::setUp();
        (require database_path('migrations/2026_11_11_120001_add_blocks_to_try_out_passages_table.php'))->up();
        foreach (['try_out_questions', 'try_out_passages'] as $table) {
            Schema::table($table, function (Blueprint $table) {
                $table->string('image')->nullable();
                $table->string('image_alt')->default('');
                $table->string('image_position')->default('before');
            });
        }
        config(['media.disk' => 'public']);
        Storage::fake('public');
    }

    private function input(TryOut $parent, mixed $blocks): array
    {
        return ['revision' => app(TryOutService::class)->studioRevision($parent), 'settings' => ['title' => $parent->title],
            'passages' => [['id' => 'group', 'title' => 'Group', 'body' => '<p>Legacy fallback</p>', 'blocks' => $blocks]],
            'questions' => [], 'deleted_question_ids' => [], 'deleted_passage_ids' => []];
    }

    private function blocks(string $image): array
    {
        return [['type' => 'text', 'text' => '<p>Before <ruby>日<rt>にち</rt></ruby></p><script>alert(1)</script>'],
            ['type' => 'image', 'image' => $image, 'image_alt' => 'Diagram'], ['type' => 'text', 'text' => '<p>After</p>']];
    }

    private function guard(): MediaService
    {
        return new class extends MediaService
        {
            public function check(string $path): void
            {
                $this->assertTryOutImagesUnreferenced($path);
            }
        };
    }

    private function retained(string $path): void
    {
        try {
            $this->guard()->check($path);
            $this->fail('Referenced media must not be deletable.');
        } catch (HttpException $error) {
            $this->assertSame(409, $error->getStatusCode());
        }
        Storage::disk('public')->assertExists($path);
    }

    public function test_order_storage_resolution_snapshot_retention_and_stale_revision(): void
    {
        $path = 'media/image/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png';
        Storage::disk('public')->put($path, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII='));
        $service = app(TryOutService::class);
        $parent = TryOut::create(['program_id' => 1, 'title' => 'Blocks']);
        $input = $this->input($parent, $this->blocks($path));
        $service->saveStudio($parent, $input);
        $passage = TryOutPassage::firstOrFail();
        $stored = $passage->blocks;
        $this->assertSame(['text', 'image', 'text'], array_column($stored, 'type'));
        $this->assertStringNotContainsString('<script>', $stored[0]['text']);
        $this->assertStringContainsString('<ruby>', $stored[0]['text']);
        $this->assertSame($path, $stored[1]['image']);
        $this->assertArrayNotHasKey('image_resolved_url', $stored[1]);
        $this->assertSame('<p>Legacy fallback</p>', $passage->body);
        $payload = $service->adminPassages($parent)[0];
        $this->assertSame($path, $payload['blocks'][1]['image']);
        $this->assertNotEmpty($payload['blocks'][1]['image_resolved_url']);
        $this->retained($path);
        try {
            $service->saveStudio($parent, $input);
            $this->fail('Stale revision must fail.');
        } catch (HttpException $error) {
            $this->assertSame(409, $error->getStatusCode());
        }
        $this->assertSame(1, TryOutPassage::count());
        foreach (array_keys(TryOutService::SESSIONS) as $session) {
            $service->saveQuestion($parent, ['session' => $session, 'question' => 'Choose',
                'options' => ['A' => 'One', 'B' => 'Two', 'C' => 'Three', 'D' => 'Four'], 'correct_option' => 'A',
                'point_value' => 1, 'status' => 'published', 'passage_id' => $session === 'grammar' ? $passage->id : null,
                'audio_url' => $session === 'audio' ? 'https://example.test/audio.mp3' : null]);
        }
        $parent->update(['status' => 'published', 'max_score' => 4]);
        $attempts = new class(app(ChapterAccessPolicy::class), $service) extends TryOutAttemptService
        {
            public function authorize(User $user, Model $tryOut, ?Model $attempt = null): void {}
        };
        $user = new User;
        $user->id = 1;
        $attempt = $attempts->start($user, $parent);
        $this->assertSame($stored, $attempt->grading_snapshot['passages'][$passage->id]['blocks']);
        $before = $attempt->getAttributes();
        $passage->update(['blocks' => null, 'body' => 'Changed']);
        $question = collect($attempts->payload($attempt)['questions'])->firstWhere('session', 'grammar');
        $this->assertSame($stored[0], $question['passage']['blocks'][0]);
        $this->assertSame($path, $question['passage']['blocks'][1]['image']);
        $this->assertNotEmpty($question['passage']['blocks'][1]['image_resolved_url']);
        $this->assertArrayNotHasKey('correct_option', $question);
        $this->assertSame($before, $attempt->fresh()->getAttributes());
        $this->retained($path);
        DB::table('try_out_attempts')->delete();
        $this->guard()->check($path);
    }

    public function test_blocks_require_text_and_each_text_must_survive_sanitization(): void
    {
        $service = app(TryOutService::class);
        $parent = TryOut::create(['program_id' => 1, 'title' => 'Text required']);
        $image = ['type' => 'image', 'image' => 'https://example.test/diagram.png', 'image_alt' => 'Diagram'];
        $revision = $service->studioRevision($parent);
        foreach ([[$image], [['type' => 'text', 'text' => '<script>alert(1)</script>']],
            [['type' => 'text', 'text' => '<p> <br> </p>']],
            [['type' => 'text', 'text' => 'Valid'], $image, ['type' => 'text', 'text' => '<style>hidden</style>']]] as $blocks) {
            try {
                $service->saveStudio($parent, $this->input($parent, $blocks));
                $this->fail('Missing or sanitized-empty text must fail.');
            } catch (ValidationException $error) {
                $this->assertNotEmpty($error->errors());
            }
            $this->assertSame($revision, $service->studioRevision($parent));
            $this->assertSame(0, TryOutPassage::count());
        }
        $service->saveStudio($parent, $this->input($parent, [['type' => 'text', 'text' => '<ruby>日<rt>にち</rt></ruby>']]));
        $this->assertSame('<ruby>日<rt>にち</rt></ruby>', TryOutPassage::firstOrFail()->blocks[0]['text']);
    }

    public function test_strict_validation_rejects_unsafe_and_malformed_blocks_atomically(): void
    {
        $service = app(TryOutService::class);
        $parent = TryOut::create(['program_id' => 1, 'title' => 'Blocks']);
        $bad = [[], 'text', ['named' => ['type' => 'text', 'text' => 'Text']], [null], [['type' => 'video', 'image' => 'https://example.test/a.png']],
            [['type' => 'text']], [['type' => 'text', 'text' => 42]], [['type' => 'text', 'text' => 'Text', 'image' => null]],
            [['type' => 'image', 'image' => 'https://example.test/a.png', 'image_alt' => '   ']],
            [['type' => 'image', 'image' => 'https://example.test/a.png']],
            [['type' => 'image', 'image' => 'https://example.test/a.png', 'image_alt' => 'Alt', 'image_resolved_url' => 'injected']]];
        foreach (['javascript:alert(1)', '../bad.png', 'https://user:pass@example.test/a.png', 'https://example.test/audio.mp3', 'media/image/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png'] as $image) {
            $bad[] = [['type' => 'image', 'image' => $image, 'image_alt' => 'Alt']];
        }
        $revision = $service->studioRevision($parent);
        foreach ($bad as $blocks) {
            try {
                $service->saveStudio($parent, $this->input($parent, $blocks));
                $this->fail('Malformed blocks accepted: '.json_encode($blocks));
            } catch (ValidationException $error) {
                $this->assertNotEmpty($error->errors());
            }
            $this->assertSame($revision, $service->studioRevision($parent));
            $this->assertSame(0, TryOutPassage::count());
        }
    }

    public function test_null_omitted_and_legacy_images_remain_unchanged_and_checkpoint_rejects_blocks(): void
    {
        $service = app(TryOutService::class);
        $parent = TryOut::create(['program_id' => 1, 'title' => 'Legacy']);
        $input = $this->input($parent, null);
        $input['passages'][0] += ['image' => 'https://example.test/legacy.png', 'image_alt' => 'Legacy', 'image_position' => 'after'];
        $service->saveStudio($parent, $input);
        $passage = TryOutPassage::firstOrFail();
        $this->assertNull($service->adminPassages($parent)[0]['blocks']);
        $legacy = $passage->only(['body', 'image', 'image_alt', 'image_position']);
        $input['passages'][0]['id'] = (string) $passage->id;
        $input['passages'][0]['blocks'] = $this->blocks('https://example.test/new.png');
        $input['revision'] = $service->studioRevision($parent);
        $service->saveStudio($parent, $input);
        unset($input['passages'][0]['blocks']);
        $input['revision'] = $service->studioRevision($parent);
        $service->saveStudio($parent, $input);
        $this->assertCount(3, $passage->fresh()->blocks);
        $input['passages'][0]['blocks'] = null;
        $input['revision'] = $service->studioRevision($parent);
        $service->saveStudio($parent, $input);
        $this->assertNull($passage->fresh()->blocks);
        $this->assertSame($legacy, $passage->fresh()->only(array_keys($legacy)));
        $checkpoint = CheckpointPackage::create(['program_id' => 1, 'title' => 'Checkpoint']);
        $checkpointService = app(CheckpointPackageService::class);
        $input['revision'] = $checkpointService->studioRevision($checkpoint);
        $input['passages'][0]['id'] = 'group';
        unset($input['passages'][0]['image'], $input['passages'][0]['image_alt'], $input['passages'][0]['image_position']);
        try {
            $checkpointService->saveStudio($checkpoint, $input);
            $this->fail('Checkpoint must reject blocks, including null.');
        } catch (ValidationException $error) {
            $this->assertArrayHasKey('blocks', $error->errors());
        }
        $this->assertNotContains('blocks', $checkpointService->passageFields());
    }

    public function test_media_removed_before_lock_revalidates_blocks_and_rolls_back(): void
    {
        $path = 'media/image/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png';
        Storage::disk('public')->put($path, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII='));
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
        $parent = TryOut::create(['program_id' => 1, 'title' => 'Original']);
        $input = $this->input($parent, $this->blocks($path));
        $input['settings']['title'] = 'Must roll back';
        try {
            $service->saveStudio($parent, $input);
            $this->fail('Missing media must fail inside lock.');
        } catch (ValidationException $error) {
            $this->assertArrayHasKey('blocks.1.image', $error->errors());
        }
        $this->assertSame($input['revision'], $service->studioRevision($parent));
        $this->assertSame(0, TryOutPassage::count());
    }
}
