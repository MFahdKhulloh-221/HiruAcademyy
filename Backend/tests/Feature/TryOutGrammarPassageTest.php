<?php

namespace Tests\Feature;

use App\Models\CheckpointPackage;
use App\Models\CheckpointPassage;
use App\Models\TryOut;
use App\Models\TryOutPassage;
use App\Models\User;
use App\Services\ChapterAccessPolicy;
use App\Services\CheckpointPackageService;
use App\Services\MediaService;
use App\Services\TryOutAttemptService;
use App\Services\TryOutService;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Bootstrap\LoadConfiguration;
use Illuminate\Foundation\Bootstrap\LoadEnvironmentVariables;
use Illuminate\Foundation\Testing\TestCase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

class TryOutGrammarPassageTest extends TestCase
{
    public function createApplication()
    {
        $app = require Application::inferBasePath().'/bootstrap/app.php';
        $this->traitsUsedByTest = [];
        $app->instance(LoadEnvironmentVariables::class, new class extends LoadEnvironmentVariables
        {
            public function bootstrap(\Illuminate\Contracts\Foundation\Application $app) {}
        });
        if ($app->configurationIsCached()) {
            throw new \RuntimeException('Passage tests require uncached configuration.');
        }
        $app->afterBootstrapping(LoadConfiguration::class, function ($app) {
            $app['config']->set([
                'app.env' => 'testing',
                'app.key' => 'base64:'.base64_encode(str_repeat('t', 32)),
                'database.default' => 'sqlite',
                'database.connections' => ['sqlite' => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '', 'foreign_key_constraints' => true]],
                'cache.default' => 'array', 'session.driver' => 'array', 'queue.default' => 'sync', 'mail.default' => 'array',
            ]);
        });
        $app->make(Kernel::class)->bootstrap();

