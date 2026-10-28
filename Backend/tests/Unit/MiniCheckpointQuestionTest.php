<?php

namespace Tests\Unit;

use App\Http\Middleware\RequireRole;
use App\Models\MiniCheckpointQuestion;
use App\Models\User;
use App\Services\LearningContentService;
use App\Services\MediaService;
use Illuminate\Container\Container;
use Illuminate\Database\ConnectionResolver;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\PostgresConnection;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Facade;
use Illuminate\Support\Facades\Validator;
use Illuminate\Translation\ArrayLoader;
use Illuminate\Translation\Translator;
use Illuminate\Validation\DatabasePresenceVerifier;
use Illuminate\Validation\Factory;
use Illuminate\Validation\ValidationException;
use Mockery;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpKernel\Exception\HttpException;

final class MiniCheckpointQuestionTest extends TestCase
{
    public function test_crud_sanitization_validation_and_admin_gate_without_database(): void
    {
        $previous = Container::getInstance();
        $facade = Facade::getFacadeApplication();
        $resolver = Model::getConnectionResolver();
        $container = new class extends Container {
            public function abort($code, $message = '', array $headers = []): never
            {
                throw new HttpException($code, $message, null, $headers);
            }
        };
        Container::setInstance($container);
        Facade::clearResolvedInstances();
        Facade::setFacadeApplication($container);
        $connection = Mockery::mock(PostgresConnection::class)->makePartial();
        $connection->useDefaultQueryGrammar();
        $connection->useDefaultPostProcessor();
        $connections = new ConnectionResolver(['test' => $connection]);
        $connections->setDefaultConnection('test');
        Model::setConnectionResolver($connections);
        $database = Mockery::mock(\Illuminate\Database\DatabaseManager::class);
        $database->shouldReceive('connection')->andReturn($connection);
        $database->shouldReceive('transaction')->andReturnUsing(fn ($callback) => $callback());
        DB::swap($database);
        $factory = new Factory(new Translator(new ArrayLoader, 'en'), $container);
        $factory->setPresenceVerifier(new DatabasePresenceVerifier($database));
        Validator::swap($factory);
        $media = Mockery::mock(MediaService::class);
        $media->shouldReceive('locked')->andReturnUsing(fn ($callback) => $callback());
        $container->instance(MediaService::class, $media);
        $row = null;
        $chapterExists = true;
        $connection->shouldReceive('select')->andReturnUsing(function ($sql) use (&$row, &$chapterExists) {

            if (str_contains($sql, 'count(*)')) return [(object) ['aggregate' => $chapterExists ? 1 : 0]];
            if (str_contains($sql, 'where "chapter_id"')) return [];
            if (str_contains($sql, 'select exists')) return [(object) ['exists' => $row !== null]];
            if (str_contains($sql, '"programs"')) return [(object) ['id' => 1, 'family' => 'jlpt']];
            if (str_contains($sql, '"chapters"')) return [(object) ['id' => 9, 'program_id' => 1]];
            $this->assertStringContainsString('"mini_checkpoint_questions"', $sql);
            return $row ? [(object) $row] : [];
        });
        $connection->shouldReceive('selectFromWriteConnection')->once()->andReturnUsing(function ($sql, $bindings) use (&$row) {
            $this->assertStringContainsString('insert into "mini_checkpoint_questions"', $sql);
            preg_match('/\((.*?)\) values/', $sql, $columns);
            $names = array_map(fn ($column) => trim($column, ' "'), explode(',', $columns[1]));
            $row = ['id' => 1] + array_combine($names, $bindings);
            return [(object) ['id' => 1]];
        });
        $connection->shouldReceive('update')->once()->andReturnUsing(function ($sql, $bindings) use (&$row) {
            $this->assertStringContainsString('update "mini_checkpoint_questions"', $sql);
            $this->assertContains('published', $bindings);
            $row['status'] = 'published';
            return 1;
        });
        $connection->shouldReceive('delete')->once()->andReturnUsing(function ($sql) use (&$row) {
            $this->assertStringContainsString('delete from "mini_checkpoint_questions"', $sql);
            $row = null;
            return 1;
        });
        try {
            $service = new LearningContentService;
            $safe = '<strong>Bold</strong><em>Italic</em><u>Underline</u><ruby>学校<rt>がっこう</rt></ruby>';
            $input = ['session' => 2, 'part' => 3, 'duration_minutes' => 7, 'passing_score' => 80, 'chapter_id' => 9, 'question' => $safe.'<script>alert(1)</script>', 'options' => ['A' => '<b onclick="bad()">Answer</b>', 'B' => 'Legacy', 'C' => 'Third', 'D' => 'Fourth'], 'correct_option' => 'A', 'explanation' => $safe, 'sort_order' => 0, 'status' => 'draft'];
            $saved = $service->save('mini-checkpoint-questions', $input);
            $this->assertInstanceOf(MiniCheckpointQuestion::class, $saved);
            $this->assertSame($safe, $saved->question);
            $this->assertSame('<strong>Answer</strong>', $saved->options['A']);
            $this->assertSame('Legacy', $saved->options['B']);
            $this->assertSame('draft', $saved->status);
            $this->assertSame($safe, $saved->explanation);
            $this->assertSame(80, $saved->passing_score);
            $this->assertSame(7, $saved->duration_minutes);
            $container->instance(\App\Services\LearningAttemptService::class, new \App\Services\LearningAttemptService(Mockery::mock(\App\Services\LearningProgressService::class)));

            $this->assertSame('published', $service->save('mini-checkpoint-questions', ['status' => 'published'], $saved)->status);
            $saved->status = 'published';
            foreach ([['passing_score' => -1], ['passing_score' => 101], ['passing_score' => null], ['duration_minutes' => null], ['duration_minutes' => 0], ['session' => 0], ['part' => 0], ['status' => 'live']] as $invalid) {
                try {
                    $service->save('mini-checkpoint-questions', $invalid, $saved);
                    $this->fail('Expected validation failure.');
                } catch (ValidationException $error) {
                    $this->assertNotEmpty($error->errors());
                }
            }
            $chapter = (new \App\Models\Chapter)->forceFill(['id' => 9, 'access' => 'full']);
            foreach (['videoLessons', 'modules', 'flashcards', 'audioQuestions', 'readingPassages'] as $relation) $chapter->setRelation($relation, collect());
            $chapter->setRelation('miniCheckpointQuestions', collect([$saved]));
            $payload = (new \App\Http\Resources\StudentChapterResource($chapter))->toArray(Request::create('/'));
            $this->assertSame(['session' => 2, 'part' => 3, 'duration_minutes' => 7, 'passing_score' => 80, 'question_count' => 1, 'configuration_valid' => true], $payload['mini_checkpoints'][0]);
            $this->assertStringNotContainsString('correct_option', json_encode($payload));
            $configuration = $saved->only(['session', 'part', 'duration_minutes', 'passing_score']);
            foreach (['duration_minutes', 'passing_score'] as $field) {
                try {
                    app(\App\Services\LearningAttemptService::class)->miniConfiguration([$configuration, array_replace($configuration, [$field => $configuration[$field] + 1])]);
                    $this->fail('Mixed group configuration must fail.');
                } catch (ValidationException $error) {
                    $this->assertArrayHasKey($field, $error->errors());
                }
            }
            $saved->passing_score = null;
            $invalidPayload = (new \App\Http\Resources\StudentChapterResource($chapter))->toArray(Request::create('/'));
            $this->assertFalse($invalidPayload['mini_checkpoints'][0]['configuration_valid']);
            $saved->passing_score = 80;
            $chapterExists = false;
            try {
                $service->save('mini-checkpoint-questions', ['chapter_id' => 999], $saved);
                $this->fail('Missing chapter must fail.');
            } catch (ValidationException $error) {
                $this->assertArrayHasKey('chapter_id', $error->errors());
            }
            $service->delete('mini-checkpoint-questions', 1);
            $this->assertNull($row);
            foreach ([null, 'student', 'admin'] as $role) {
                $request = Request::create('/api/admin/mini-checkpoint-questions');
                $request->setUserResolver(fn () => $role ? (new User)->forceFill(['role' => $role]) : null);
                try {
                    $this->assertSame('allowed', (new RequireRole)->handle($request, fn () => 'allowed', 'admin'));
                    $this->assertSame('admin', $role);
                } catch (HttpException $error) {
                    $this->assertNotSame('admin', $role);
                    $this->assertSame(403, $error->getStatusCode());
                }
            }
        } finally {
            Mockery::close();
            if ($resolver) Model::setConnectionResolver($resolver); else Model::unsetConnectionResolver();
            Facade::clearResolvedInstances();
            Facade::setFacadeApplication($facade);
            Container::setInstance($previous);
        }
    }
}
