<?php

namespace Tests\Unit;

use App\Http\Middleware\RequireRole;
use App\Models\CheckpointQuestion;
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

final class CheckpointQuestionTest extends TestCase
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
            $this->assertStringNotContainsString('mini_checkpoint', $sql);
            if (str_contains($sql, 'count(*)')) return [(object) ['aggregate' => $chapterExists ? 1 : 0]];
            if (str_contains($sql, 'select exists')) return [(object) ['exists' => $row !== null]];
            if (str_contains($sql, '"chapters"')) return [(object) ['id' => 9, 'program_id' => 1]];
            $this->assertStringContainsString('"checkpoint_questions"', $sql);
            return $row ? [(object) $row] : [];
        });
        $connection->shouldReceive('selectFromWriteConnection')->once()->andReturnUsing(function ($sql, $bindings) use (&$row) {
            $this->assertStringContainsString('insert into "checkpoint_questions"', $sql);
            preg_match('/\((.*?)\) values/', $sql, $columns);
            $names = array_map(fn ($column) => trim($column, ' "'), explode(',', $columns[1]));
            $row = ['id' => 1] + array_combine($names, $bindings);
            return [(object) ['id' => 1]];
        });
        $connection->shouldReceive('update')->once()->andReturnUsing(function ($sql, $bindings) use (&$row) {
            $this->assertStringContainsString('update "checkpoint_questions"', $sql);
            $this->assertContains('published', $bindings);
            $row['status'] = 'published';
            return 1;
        });
        $connection->shouldReceive('delete')->once()->andReturnUsing(function ($sql) use (&$row) {
            $this->assertStringContainsString('delete from "checkpoint_questions"', $sql);
            $row = null;
            return 1;
        });
        try {
            $service = new LearningContentService;
            $safe = '<strong>Bold</strong><em>Italic</em><u>Underline</u><ruby>学校<rt>がっこう</rt></ruby>';
            $input = ['chapter_id' => 9, 'question' => $safe.'<script>alert(1)</script>', 'options' => ['A' => '<b onclick="bad()">Answer</b>', 'B' => 'Legacy', 'C' => 'Third', 'D' => 'Fourth'], 'correct_option' => 'A', 'explanation' => $safe, 'sort_order' => 0, 'status' => 'draft'];
            $saved = $service->save('checkpoint-questions', $input);
            $this->assertInstanceOf(CheckpointQuestion::class, $saved);
            $this->assertSame($safe, $saved->question);
            $this->assertSame('<strong>Answer</strong>', $saved->options['A']);
            $this->assertSame('Legacy', $saved->options['B']);
            $this->assertSame('draft', $saved->status);
            $this->assertSame($safe, $saved->explanation);
            $this->assertSame('published', $service->save('checkpoint-questions', ['status' => 'published'], $saved)->status);
            foreach ([['question' => '<script>bad()</script>'], ['question' => '<p>&nbsp;</p>'], ['options' => ['A' => '<u> </u>', 'B' => 'B', 'C' => 'C', 'D' => 'D']], ['options' => ['A' => 'A']], ['correct_option' => 'E'], ['status' => 'live'], ['sort_order' => -1], ['session' => 1], ['duration_minutes' => 5]] as $invalid) {
                try {
                    $service->save('checkpoint-questions', $invalid, $saved);
                    $this->fail('Expected validation failure.');
                } catch (ValidationException $error) {
                    $this->assertNotEmpty($error->errors());
                }
            }
            $chapterExists = false;
            try {
                $service->save('checkpoint-questions', ['chapter_id' => 999], $saved);
                $this->fail('Missing chapter must fail.');
            } catch (ValidationException $error) {
                $this->assertArrayHasKey('chapter_id', $error->errors());
            }
            try {
                $service->delete('chapters', 9);
                $this->fail('Chapter with Checkpoint questions must be retained.');
            } catch (ValidationException $error) {
                $this->assertArrayHasKey('chapter', $error->errors());
            }
            $service->delete('checkpoint-questions', 1);
            $this->assertNull($row);
            foreach ([null, 'student', 'admin'] as $role) {
                $request = Request::create('/api/admin/checkpoint-questions');
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
