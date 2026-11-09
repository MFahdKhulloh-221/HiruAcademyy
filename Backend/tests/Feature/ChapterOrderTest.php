<?php

namespace Tests\Feature;

use App\Models\Chapter;
use App\Models\CheckpointQuestion;
use App\Models\Program;
use App\Services\LearningContentService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class ChapterOrderTest extends TestCase
{
    use DatabaseTransactions;

    private function program(string $suffix): Program
    {
        return Program::create(['code' => 'r14-'.$suffix, 'slug' => 'r14-'.$suffix, 'name' => 'Chapter order', 'family' => 'foundation', 'sort_order' => 0]);
    }

    private function chapter(Program $program, int $number, int $order): Chapter
    {
        return Chapter::create(['program_id' => $program->id, 'chapter_number' => $number, 'title' => 'Chapter '.$number, 'sort_order' => $order]);
    }

    private function assertOrder(Program $program, array $ids): void
    {
        $rows = Chapter::where('program_id', $program->id)->orderBy('sort_order')->orderBy('chapter_number')->orderBy('id')->get();
        $this->assertSame($ids, $rows->modelKeys());
        $this->assertSame($ids === [] ? [] : range(0, count($ids) - 1), $rows->pluck('sort_order')->all());
    }

    public function test_moves_normalize_legacy_duplicates_and_leave_other_programs_and_chapter_numbers_unchanged(): void
    {
        $service = app(LearningContentService::class);
        $program = $this->program('moves');
        $other = $this->program('untouched');
        $unrelated = $this->chapter($other, 1, 9);
        $a = $this->chapter($program, 1, 1);
        $c = $this->chapter($program, 3, 2);
        $b = $this->chapter($program, 2, 2);
        $d = $this->chapter($program, 4, 4);
        $e = $this->chapter($program, 5, 5);
        $service->save('chapters', ['status' => 'published'], $a);
        $this->assertSame([1, 2, 2, 4, 5], Chapter::where('program_id', $program->id)->orderBy('chapter_number')->pluck('sort_order')->all());
        $service->save('chapters', ['sort_order' => 0], $e);
        $this->assertOrder($program, [$e->id, $a->id, $b->id, $c->id, $d->id]);
        $service->save('chapters', ['sort_order' => 4], $e);
        $this->assertOrder($program, [$a->id, $b->id, $c->id, $d->id, $e->id]);
        $service->save('chapters', ['sort_order' => 2], $a);
        $this->assertOrder($program, [$b->id, $c->id, $a->id, $d->id, $e->id]);
        $this->assertSame(9, $unrelated->fresh()->sort_order);
        foreach ([$a, $b, $c, $d, $e] as $index => $chapter) {
            $this->assertSame($index + 1, $chapter->fresh()->chapter_number);
        }
    }

    public function test_create_insert_append_parent_move_and_delete_compact_only_affected_groups(): void
    {
        $service = app(LearningContentService::class);
        $source = $this->program('source');
        $target = $this->program('target');
        $empty = $this->program('empty');
        $create = fn ($number, $extra = []) => $service->save('chapters', [...['program_id' => $source->id, 'chapter_number' => $number, 'title' => 'Chapter'], ...$extra]);
        $a = $create(1);
        $this->assertOrder($source, [$a->id]);
        $b = $create(2);
        $c = $create(3, ['sort_order' => 1]);
        $this->assertOrder($source, [$a->id, $c->id, $b->id]);
        $t = $this->chapter($target, 9, 7);
        $service->save('chapters', ['program_id' => $target->id], $c);
        $this->assertOrder($source, [$a->id, $b->id]);
        $this->assertOrder($target, [$t->id, $c->id]);
        $service->save('chapters', ['program_id' => $target->id, 'sort_order' => 0], $a);
        $this->assertOrder($source, [$b->id]);
        $this->assertOrder($target, [$a->id, $t->id, $c->id]);
        $service->save('chapters', ['program_id' => $empty->id], $b);
        $this->assertOrder($source, []);
        $this->assertOrder($empty, [$b->id]);
        $service->delete('chapters', $t->id);
        $this->assertOrder($target, [$a->id, $c->id]);
        $service->delete('chapters', $b->id);
        $this->assertOrder($empty, []);
    }

    public function test_invalid_bounds_and_failed_delete_do_not_partially_normalize(): void
    {
        $service = app(LearningContentService::class);
        $program = $this->program('bounds');
        $target = $this->program('bounds-target');
        $a = $this->chapter($program, 1, 4);
        $b = $this->chapter($program, 2, 4);
        foreach ([['sort_order' => -1], ['sort_order' => 2], ['program_id' => $target->id, 'sort_order' => 1]] as $input) {
            try {
                $service->save('chapters', $input + ['title' => 'Must roll back'], $a);
                $this->fail('Invalid position accepted.');
            } catch (ValidationException $exception) {
                $this->assertArrayHasKey('sort_order', $exception->errors());
            }
            $this->assertSame(4, $a->fresh()->sort_order);
            $this->assertSame(4, $b->fresh()->sort_order);
            $this->assertSame('Chapter 1', $a->fresh()->title);
            $this->assertSame($program->id, $a->fresh()->program_id);
        }
        try {
            $service->save('chapters', ['program_id' => $target->id, 'chapter_number' => 1, 'title' => 'Invalid', 'sort_order' => 1]);
            $this->fail('Invalid empty-group insertion accepted.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('sort_order', $exception->errors());
        }
        $this->assertOrder($target, []);
        CheckpointQuestion::create(['chapter_id' => $a->id, 'question' => 'Question', 'options' => ['A' => 'A', 'B' => 'B', 'C' => 'C', 'D' => 'D'], 'correct_option' => 'A']);
        try {
            $service->delete('chapters', $a->id);
            $this->fail('Guarded delete accepted.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('chapter', $exception->errors());
        }
        $this->assertSame(4, $a->fresh()->sort_order);
        $this->assertSame(4, $b->fresh()->sort_order);
    }

    public function test_two_sequential_moves_use_current_positions_even_with_stale_models(): void
    {
        $service = app(LearningContentService::class);
        $program = $this->program('sequential');
        $a = $this->chapter($program, 1, 0);
        $b = $this->chapter($program, 2, 1);
        $c = $this->chapter($program, 3, 2);
        $staleA = $a->fresh();
        $staleC = $c->fresh();

        $service->save('chapters', ['sort_order' => 0], $staleC);
        $this->assertOrder($program, [$c->id, $a->id, $b->id]);
        $service->save('chapters', ['sort_order' => 2], $staleA);
        $this->assertOrder($program, [$c->id, $b->id, $a->id]);
    }

    public function test_outer_transaction_rollback_restores_move_create_and_delete(): void
    {
        $service = app(LearningContentService::class);
        $program = $this->program('rollback');
        $a = $this->chapter($program, 1, 1);
        $b = $this->chapter($program, 2, 3);
        try {
            DB::transaction(function () use ($service, $program, $a, $b) {
                $service->save('chapters', ['sort_order' => 0], $b);
                $service->save('chapters', ['program_id' => $program->id, 'chapter_number' => 3, 'title' => 'Rolled back']);
                $service->delete('chapters', $a->id);
                throw new \RuntimeException('Rollback chapter writes');
            });
            $this->fail('Transaction did not abort.');
        } catch (\RuntimeException $exception) {
            $this->assertSame('Rollback chapter writes', $exception->getMessage());
        }
        $this->assertSame(1, $a->fresh()->sort_order);
        $this->assertSame(3, $b->fresh()->sort_order);
        $this->assertSame(2, Chapter::where('program_id', $program->id)->count());
    }
}
