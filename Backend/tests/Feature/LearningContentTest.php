<?php

namespace Tests\Feature;

use App\Models\AccessGrant;
use App\Models\AudioQuestion;
use App\Models\Chapter;
use App\Models\Flashcard;
use App\Models\LearningModule;
use App\Models\MiniCheckpointQuestion;
use App\Models\Program;
use App\Models\ReadingPassage;
use App\Models\ReadingQuestion;
use App\Models\User;
use App\Models\VideoLesson;
use Database\Seeders\ProgramOfferSeeder;
use Database\Seeders\ProgramSeeder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class LearningContentTest extends TestCase
{
    use DatabaseTransactions;

    private const MODELS = [
        'chapters' => Chapter::class,
        'video-lessons' => VideoLesson::class,
        'modules' => LearningModule::class,
        'flashcards' => Flashcard::class,
        'audio-questions' => AudioQuestion::class,
        'reading-passages' => ReadingPassage::class,
        'reading-questions' => ReadingQuestion::class,
        'mini-checkpoint-questions' => MiniCheckpointQuestion::class,
    ];

    private User $admin;

    private User $student;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('hiru_academy_test', DB::connection()->getDatabaseName());
        $this->travelTo(now()->setDate(2026, 10, 4)->setTime(12, 0));
        $this->seed([ProgramSeeder::class, ProgramOfferSeeder::class]);
        $this->student = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $this->admin = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $this->student->forceFill(['role' => 'student', 'account_status' => 'active'])->save();
        $this->admin->forceFill(['role' => 'admin', 'account_status' => 'active'])->save();
    }

    protected function tearDown(): void
    {
        $this->travelBack();
        parent::tearDown();
    }

    private function program(string $code = 'n5'): Program
    {
        return Program::where('code', $code)->firstOrFail();
    }

    private function chapter(string $code = 'n5', int $number = 1, array $overrides = []): Chapter
    {
        return Chapter::create(array_replace([
            'program_id' => $this->program($code)->id,
            'chapter_number' => $number,
            'title' => 'Fixture chapter '.$number,
            'status' => 'published',
            'sort_order' => 0,
        ], $overrides));
    }

    private function payload(string $resource, Chapter $chapter): array
    {
        $question = [
            'question' => 'Fixture question?',
            'options' => ['A' => 'First', 'B' => 'Second', 'C' => 'Third', 'D' => 'Fourth'],
            'correct_option' => 'B',
            'explanation' => 'Private fixture explanation',
        ];
        if ($resource === 'chapters') {
            return ['program_id' => $chapter->program_id, 'chapter_number' => 100, 'title' => 'New fixture chapter'];
        }
        if ($resource === 'reading-questions') {
            $passage = ReadingPassage::create([
                'chapter_id' => $chapter->id, 'title' => 'Fixture passage', 'body' => 'Fixture body', 'status' => 'published',
            ]);

            return ['reading_passage_id' => $passage->id, ...$question];
        }

        return ['chapter_id' => $chapter->id, ...match ($resource) {
            'video-lessons' => ['title' => 'Fixture video', 'video_url' => 'https://media.example.test/video.mp4'],
            'modules' => ['title' => 'Fixture module', 'file_url' => 'https://media.example.test/module.pdf', 'module_type' => 'grammar'],
            'flashcards' => ['japanese' => '猫', 'reading' => 'ねこ', 'meaning' => 'Cat', 'example' => '猫です。'],
            'audio-questions' => ['title' => 'Fixture audio', 'audio_url' => 'https://media.example.test/audio.mp3', ...$question],
            'reading-passages' => ['title' => 'Fixture passage', 'body' => 'Fixture body'],
            'mini-checkpoint-questions' => $question,
        }];
    }

    private function item(string $resource, Chapter $chapter, array $overrides = []): Model
    {
        $class = self::MODELS[$resource];

        return $class::create(array_replace($this->payload($resource, $chapter), $overrides))->fresh();
    }

    private function grant(string $code, array $overrides = []): AccessGrant
    {
        return AccessGrant::create(array_replace([
            'user_id' => $this->student->id, 'program_id' => $this->program($code)->id,
            'plan_code' => 'lms', 'starts_at' => '2026-10-01', 'ends_at' => '2026-10-31', 'status' => 'active',
        ], $overrides));
    }

    private function listUrl(string $code = 'n5'): string
    {
        return '/api/student/programs/'.$this->program($code)->id.'/chapters';
    }

    private function detailUrl(Chapter $chapter): string
    {
        return '/api/student/programs/'.$chapter->program_id.'/chapters/'.$chapter->id;
    }

    private function assertKeys(array $expected, array $actual): void
    {
        $keys = array_keys($actual);
        sort($expected);
        sort($keys);
        $this->assertSame($expected, $keys);
    }

    public static function resources(): array
    {
        return array_combine(array_keys(self::MODELS), array_map(fn ($resource) => [$resource], array_keys(self::MODELS)));
    }

    #[DataProvider('resources')]
    public function test_admin_crud_defaults_publication_and_order(string $resource): void
    {
        $chapter = $this->chapter();
        $payload = $this->payload($resource, $chapter);
        $url = '/api/admin/'.$resource;
        $this->actingAs($this->admin);
        $created = $this->postJson($url, $payload)->assertCreated()
            ->assertJsonPath('data.status', 'draft')->assertJsonPath('data.sort_order', 0);
        $id = $created->json('data.id');
        $this->assertIsInt($id);
        foreach ($payload as $field => $value) {
            $created->assertJsonPath('data.'.$field, $value);
        }
        $class = self::MODELS[$resource];
        $this->assertNotNull($class::find($id));
        $this->getJson($url.'/'.$id)->assertOk()->assertJsonPath('data.id', $id);
        $secondPayload = array_replace($payload, ['status' => 'published', 'sort_order' => 1]);
        if ($resource === 'chapters') {
            $secondPayload['chapter_number'] = 101;
        }
        if ($resource === 'video-lessons') {
            $secondPayload['chapter_id'] = $this->chapter(number: 2)->id;
        }
        $second = $this->postJson($url, $secondPayload)->assertCreated()->json('data.id');
        $this->patchJson($url.'/'.$id, ['status' => 'published', 'sort_order' => 2])
            ->assertOk()->assertJsonPath('data.status', 'published')->assertJsonPath('data.sort_order', 2);
        $rows = $this->getJson($url)->assertOk()->json('data');
        $ids = array_values(array_filter(array_column($rows, 'id'), fn ($value) => in_array($value, [$id, $second], true)));
        $this->assertSame([$second, $id], $ids);
        $this->patchJson($url.'/'.$id, ['sort_order' => 1])->assertOk();
        $rows = $this->getJson($url)->assertOk()->json('data');
        $ids = array_values(array_filter(array_column($rows, 'id'), fn ($value) => in_array($value, [$id, $second], true)));
        $this->assertSame([$id, $second], $ids);
        $this->patchJson($url.'/'.$id, ['status' => 'draft'])->assertOk()->assertJsonPath('data.status', 'draft');
        $this->deleteJson($url.'/'.$id)->assertNoContent();
        $this->assertNull($class::find($id));
        $this->getJson($url.'/'.$id)->assertNotFound();
        $this->patchJson($url.'/'.$id, ['status' => 'published'])->assertNotFound();
    }

    #[DataProvider('resources')]
    public function test_all_admin_operations_require_active_admin(string $resource): void
    {
        $chapter = $this->chapter();
        $item = $this->item($resource, $chapter);
        $payload = $this->payload($resource, $chapter);
        $url = '/api/admin/'.$resource;
        $requests = [['GET', $url], ['POST', $url], ['GET', $url.'/'.$item->id], ['PATCH', $url.'/'.$item->id], ['DELETE', $url.'/'.$item->id]];
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
        $this->assertSame($item->getAttributes(), $item->fresh()->getAttributes());
    }

    public static function familyMatrix(): array
    {
        $allowed = [
            'dasar' => ['chapters', 'video-lessons', 'modules', 'flashcards', 'audio-questions', 'reading-passages', 'reading-questions', 'mini-checkpoint-questions'],
            'n5' => array_keys(self::MODELS),
            'ssw-food' => ['chapters', 'video-lessons', 'modules', 'flashcards', 'mini-checkpoint-questions'],
            'interview' => ['chapters', 'video-lessons', 'modules'],
        ];
        $cases = [];
        foreach ($allowed as $code => $resources) {
            foreach (array_keys(self::MODELS) as $resource) {
                $cases[$code.' '.$resource] = [$code, $resource, in_array($resource, $resources, true)];
            }
        }

        return $cases;
    }

    #[DataProvider('familyMatrix')]
    public function test_family_matrix_applies_to_create_and_parent_changes(string $code, string $resource, bool $allowed): void
    {
        $target = $this->chapter($code);
        $source = $code === 'n5' ? $target : $this->chapter();
        $targetPayload = $this->payload($resource, $target);
        $url = '/api/admin/'.$resource;
        $this->actingAs($this->admin);
        $response = $this->postJson($url, $targetPayload);
        if ($allowed) {
            $response->assertCreated();
        } else {
            $field = $resource === 'reading-questions' ? 'reading_passage_id' : 'chapter_id';
            $response->assertUnprocessable()->assertJsonValidationErrors($field);
        }
        if ($resource === 'video-lessons') {
            if ($allowed) {
                VideoLesson::findOrFail($response->json('data.id'))->delete();
            }
            $source = $this->chapter(number: 3);
        }
        $sourcePayload = $this->payload($resource, $source);
        if ($resource === 'chapters') {
            $sourcePayload['chapter_number'] = 102;
            $patch = ['program_id' => $target->program_id];
        } else {
            $field = $resource === 'reading-questions' ? 'reading_passage_id' : 'chapter_id';
            $patch = [$field => $targetPayload[$field]];
        }
        $id = $this->postJson($url, $sourcePayload)->assertCreated()->json('data.id');
        $class = self::MODELS[$resource];
        $before = $class::findOrFail($id)->getAttributes();
        $response = $this->patchJson($url.'/'.$id, $patch);
        if ($allowed) {
            $response->assertOk();
            foreach ($patch as $field => $value) {
                $response->assertJsonPath('data.'.$field, $value);
            }
        } else {
            $response->assertUnprocessable()->assertJsonValidationErrors($field);
            $this->assertSame($before, $class::findOrFail($id)->getAttributes());
        }
    }

    #[DataProvider('resources')]
    public function test_shared_validation_and_missing_parent_on_create_and_patch(string $resource): void
    {
        $chapter = $this->chapter();
        $payload = $this->payload($resource, $chapter);
        $item = $this->item($resource, $chapter);
        $parent = match ($resource) {
            'chapters' => 'program_id',
            'reading-questions' => 'reading_passage_id',
            default => 'chapter_id',
        };
        $invalid = [['status' => 'active'], ['status' => null], ['sort_order' => -1], ['sort_order' => null], ['sort_order' => 2147483648], [$parent => 0]];
        $this->actingAs($this->admin);
        foreach ($invalid as $fields) {
            $field = array_key_first($fields);
            $this->postJson('/api/admin/'.$resource, array_replace($payload, $fields))
                ->assertUnprocessable()->assertJsonValidationErrors($field);
            $this->patchJson('/api/admin/'.$resource.'/'.$item->id, $fields)
                ->assertUnprocessable()->assertJsonValidationErrors($field);
        }
        $this->postJson('/api/admin/'.$resource, [])->assertUnprocessable()->assertJsonValidationErrors($parent);
        $this->assertSame($item->getAttributes(), $item->fresh()->getAttributes());
    }

    public static function invalidQuestions(): array
    {
        $cases = [];
        $invalid = [
            'missing D' => [['options' => ['A' => 'A', 'B' => 'B', 'C' => 'C']], 'options'],
            'extra E' => [['options' => ['A' => 'A', 'B' => 'B', 'C' => 'C', 'D' => 'D', 'E' => 'E']], 'options'],
            'numeric keys' => [['options' => ['A', 'B', 'C', 'D']], 'options'],
            'wrong keys' => [['options' => ['a' => 'A', 'b' => 'B', 'c' => 'C', 'd' => 'D']], 'options'],
            'blank option' => [['options' => ['A' => ' ', 'B' => 'B', 'C' => 'C', 'D' => 'D']], 'options.A'],
            'nonstring option' => [['options' => ['A' => 1, 'B' => 'B', 'C' => 'C', 'D' => 'D']], 'options.A'],
            'null options' => [['options' => null], 'options'],
            'invalid answer' => [['correct_option' => 'E'], 'correct_option'],
            'lowercase answer' => [['correct_option' => 'a'], 'correct_option'],
            'null answer' => [['correct_option' => null], 'correct_option'],
            'empty question' => [['question' => ''], 'question'],
        ];
        foreach (['audio-questions', 'reading-questions', 'mini-checkpoint-questions'] as $resource) {
            foreach ($invalid as $name => [$fields, $field]) {
                $cases[$resource.' '.$name] = [$resource, $fields, $field];
            }
        }

        return $cases;
    }

    #[DataProvider('invalidQuestions')]
    public function test_fixed_a_to_d_question_validation_on_create_and_patch(string $resource, array $invalid, string $field): void
    {
        $chapter = $this->chapter();
        $item = $this->item($resource, $chapter);
        $this->actingAs($this->admin)->postJson('/api/admin/'.$resource, array_replace($this->payload($resource, $chapter), $invalid))
            ->assertUnprocessable()->assertJsonValidationErrors($field);
        $this->patchJson('/api/admin/'.$resource.'/'.$item->id, $invalid)
            ->assertUnprocessable()->assertJsonValidationErrors($field);
        $this->assertSame($item->getAttributes(), $item->fresh()->getAttributes());
    }

    public function test_chapter_numbers_are_positive_unique_per_program_and_patch_safe(): void
    {
        $first = $this->chapter();
        $second = $this->chapter(number: 2);
        $this->actingAs($this->admin);
        foreach ([0, -1, 2147483648, 1] as $number) {
            $this->postJson('/api/admin/chapters', ['program_id' => $first->program_id, 'chapter_number' => $number, 'title' => 'Fixture'])
                ->assertUnprocessable()->assertJsonValidationErrors('chapter_number');
            $this->patchJson('/api/admin/chapters/'.$second->id, ['chapter_number' => $number])
                ->assertUnprocessable()->assertJsonValidationErrors('chapter_number');
        }
        $this->postJson('/api/admin/chapters', ['program_id' => $this->program('n4')->id, 'chapter_number' => 1, 'title' => 'Fixture'])->assertCreated();
        $this->patchJson('/api/admin/chapters/'.$first->id, ['chapter_number' => 1])->assertOk();
        $this->assertSame(2, $second->fresh()->chapter_number);
    }

    public function test_chapter_cannot_move_incompatible_existing_content_to_another_family(): void
    {
        $chapter = $this->chapter();
        $this->item('audio-questions', $chapter);
        $this->actingAs($this->admin)->patchJson('/api/admin/chapters/'.$chapter->id, ['program_id' => $this->program('ssw-food')->id])
            ->assertUnprocessable()->assertJsonValidationErrors('program_id');
        $this->assertSame($this->program()->id, $chapter->fresh()->program_id);
        $this->patchJson('/api/admin/chapters/'.$chapter->id, ['program_id' => $this->program('n4')->id])->assertOk();
    }

    public function test_student_endpoints_require_active_student(): void
    {
        $chapter = $this->chapter();
        foreach ([$this->listUrl(), $this->detailUrl($chapter)] as $url) {
            $this->getJson($url)->assertUnauthorized();
        }
        $this->actingAs($this->admin);
        foreach ([$this->listUrl(), $this->detailUrl($chapter)] as $url) {
            $this->getJson($url)->assertForbidden();
        }
        $this->student->forceFill(['account_status' => 'inactive'])->save();
        $this->actingAs($this->student);
        foreach ([$this->listUrl(), $this->detailUrl($chapter)] as $url) {
            $this->getJson($url)->assertUnauthorized();
        }
    }

    public function test_free_chapter_list_is_published_ordered_safe_and_preview_is_ordinal_one(): void
    {
        $first = $this->chapter(overrides: ['sort_order' => 20]);
        $second = $this->chapter(number: 2, overrides: ['sort_order' => 10]);
        $third = $this->chapter(number: 3, overrides: ['sort_order' => 10]);
        $draft = $this->chapter(number: 4, overrides: ['status' => 'draft']);
        $this->chapter('n4');
        $data = $this->actingAs($this->student)->getJson($this->listUrl())->assertOk()->assertJsonCount(3, 'data')->json('data');
        $this->assertSame([$second->id, $third->id, $first->id], array_column($data, 'id'));
        $this->assertSame(['locked', 'locked', 'preview'], array_column($data, 'access'));
        foreach ($data as $row) {
            $this->assertKeys(['id', 'chapter_number', 'title', 'description', 'sort_order', 'access'], $row);
        }
        $this->getJson($this->detailUrl($first))->assertOk()->assertJsonPath('data.access', 'preview');
        $this->getJson($this->detailUrl($second))->assertForbidden();
        $this->getJson($this->detailUrl($draft))->assertNotFound();
    }

    public function test_inactive_and_missing_programs_and_chapters_are_not_found_even_with_grant(): void
    {
        $chapter = $this->chapter('n4');
        $draft = $this->chapter('n4', 2, ['status' => 'draft']);
        $this->grant('n4');
        $this->actingAs($this->student)->getJson($this->detailUrl($draft))->assertNotFound();
        $this->program('n4')->update(['status' => 'inactive']);
        $this->getJson($this->listUrl('n4'))->assertNotFound();
        $this->getJson($this->detailUrl($chapter))->assertNotFound();
        $this->getJson('/api/student/programs/0/chapters')->assertNotFound();
        $this->getJson('/api/student/chapters/0')->assertNotFound();
    }

    public static function paidPlans(): array
    {
        return [['lms'], ['sensei']];
    }

    #[DataProvider('paidPlans')]
    public function test_paid_n4_is_cumulative_and_n3_remains_preview(string $plan): void
    {
        $this->grant('n4', ['plan_code' => $plan]);
        $this->actingAs($this->student);
        foreach (['dasar', 'n5', 'n4', 'n3', 'n2', 'n1'] as $code) {
            $first = $this->chapter($code);
            $second = $this->chapter($code, 2);
            $full = in_array($code, ['dasar', 'n5', 'n4'], true);
            $this->getJson($this->listUrl($code))->assertOk()
                ->assertJsonPath('data.0.access', $full ? 'full' : 'preview')
                ->assertJsonPath('data.1.access', $full ? 'full' : 'locked');
            $this->getJson($this->detailUrl($first))->assertOk()->assertJsonPath('data.access', $full ? 'full' : 'preview');
            $response = $this->getJson($this->detailUrl($second));
            $full ? $response->assertOk()->assertJsonPath('data.access', 'full') : $response->assertForbidden();
        }
    }

    public static function ignoredGrants(): array
    {
        return [
            'future' => [['starts_at' => '2026-10-05']],
            'expired' => [['ends_at' => '2026-10-03']],
            'inactive' => [['status' => 'inactive']],
        ];
    }

    #[DataProvider('ignoredGrants')]
    public function test_nonqualifying_grants_do_not_unlock_chapters(array $overrides): void
    {
        $this->actingAs($this->student);
        foreach (['n4', 'ssw-food', 'interview'] as $code) {
            $first = $this->chapter($code);
            $second = $this->chapter($code, 2);
            $this->grant($code, $overrides);
            $this->getJson($this->listUrl($code))->assertOk()
                ->assertJsonPath('data.0.access', $code === 'n4' ? 'preview' : 'locked')
                ->assertJsonPath('data.1.access', 'locked');
            $this->getJson($this->detailUrl($second))->assertForbidden();
            if ($code !== 'n4') {
                $this->getJson($this->detailUrl($first))->assertForbidden();
            }
        }
    }

    public static function standalonePrograms(): array
    {
        return [['ssw-food', 'interview'], ['interview', 'ssw-food']];
    }

    #[DataProvider('standalonePrograms')]
    public function test_standalone_grant_unlocks_only_its_program(string $code, string $other): void
    {
        $first = $this->chapter($code);
        $second = $this->chapter($code, 2);
        $unowned = $this->chapter($other);
        $jlpt = $this->chapter('n5', 2);
        $this->actingAs($this->student)->getJson($this->detailUrl($first))->assertForbidden();
        $this->grant($code);
        $this->getJson($this->listUrl($code))->assertOk()->assertJsonPath('data.0.access', 'full')->assertJsonPath('data.1.access', 'full');
        $this->getJson($this->detailUrl($second))->assertOk()->assertJsonPath('data.access', 'full');
        $this->getJson($this->detailUrl($unowned))->assertForbidden();
        $this->getJson($this->detailUrl($jlpt))->assertForbidden();
    }

    public function test_student_detail_filters_drafts_orders_content_and_never_exposes_private_fields(): void
    {
        $chapter = $this->chapter();
        $other = $this->chapter(number: 2);
        $fields = [
            'video-lessons' => ['video_lessons', ['title', 'video_url', 'description']],
            'modules' => ['modules', ['title', 'file_url', 'module_type', 'description']],
            'flashcards' => ['flashcards', ['japanese', 'reading', 'meaning', 'example']],
            'audio-questions' => ['audio_questions', ['title', 'audio_url', 'question', 'options']],
            'reading-passages' => ['reading_passages', ['title', 'body', 'questions']],
        ];
        $expected = [];
        foreach ($fields as $resource => [$key]) {
            if ($resource === 'video-lessons') {
                $video = $this->item($resource, $chapter, ['status' => 'published']);
                $this->item($resource, $other, ['status' => 'draft']);
                $expected[$key] = [$video->id];

                continue;
            }
            $later = $this->item($resource, $chapter, ['status' => 'published', 'sort_order' => 20]);
            $earlier = $this->item($resource, $chapter, ['status' => 'published', 'sort_order' => 10]);
            $tie = $this->item($resource, $chapter, ['status' => 'published', 'sort_order' => 10]);
            $this->item($resource, $chapter, ['status' => 'draft']);
            $this->item($resource, $other, ['status' => 'published']);
            $expected[$key] = [$earlier->id, $tie->id, $later->id];
        }
        $passage = ReadingPassage::findOrFail($expected['reading_passages'][0]);
        $questionPayload = [
            'reading_passage_id' => $passage->id, 'question' => 'Nested fixture question?',
            'options' => ['A' => 'One', 'B' => 'Two', 'C' => 'Three', 'D' => 'Four'],
            'correct_option' => 'C', 'explanation' => 'Secret nested explanation', 'status' => 'published',
        ];
        $late = ReadingQuestion::create([...$questionPayload, 'sort_order' => 20]);
        $early = ReadingQuestion::create([...$questionPayload, 'sort_order' => 10]);
        $tie = ReadingQuestion::create([...$questionPayload, 'sort_order' => 10]);
        ReadingQuestion::create([...$questionPayload, 'status' => 'draft']);
        $this->item('mini-checkpoint-questions', $chapter, ['status' => 'draft']);
        $this->actingAs($this->student)->getJson($this->detailUrl($chapter))->assertOk()->assertJsonPath('data.mini_checkpoint.exists', false);
        $this->item('mini-checkpoint-questions', $chapter, ['status' => 'published']);
        $data = $this->getJson($this->detailUrl($chapter))->assertOk()->json('data');
        $this->assertKeys([
            'id', 'chapter_number', 'title', 'description', 'sort_order', 'access',
            'video_lessons', 'modules', 'flashcards', 'audio_questions', 'reading_passages', 'mini_checkpoint',
        ], $data);
        $this->assertSame(['exists' => true], $data['mini_checkpoint']);
        foreach ($fields as [$key, $publicFields]) {
            $this->assertSame($expected[$key], array_column($data[$key], 'id'));
            foreach ($data[$key] as $row) {
                $resolved = array_map(fn ($field) => $field.'_resolved_url', array_values(array_intersect($publicFields, ['video_url', 'file_url', 'audio_url'])));
                $this->assertKeys(['id', 'sort_order', ...$publicFields, ...$resolved], $row);
            }
        }
        $questions = $data['reading_passages'][0]['questions'];
        $this->assertSame([$early->id, $tie->id, $late->id], array_column($questions, 'id'));
        foreach ($questions as $question) {
            $this->assertKeys(['id', 'question', 'options', 'sort_order'], $question);
            $this->assertSame($questionPayload['options'], $question['options']);
        }
        $this->assertSame('猫', $data['flashcards'][0]['japanese']);
        $this->assertSame('ねこ', $data['flashcards'][0]['reading']);
        $this->assertSame('Cat', $data['flashcards'][0]['meaning']);
        $this->assertSame('猫です。', $data['flashcards'][0]['example']);
        $this->assertSame('Fixture body', $data['reading_passages'][0]['body']);
        $this->assertSame('grammar', $data['modules'][0]['module_type']);
        $this->assertSame(['A' => 'First', 'B' => 'Second', 'C' => 'Third', 'D' => 'Fourth'], $data['audio_questions'][0]['options']);
    }

    public function test_student_reads_do_not_write_progress_or_change_content_schema(): void
    {
        $chapter = $this->chapter();
        $this->item('flashcards', $chapter, ['status' => 'published']);
        $tables = Schema::getTableListing();
        $columns = [];
        foreach (self::MODELS as $class) {
            $table = (new $class)->getTable();
            $columns[$table] = Schema::getColumnListing($table);
            foreach ($columns[$table] as $column) {
                $this->assertDoesNotMatchRegularExpression('/progress|completed|unlocked|attempt|score|user_id/', $column);
            }
        }
        $this->actingAs($this->student);
        DB::enableQueryLog();
        DB::flushQueryLog();
        try {
            $this->getJson($this->listUrl())->assertOk();
            $this->getJson($this->detailUrl($chapter))->assertOk();
            $queries = DB::getQueryLog();
        } finally {
            DB::disableQueryLog();
        }
        foreach ($queries as $query) {
            $this->assertMatchesRegularExpression('/^\s*select\b/i', $query['query']);
        }
        $this->assertSame($tables, Schema::getTableListing());
        foreach ($columns as $table => $before) {
            $this->assertSame($before, Schema::getColumnListing($table));
        }
        $this->assertDatabaseCount('access_grants', 0);
    }

    public function test_deleting_passage_and_chapter_cascades_only_owned_content(): void
    {
        $chapter = $this->chapter();
        $other = $this->chapter(number: 2);
        $passage = $this->item('reading-passages', $chapter);
        $question = ReadingQuestion::create([
            ...$this->payload('mini-checkpoint-questions', $chapter), 'reading_passage_id' => $passage->id,
        ]);
        $this->actingAs($this->admin)->deleteJson('/api/admin/reading-passages/'.$passage->id)->assertNoContent();
        $this->assertNull($question->fresh());
        $owned = [];
        foreach (array_keys(self::MODELS) as $resource) {
            if ($resource !== 'chapters') {
                $owned[] = $this->item($resource, $chapter);
            }
        }
        $unrelated = $this->item('video-lessons', $other);
        $this->deleteJson('/api/admin/chapters/'.$chapter->id)->assertNoContent();
        foreach ($owned as $item) {
            $this->assertNull($item->fresh());
        }
        $this->assertNotNull($other->fresh());
        $this->assertNotNull($unrelated->fresh());
    }

    public function test_mini_checkpoint_question_session_part_and_duration_authoring(): void
    {
        $chapter = $this->chapter();
        $payload = [
            'chapter_id' => $chapter->id,
            'question' => 'Pertanyaan Mini Sesi 1 Part 2',
            'options' => ['A' => 'Opt A', 'B' => 'Opt B', 'C' => 'Opt C', 'D' => 'Opt D'],
            'correct_option' => 'C',
            'session' => 1,
            'part' => 2,
            'duration_minutes' => 25,
            'status' => 'published',
            'sort_order' => 1,
        ];
        $response = $this->actingAs($this->admin)->postJson('/api/admin/mini-checkpoint-questions', $payload)->assertCreated();
        $response->assertJsonPath('data.session', 1)
            ->assertJsonPath('data.part', 2)
            ->assertJsonPath('data.duration_minutes', 25);

        $this->actingAs($this->admin)->patchJson('/api/admin/mini-checkpoint-questions/'.$response->json('data.id'), [
            'part' => 3,
            'duration_minutes' => 30,
        ])->assertOk()
            ->assertJsonPath('data.part', 3)
            ->assertJsonPath('data.duration_minutes', 30);
    }
}