        return $app;
    }

    protected function setUp(): void
    {
        if (! extension_loaded('pdo_sqlite')) {
            $this->markTestSkipped('pdo_sqlite required; never fall back to PostgreSQL.');
        }
        parent::setUp();
        $this->assertSame('sqlite', DB::connection()->getDriverName());
        $this->assertSame(':memory:', DB::connection()->getDatabaseName());
        // SQLite cannot take PostgreSQL advisory locks; retain transaction/rollback semantics.
        $this->app->instance(MediaService::class, new class extends MediaService
        {
            public function locked(callable $operation): mixed
            {
                return DB::transaction($operation);
            }
        });
        Schema::create('programs', function (Blueprint $table) {
            $table->id();
            foreach (['code', 'family', 'status'] as $column) {
                $table->string($column);
            }
        });
        DB::table('programs')->insert(['id' => 1, 'code' => 'n5', 'family' => 'jlpt', 'status' => 'active']);
        foreach (['try_out' => 'try_out_id', 'checkpoint' => 'checkpoint_package_id'] as $prefix => $key) {
            $parents = $prefix === 'try_out' ? 'try_outs' : 'checkpoint_packages';
            Schema::create($parents, function (Blueprint $table) {
                $table->id();
                $table->integer('program_id');
                $table->string('title');
                $table->string('status')->default('draft');
                $table->string('access_type')->default('free');
                $table->integer('max_score')->default(180);
                $table->integer('sort_order')->default(0);
                $table->integer('total_passing_score')->nullable();
                $table->integer('duration_minutes')->nullable();
                $table->json('session_passing_scores')->nullable();
                $table->timestamps();
            });
            Schema::create($prefix.'_passages', function (Blueprint $table) use ($key, $parents) {
                $table->id();
                $table->foreignId($key)->constrained($parents)->cascadeOnDelete();
                $table->string('title');
                $table->text('body');
                $table->timestamps();
            });
            Schema::create($prefix === 'try_out' ? 'try_out_questions' : 'checkpoint_studio_questions', function (Blueprint $table) use ($prefix, $key, $parents) {
                $table->id();
                $table->foreignId($key)->constrained($parents)->cascadeOnDelete();
                $table->foreignId('passage_id')->nullable()->constrained($prefix.'_passages')->restrictOnDelete();
                $table->string('session');
                $table->text('question');
                $table->json('options');
                $table->string('correct_option');
                $table->integer('point_value');
                foreach (['instruction', 'japanese', 'explanation', 'reading_passage', 'audio_url'] as $column) {
                    $table->text($column)->nullable();
                }
                $table->integer('sort_order')->default(0);
                $table->string('status')->default('draft');
                $table->timestamps();
            });
        }
        Schema::create('try_out_attempts', function (Blueprint $table) {
            $table->id();
            $table->integer('user_id');
            $table->integer('try_out_id');
            $table->string('status');
            foreach (['content_snapshot', 'grading_snapshot', 'result_snapshot', 'answers', 'completed_sessions'] as $column) {
                $table->json($column)->nullable();
            }
            $table->integer('current_session');
            $table->integer('revision');
            foreach (['started_at', 'expires_at', 'completed_at', 'abandoned_at'] as $column) {
                $table->timestamp($column)->nullable();
            }
            $table->timestamps();
        });
    }

    private function parent(): TryOut
    {
        return TryOut::create(['program_id' => 1, 'title' => 'Grammar fixture']);
    }

    private function content(string $session = 'grammar', ?int $passage = null): array
    {
        return ['session' => $session, 'question' => 'Choose', 'options' => ['A' => 'One', 'B' => 'Two', 'C' => 'Three', 'D' => 'Four'], 'correct_option' => 'A', 'point_value' => 1, 'passage_id' => $passage];
    }

    private function passage(TryOut $parent): TryOutPassage
    {
        return TryOutPassage::create(['try_out_id' => $parent->id, 'title' => 'Group', 'body' => '<p>Shared body</p>']);
    }

    private function invalid(callable $operation, string $field = 'passage_id'): void
    {
        try {
            $operation();
            $this->fail('Expected validation rejection.');
        } catch (ValidationException $error) {
            $this->assertArrayHasKey($field, $error->errors());
        }
    }

    public function test_grammar_group_reuses_passage_and_rejects_other_sessions_and_parents(): void
    {
        $service = app(TryOutService::class);
        $parent = $this->parent();
        $passage = $this->passage($parent);
        $first = $service->saveQuestion($parent, $this->content(passage: $passage->id));
        $second = $service->saveQuestion($parent, $this->content(passage: $passage->id));
        $this->assertSame($first->passage_id, $second->passage_id);
        $this->invalid(fn () => $service->saveQuestion($this->parent(), $this->content(passage: $passage->id)));
        foreach (['reading', 'audio', 'vocabulary_kanji'] as $session) {
            $this->invalid(fn () => $service->saveQuestion($parent, $this->content($session, $passage->id)));
        }
        $this->invalid(fn () => $service->saveQuestion($parent, ['session' => 'reading'], $first));
        $this->assertSame('grammar', $first->fresh()->session);
        $this->assertSame(2, $parent->questions()->count());
        $this->invalid(fn () => $service->saveQuestion($parent, $this->content(passage: $passage->id) + ['reading_passage' => 'Inline']), 'reading_passage');
    }

    public function test_reading_shared_inline_and_standalone_questions_remain_supported(): void
    {
        $service = app(TryOutService::class);
        $parent = $this->parent();
        $passage = $this->passage($parent);
        foreach ([$this->content('reading', $passage->id), $this->content('reading') + ['reading_passage' => 'Inline'], $this->content()] as $content) {
            $service->saveQuestion($parent, $content);
        }
        $this->invalid(fn () => $service->saveQuestion($parent, $this->content('grammar', $passage->id)));
        $this->assertSame(3, $parent->questions()->count());
    }

    public function test_checkpoint_keeps_reading_only_passages(): void
    {
        $parent = CheckpointPackage::create(['program_id' => 1, 'title' => 'Checkpoint']);
        $passage = CheckpointPassage::create(['checkpoint_package_id' => $parent->id, 'title' => 'Reading', 'body' => 'Text']);
        $service = app(CheckpointPackageService::class);
        $service->saveQuestion($parent, $this->content('reading', $passage->id));
        $this->invalid(fn () => $service->saveQuestion($parent, $this->content('grammar', $passage->id)));
        $this->assertSame(1, $parent->questions()->count());
    }

    public function test_studio_round_trip_revision_and_stale_writer_preserve_group(): void
    {
        $service = app(TryOutService::class);
        $parent = $this->parent();
        $input = ['revision' => $service->studioRevision($parent), 'settings' => ['title' => $parent->title], 'passages' => [['id' => 'new-group', 'title' => 'Group', 'body' => '<p>Shared body</p>']], 'questions' => [], 'deleted_question_ids' => [], 'deleted_passage_ids' => []];
        foreach (['new-one', 'new-two'] as $id) {
            $content = $this->content();
            $content['passage_id'] = 'new-group';
            $input['questions'][] = ['id' => $id, 'content' => $content];
        }
        $service->saveStudio($parent, $input);
        $this->assertNotSame($input['revision'], $service->studioRevision($parent));
        $questions = $parent->questions()->orderBy('id')->get();
        $this->assertSame($questions[0]->passage_id, $questions[1]->passage_id);
        $this->assertSame($questions[0]->passage_id, $service->adminQuestion($questions[0])['passage_id']);
        try {
            $service->saveStudio($parent, $input);
            $this->fail('Expected stale writer rejection.');
        } catch (HttpException $error) {
            $this->assertSame(409, $error->getStatusCode());
        }
        $input['revision'] = $service->studioRevision($parent);
        $input['passages'][0]['id'] = (string) $questions[0]->passage_id;
        $input['passages'][0]['body'] = '<p>Revised body</p>';
        $input['questions'] = [];
        $service->saveStudio($parent, $input);
        $this->assertSame('<p>Revised body</p>', TryOutPassage::findOrFail($questions[0]->passage_id)->body);
        $this->assertSame(2, $parent->questions()->count());
    }

    public function test_studio_cross_session_group_rolls_back_entire_save(): void
    {
        $service = app(TryOutService::class);
        $parent = $this->parent();
        $revision = $service->studioRevision($parent);
        $questions = [];
        foreach (['grammar', 'reading'] as $session) {
            $content = $this->content($session);
            $content['passage_id'] = 'new-group';
            $questions[] = ['id' => 'new-'.$session, 'content' => $content];
        }
        $this->invalid(fn () => $service->saveStudio($parent, [
            'revision' => $revision, 'settings' => ['title' => 'Must roll back'],
            'passages' => [['id' => 'new-group', 'title' => 'Group', 'body' => 'Text']],
            'questions' => $questions, 'deleted_question_ids' => [], 'deleted_passage_ids' => [],
        ]));
        $this->assertSame($revision, $service->studioRevision($parent));
        $this->assertSame(0, $parent->questions()->count());
        $this->assertSame(0, TryOutPassage::count());
    }

    public function test_existing_snapshot_builder_supports_grammar_and_keeps_old_snapshots(): void
    {
        $parent = $this->parent();
        $passage = $this->passage($parent);
        $contentService = app(TryOutService::class);
        foreach (array_keys(TryOutService::SESSIONS) as $session) {
            $content = $this->content($session, $session === 'grammar' ? $passage->id : null);
            $content['status'] = 'published';
            if ($session === 'audio') {
                $content['audio_url'] = 'https://example.test/audio.mp3';
            }
            $contentService->saveQuestion($parent, $content);
        }
        $parent->update(['max_score' => 4, 'status' => 'published']);
        // Authorization has separate coverage; exercise real snapshot construction without entitlements DB.
        $attemptService = new class(app(ChapterAccessPolicy::class), $contentService) extends TryOutAttemptService
        {
            public function authorize(User $user, Model $tryOut, ?Model $attempt = null): void {}
        };
        $user = new User;
        $user->id = 1;
        $attempt = $attemptService->start($user, $parent);
        $snapshot = $attempt->getAttributes();
        $payload = $attemptService->payload($attempt);
        $grammar = collect($payload['questions'])->firstWhere('session', 'grammar');
        $this->assertSame('<p>Shared body</p>', $grammar['passage']['body']);
        $this->assertArrayNotHasKey('correct_option', $grammar);
        $this->assertArrayNotHasKey('explanation', $grammar);
        $passage->update(['body' => 'Changed later']);
        $this->assertSame($snapshot, $attempt->fresh()->getAttributes());
        $this->assertSame('<p>Shared body</p>', collect($attemptService->payload($attempt->fresh())['questions'])->firstWhere('session', 'grammar')['passage']['body']);
        $legacy = $attempt->replicate();
        $legacy->content_snapshot = array_map(function ($question) {
            unset($question['passage_id']);

            return $question;
        }, $legacy->content_snapshot);
        $grading = $legacy->grading_snapshot;
        unset($grading['passages']);
        $legacy->grading_snapshot = $grading;
        $this->assertCount(4, $attemptService->payload($legacy)['questions']);
    }
}
