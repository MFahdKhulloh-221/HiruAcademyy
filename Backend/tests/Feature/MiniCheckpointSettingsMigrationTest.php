<?php

namespace Tests\Feature;

use App\Models\Chapter;
use App\Models\MiniCheckpointQuestion;
use App\Models\Program;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class MiniCheckpointSettingsMigrationTest extends TestCase
{
    use DatabaseTransactions;

    public function test_backfill_leaves_ambiguous_inconsistent_and_missing_settings_unconfigured(): void
    {
        $program = Program::create(['code' => 'mini-backfill', 'slug' => 'mini-backfill', 'name' => 'Backfill', 'family' => 'jlpt', 'status' => 'active', 'sort_order' => 0]);
        $chapters = [];
        foreach (['valid', 'groups', 'inconsistent', 'missing'] as $index => $case) {
            $chapter = $chapters[$case] = Chapter::create(['program_id' => $program->id, 'chapter_number' => $index + 1, 'title' => $case]);
            foreach ([0, 1] as $row) {
                MiniCheckpointQuestion::create(['chapter_id' => $chapter->id, 'question' => 'Test', 'options' => ['A' => 'A', 'B' => 'B', 'C' => 'C', 'D' => 'D'], 'correct_option' => 'A', 'session' => $case === 'groups' ? $row + 1 : 1, 'part' => 1, 'duration_minutes' => $case === 'missing' ? null : ($case === 'inconsistent' ? 5 + $row : 5), 'passing_score' => 70]);
            }
        }
        $migration = require database_path('migrations/2026_11_12_000003_add_mini_checkpoint_settings_to_chapters.php');
        $migration->down();
        $migration->up();
        $this->assertSame(5, $chapters['valid']->fresh()->mini_checkpoint_duration_minutes);
        $this->assertSame(70, $chapters['valid']->fresh()->mini_checkpoint_passing_score);
        foreach (['groups', 'inconsistent', 'missing'] as $case) {
            $this->assertNull($chapters[$case]->fresh()->mini_checkpoint_duration_minutes);
            $this->assertNull($chapters[$case]->fresh()->mini_checkpoint_passing_score);
        }
    }
}
