<?php

namespace Tests\Unit;

use App\Models\Program;
use App\Models\User;
use App\Services\ChapterAccessPolicy;
use App\Services\LearningProgressService;
use App\Services\ProgramAchievementEligibility;
use PHPUnit\Framework\TestCase;

final class ProgramAchievementEligibilityTest extends TestCase
{
    private ProgramAchievementEligibility $service;

    private User $user;

    private Program $program;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new ProgramAchievementEligibility(new LearningProgressService($this->createMock(ChapterAccessPolicy::class)));
        $this->user = (new User)->forceFill(['id' => 17]);
        $this->program = (new Program)->forceFill(['id' => 247, 'family' => 'jlpt', 'code' => 'n4', 'status' => 'active']);
    }

    public function test_loading_attempt_evidence_keeps_hidden_fields_for_internal_validation(): void
    {
        $source = file_get_contents(dirname(__DIR__, 2).'/app/Services/ProgramAchievementEligibility.php');
        $this->assertStringContainsString("makeVisible(['content_snapshot', 'grading_snapshot', 'answers'])", $source);
    }

    public function test_draft_program_never_qualifies(): void
    {
        $this->program->status = 'draft';
        $this->assertSame('inactive_program', $this->service->evaluateEvidence($this->user, $this->program, [], [], [])['reason']);
    }

    private function chapter(string $type = 'video', int $id = 81): array
    {
        return ['id' => 39, 'program_id' => 247, 'status' => 'published', 'reading_ready' => true,
            'tasks' => [$type => [['id' => $id, 'chapter_id' => 39, 'status' => 'published']]]];
    }

    private function completion(string $type = 'video', int $id = 81): array
    {
        return ['id' => 901, 'user_id' => 17, 'chapter_id' => 39, 'type' => $type, 'resource_id' => $id, 'completed_at' => '2026-11-09T01:00:00Z'];
    }

    private function attempt(string $kind): array
    {
        return ['id' => 801, 'user_id' => 17, 'chapter_id' => 39, 'kind' => $kind, 'status' => 'completed',
            'submitted_at' => '2026-11-09T01:00:00Z',
            'content_snapshot' => [
                ['id' => 81, 'options' => ['A' => 'one', 'B' => 'two', 'C' => 'three', 'D' => 'four']],
                ['id' => 82, 'options' => ['A' => 'one', 'B' => 'two', 'C' => 'three', 'D' => 'four']],
            ],
            'grading_snapshot' => [81 => ['correct_option' => 'A'], 82 => ['correct_option' => 'B']],
            'answers' => [81 => 'D', 82 => 'D']];
    }

    private function evaluate(array $chapters, array $completions = [], array $attempts = []): array
    {
        return $this->service->evaluateEvidence($this->user, $this->program, $chapters, $completions, $attempts);
    }

    public function test_empty_program_and_empty_published_chapter_fail(): void
    {
        self::assertSame('empty_program', $this->evaluate([])['reason']);
        $chapter = $this->chapter();
        $chapter['tasks'] = [];
        self::assertSame('empty_chapter', $this->evaluate([$chapter])['reason']);
        $chapter['tasks'] = ['mini' => [['id' => 8, 'status' => 'published']]];
        self::assertSame('empty_chapter', $this->evaluate([$chapter])['reason']);
        $chapter['status'] = 'draft';
        self::assertSame('empty_program', $this->evaluate([$chapter])['reason']);
    }

    public function test_missing_cross_user_cross_chapter_wrong_type_and_stale_completions_fail(): void
    {
        self::assertFalse($this->evaluate([$this->chapter()])['eligible']);
        foreach (['user_id' => 18, 'chapter_id' => 40, 'type' => 'module', 'resource_id' => 80, 'completed_at' => null, 'id' => null] as $key => $value) {
            $completion = array_replace($this->completion(), [$key => $value]);
            self::assertFalse($this->evaluate([$this->chapter()], [$completion])['eligible'], $key);
        }
        self::assertTrue($this->evaluate([$this->chapter()], [$this->completion()])['eligible']);
    }

    public function test_all_published_chapters_and_all_current_tasks_required(): void
    {
        $second = $this->chapter();
        $second['id'] = 40;
        $second['tasks']['video'][0]['chapter_id'] = 40;
        self::assertFalse($this->evaluate([$this->chapter(), $second], [$this->completion()])['eligible']);
        $completion = array_replace($this->completion(), ['id' => 902, 'chapter_id' => 40]);
        self::assertTrue($this->evaluate([$this->chapter(), $second], [$this->completion(), $completion])['eligible']);
        $chapter = $this->chapter();
        $chapter['tasks']['video'][] = ['id' => 82, 'chapter_id' => 39, 'status' => 'published'];
        self::assertFalse($this->evaluate([$chapter], [$this->completion()])['eligible']);
    }

    public function test_unpublished_tasks_do_not_count_and_invalid_tuples_fail(): void
    {
        foreach (['chapter_id' => 40, 'id' => null] as $key => $value) {
            $chapter = $this->chapter();
            $chapter['tasks']['video'][0][$key] = $value;
            self::assertSame('invalid_content', $this->evaluate([$chapter], [$this->completion()])['reason']);
        }
        $chapter = $this->chapter();
        $chapter['program_id'] = 248;
        self::assertSame('invalid_content', $this->evaluate([$chapter], [$this->completion()])['reason']);
        $chapter = $this->chapter();
        $chapter['tasks']['video'][0]['status'] = 'draft';
        self::assertSame('empty_chapter', $this->evaluate([$chapter], [$this->completion()])['reason']);
    }

    public function test_empty_published_reading_passage_fails_even_when_other_tasks_complete(): void
    {
        $chapter = $this->chapter();
        $chapter['reading_ready'] = false;
        self::assertSame('invalid_content', $this->evaluate([$chapter], [$this->completion()])['reason']);
    }

    public function test_audio_and_reading_require_whole_valid_snapshot_not_correctness(): void
    {
        foreach (['audio', 'reading'] as $kind) {
            $chapter = $this->chapter($kind);
            $completion = $this->completion($kind);
            $attempt = $this->attempt($kind);
            self::assertTrue($this->evaluate([$chapter], [$completion], [$attempt])['eligible']);
            self::assertFalse($this->evaluate([$chapter], [], [$attempt])['eligible']);
            self::assertFalse($this->evaluate([$chapter], [$completion])['eligible']);
            foreach ([[], [81 => 'D'], [81 => 'D', 82 => 'E'], [81 => 'D', 83 => 'D']] as $answers) {
                self::assertFalse($this->evaluate([$chapter], [$completion], [array_replace($attempt, ['answers' => $answers])])['eligible']);
            }
            foreach (['user_id' => 18, 'chapter_id' => 40, 'kind' => 'mini', 'status' => 'in_progress', 'submitted_at' => null] as $key => $value) {
                self::assertFalse($this->evaluate([$chapter], [$completion], [array_replace($attempt, [$key => $value])])['eligible'], $key);
            }
            self::assertFalse($this->evaluate([$this->chapter($kind, 99)], [$this->completion($kind, 99)], [$attempt])['eligible']);
        }
    }

    public function test_foundation_published_practice_requires_full_attempt_and_rejects_empty_timeout(): void
    {
        $this->program->family = 'foundation';
        foreach (['audio', 'reading'] as $kind) {
            $chapter = $this->chapter($kind);
            $completion = $this->completion($kind);
            $attempt = $this->attempt($kind);
            self::assertTrue($this->evaluate([$chapter], [$completion], [$attempt])['eligible']);
            self::assertFalse($this->evaluate([$chapter], [$completion])['eligible']);
            $attempt['answers'] = [];
            self::assertFalse($this->evaluate([$chapter], [$completion], [$attempt])['eligible']);
        }
        $chapter = $this->chapter();
        $chapter['reading_ready'] = false;
        self::assertSame('invalid_content', $this->evaluate([$chapter], [$this->completion()])['reason']);
    }

    public function test_corrupt_options_grading_and_duplicate_snapshot_ids_fail(): void
    {
        $base = $this->attempt('audio');
        $variants = [];
        $attempt = $base;
        unset($attempt['content_snapshot'][1]['options']['D']);
        $variants[] = $attempt;
        $attempt = $base;
        $attempt['content_snapshot'][1]['options']['D'] = '';
        $variants[] = $attempt;
        $attempt = $base;
        unset($attempt['grading_snapshot'][82]);
        $variants[] = $attempt;
        $attempt = $base;
        $attempt['grading_snapshot'][82]['correct_option'] = 'E';
        $variants[] = $attempt;
        $attempt = $base;
        $attempt['content_snapshot'][1]['id'] = 81;
        $variants[] = $attempt;
        $attempt = $base;
        $attempt['grading_snapshot'] = [81 => ['correct_option' => 'A'], 99 => ['correct_option' => 'B']];
        $variants[] = $attempt;
        $attempt = $base;
        $attempt['content_snapshot'] = [];
        $attempt['answers'] = [];
        $attempt['grading_snapshot'] = [];
        $variants[] = $attempt;
        foreach ($variants as $attempt) {
            self::assertFalse($this->evaluate([$this->chapter('audio')], [$this->completion('audio')], [$attempt])['eligible']);
        }
    }

    public function test_unsupported_families_and_extra_published_tasks_are_unresolved(): void
    {
        $this->program->family = 'unknown';
        self::assertSame('policy_unresolved', $this->evaluate([$this->chapter()])['reason']);
        foreach (['foundation' => ['unknown'], 'interview' => ['flashcard', 'audio', 'reading'], 'ssw' => ['audio', 'reading'], 'jlpt' => ['unknown']] as $family => $types) {
            $this->program->family = $family;
            foreach ($types as $type) {
                self::assertSame('policy_unresolved', $this->evaluate([$this->chapter($type)])['reason']);
            }
        }
    }

    public function test_program_ids_are_dynamic_and_known_absent_types_allowed(): void
    {
        foreach (['ssw' => 'ssw-food', 'interview' => 'interview-custom', 'jlpt' => 'n4', 'foundation' => 'dasar'] as $family => $code) {
            $this->program->forceFill(['id' => 7023, 'family' => $family, 'code' => $code]);
            $chapter = $this->chapter();
            $chapter['program_id'] = 7023;
            self::assertTrue($this->evaluate([$chapter], [$this->completion()])['eligible']);
        }
    }

    public function test_evidence_contains_only_ids_and_timestamps_never_answers_or_grading(): void
    {
        $result = $this->evaluate([$this->chapter('reading')], [$this->completion('reading')], [$this->attempt('reading')]);
        self::assertSame(['eligible' => true, 'reason' => 'eligible', 'evidence' => [
            'policy_version' => 1, 'program_id' => 247, 'user_id' => 17,
            'chapters' => [['chapter_id' => 39, 'tasks' => [[
                'type' => 'reading', 'resource_id' => 81, 'completion_id' => 901,
                'completed_at' => '2026-11-09T01:00:00Z', 'attempt_id' => 801, 'submitted_at' => '2026-11-09T01:00:00Z',
            ]]]],
        ]], $result);
        $serialized = json_encode($result['evidence'], JSON_THROW_ON_ERROR);
        foreach (['answers', 'correct_option', 'content_snapshot', 'grading_snapshot', 'options', 'question'] as $secret) {
            self::assertStringNotContainsString($secret, $serialized);
        }
    }

    public function test_evaluate_delegates_to_read_only_evidence_hook_without_database(): void
    {
        $service = new class(new LearningProgressService($this->createMock(ChapterAccessPolicy::class))) extends ProgramAchievementEligibility
        {
            protected function loadEvidence(User $user, Program $program): array
            {
                return [[], [], []];
            }
        };
        self::assertSame('empty_program', $service->evaluate($this->user, $this->program)['reason']);
    }
}
