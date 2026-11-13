<?php

namespace Tests\Feature;

use App\Models\Chapter;
use App\Models\Flashcard;
use App\Models\Program;
use App\Models\User;
use Database\Seeders\ProgramSeeder;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class FlashcardAuthoringTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ProgramSeeder::class);
        $admin = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $admin->forceFill(['role' => 'admin', 'account_status' => 'active'])->save();
        $this->actingAs($admin);
    }

    private function chapter(string $code): Chapter
    {
        return Chapter::create([
            'program_id' => Program::where('code', $code)->firstOrFail()->id,
            'chapter_number' => 901,
            'title' => 'Flashcard fixture',
        ]);
    }

    private function payload(Chapter $chapter): array
    {
        return ['chapter_id' => $chapter->id, 'japanese' => '猫', 'meaning' => 'Cat'];
    }

    public static function jlptPrograms(): array
    {
        return array_map(fn ($code) => [$code], ['n5', 'n4', 'n3', 'n2', 'n1']);
    }

    #[DataProvider('jlptPrograms')]
    public function test_create_without_reading_or_example_and_patch_preserves_stored_reading(string $code): void
    {
        $chapter = $this->chapter($code);
        $id = $this->postJson('/api/admin/flashcards', $this->payload($chapter))
            ->assertCreated()->assertJsonPath('data.reading', '')->json('data.id');
        $card = Flashcard::findOrFail($id);
        $this->assertNull($card->example);
        $card->update(['reading' => 'ねこ']);
        $this->patchJson('/api/admin/flashcards/'.$id, ['meaning' => 'Kucing', 'example' => '猫です。'])
            ->assertOk()->assertJsonPath('data.reading', 'ねこ')->assertJsonPath('data.meaning', 'Kucing');
        $this->assertSame('ねこ', $card->fresh()->reading);
    }

    public static function unsupportedPrograms(): array
    {
        return [['dasar'], ['ssw-food'], ['interview'], ['jlpt-other']];
    }

    #[DataProvider('unsupportedPrograms')]
    public function test_create_patch_and_chapter_move_reject_unsupported_programs(string $code): void
    {
        if ($code === 'jlpt-other') {
            Program::create(['code' => $code, 'slug' => $code, 'name' => 'Other JLPT', 'family' => 'jlpt', 'sort_order' => 0]);
        }
        $source = $this->chapter('n5');
        $target = $this->chapter($code);
        $this->postJson('/api/admin/flashcards', $this->payload($target))
            ->assertUnprocessable()->assertJsonValidationErrors('chapter_id');
        $id = $this->postJson('/api/admin/flashcards', $this->payload($source))->assertCreated()->json('data.id');
        $this->patchJson('/api/admin/flashcards/'.$id, ['chapter_id' => $target->id])
            ->assertUnprocessable()->assertJsonValidationErrors('chapter_id');
        $this->assertSame($source->id, Flashcard::findOrFail($id)->chapter_id);
        $this->patchJson('/api/admin/chapters/'.$source->id, ['program_id' => $target->program_id])
            ->assertUnprocessable()->assertJsonValidationErrors('program_id');
        $this->assertSame($source->program_id, $source->fresh()->program_id);

        // Legacy content must not bypass validation when PATCH omits chapter_id.
        $legacy = Flashcard::create([...$this->payload($target), 'reading' => 'ねこ']);
        $this->patchJson('/api/admin/flashcards/'.$legacy->id, ['meaning' => 'Kucing'])
            ->assertUnprocessable()->assertJsonValidationErrors('chapter_id');
        $this->assertSame('Cat', $legacy->fresh()->meaning);
    }

    public function test_flashcard_and_its_chapter_can_move_between_jlpt_levels(): void
    {
        $source = $this->chapter('n5');
        $target = $this->chapter('n1');
        $id = $this->postJson('/api/admin/flashcards', $this->payload($source))->assertCreated()->json('data.id');
        $this->patchJson('/api/admin/flashcards/'.$id, ['chapter_id' => $target->id])->assertOk();
        $this->patchJson('/api/admin/chapters/'.$target->id, ['program_id' => Program::where('code', 'n2')->firstOrFail()->id])
            ->assertOk();
        $this->assertSame($target->id, Flashcard::findOrFail($id)->chapter_id);
    }
}
