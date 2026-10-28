<?php

namespace Tests\Unit;

use App\Models\User;
use App\Services\ChapterAccessPolicy;
use App\Services\LearningLibraryService;
use App\Services\MediaService;
use Illuminate\Container\Container;
use Illuminate\Support\Fluent;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\PreserveGlobalState;
use PHPUnit\Framework\Attributes\RunTestsInSeparateProcesses;
use PHPUnit\Framework\TestCase;

#[RunTestsInSeparateProcesses]
#[PreserveGlobalState(false)]
final class LearningLibraryAccessTest extends TestCase
{
    private ?Container $previousContainer = null;

    protected function tearDown(): void
    {
        try {
            Mockery::close();
        } finally {
            Container::setInstance($this->previousContainer);
            parent::tearDown();
        }
    }

    public static function moduleAccessCases(): array
    {
        return [
            'allowed kanji' => ['kanji', 'n5', true, 'Private lesson description'],
            'locked kanji' => ['kanji', 'n5', false, 'Private lesson description'],
            'allowed grammar' => ['grammar', 'ssw-food', true, 'Private lesson description'],
            'locked grammar' => ['grammar', 'ssw-food', false, 'Private lesson description'],
            'allowed empty description' => ['kanji', 'dasar', true, ''],
            'allowed null description' => ['grammar', 'dasar', true, null],
        ];
    }

    #[DataProvider('moduleAccessCases')]
    public function test_modules_exposes_files_and_description_only_when_allowed(
        string $moduleType,
        string $programCode,
        bool $allowed,
        ?string $description,
    ): void {
        $this->previousContainer = Container::getInstance();
        $container = new Container;
        Container::setInstance($container);

        $file = 'media/modules/private-lesson.pdf';
        $resolved = 'https://cdn.example.test/private-lesson.pdf';
        $program = ['id' => 7, 'code' => $programCode, 'name' => 'Program title', 'family' => 'japanese'];
        $chapter = ['id' => 11, 'chapter_number' => 2, 'title' => 'Chapter title'];
        $module = new Fluent([
            'id' => 23,
            'module_type' => $moduleType,
            'title' => 'Module title',
            'description' => $description,
            'file_url' => $file,
            'chapter' => new Fluent([...$chapter, 'program' => new Fluent($program)]),
        ]);

        // Alias only query entry points; no Laravel application or DB connection boots.
        $this->mockQuery('App\\Models\\LearningModule', [$module], 1);
        $this->mockQuery('App\\Models\\Chapter', [], 2);
        $this->mockQuery('App\\Models\\ReadingPassage', [], 1);

        $user = new User;
        $policy = Mockery::mock(ChapterAccessPolicy::class);
        $policy->shouldReceive('canAccessChapter')->once()
            ->with($user, $programCode, 2)->andReturn($allowed);
        $media = Mockery::mock(MediaService::class);
        if ($allowed) {
            $media->shouldReceive('url')->once()->with($file)->andReturn($resolved);
        } else {
            $media->shouldNotReceive('url');
        }
        $container->instance(MediaService::class, $media);

        $type = $moduleType === 'kanji' ? 'Kanji' : 'Tata Bahasa';
        $routeProgram = $programCode === 'ssw-food' ? 'ssw-pengolahan-makanan' : $programCode;
        $level = $programCode === 'ssw-food' ? 'SSW' : strtoupper($programCode);

        $this->assertSame([[
            'id' => 'module-23',
            'resource_id' => 23,
            'category' => $type,
            'type' => $type,
            'title' => 'Module title',
            'description' => $allowed && $description ? $description : "Modul {$type} untuk Chapter 2.",
            'level' => $level,
            'program' => $program,
            'chapter' => $chapter,
            'file_url' => $allowed ? $file : null,
            'file_url_resolved_url' => $allowed ? $resolved : null,
            'href' => "/learn/{$routeProgram}/chapter-2/{$moduleType}",
            'locked' => ! $allowed,
        ]], (new LearningLibraryService($policy))->modules($user));
    }

    private function mockQuery(string $model, array $items, int $calls): void
    {
        $query = Mockery::mock();
        $query->shouldReceive('where')->with('status', 'published')->times($calls)->andReturnSelf();
        $query->shouldReceive('whereHas', 'with', 'orderBy')->andReturnSelf();
        $query->shouldReceive('get')->times($calls)->andReturn($items);
        Mockery::mock('alias:'.$model)->shouldReceive('query')->times($calls)->andReturn($query);
    }
}
