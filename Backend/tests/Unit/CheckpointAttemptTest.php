<?php

namespace Tests\Unit;

use App\Models\CheckpointAttempt;
use App\Models\CheckpointPackage;
use App\Models\Program;
use App\Models\User;
use App\Services\ChapterAccessPolicy;
use App\Services\LegacyCheckpointAttemptService as CheckpointAttemptService;
use App\Services\LegacyCheckpointPackageService as CheckpointPackageService;
use App\Services\MediaService;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class CheckpointAttemptTest extends TestCase
{
    private function content(): array
    {
        return array_map(fn ($session, $id) => ['id' => $id, 'session' => $session, 'question' => 'Question', 'options' => ['A' => 'A', 'B' => 'B', 'C' => 'C', 'D' => 'D'], 'audio_url' => null, 'reading_passage' => null], array_keys(CheckpointPackageService::SESSIONS), [1, 2, 3, 4]);
    }

    public function test_grading_uses_equal_weights_and_unrounded_pass_comparison(): void
    {
        $content = $this->content();
        $grading = ['passing_score' => 75, 'questions' => array_fill_keys([1, 2, 3, 4], ['correct_option' => 'B'])];
        $result = CheckpointAttemptService::grade($content, $grading, [1 => 'B', 2 => 'B', 3 => 'B', 4 => 'A']);
        $this->assertEquals(75, $result['score']);
        $this->assertTrue($result['passed']);
        $this->assertSame(3, $result['correct']);
        $this->assertSame(1, $result['wrong']);
        $this->assertCount(4, $result['sessions']);
        $this->assertFalse(CheckpointAttemptService::grade($content, $grading, [1 => 'B', 2 => 'B'])['passed']);
        $this->assertSame(4, CheckpointAttemptService::grade($content, $grading, [])['unanswered']);
        $this->assertFalse(CheckpointAttemptService::grade([], $grading, [])['passed']);
    }

    public function test_answer_merge_preserves_other_answers_and_rejects_foreign_question_or_option(): void
    {
        $this->assertSame([1 => 'B', 2 => 'A'], CheckpointAttemptService::mergeAnswers([1 => 'B'], [2 => 'A'], $this->content()));
        $this->assertSame([], CheckpointAttemptService::mergeAnswers([1 => 'B'], [1 => null], $this->content()));
        foreach ([[999 => 'A'], [1 => 'E'], ['invalid' => 'A'], [1 => ['A']]] as $invalid) {
            try {
                CheckpointAttemptService::mergeAnswers([], $invalid, $this->content());
                $this->fail('Invalid answer must fail.');
            } catch (ValidationException $error) {
                $this->assertArrayHasKey('answers', $error->errors());
            }
        }
    }

    public function test_ownership_draft_and_entitlement_fail_closed(): void
    {
        $policy = $this->createMock(ChapterAccessPolicy::class);
        $policy->method('canAccessProgram')->willReturn(true);
        $policy->method('canAccessChapter')->willReturn(false);
        $service = new CheckpointAttemptService($policy, new CheckpointPackageService);
        $package = (new CheckpointPackage)->forceFill(['id' => 7, 'program_id' => 3, 'status' => 'published', 'access_type' => 'free']);
        $package->setRelation('program', new Program(['code' => 'n5', 'status' => 'active']));
        $user = (new User)->forceFill(['id' => 1, 'role' => 'student', 'account_status' => 'active']);
        $attempt = new CheckpointAttempt(['user_id' => 1, 'checkpoint_package_id' => 7]);
        $service->authorize($user, $package, $attempt);
        $this->assertTrue($service->canAccess($user, $package));
        foreach (['foreign_user', 'foreign_package', 'draft', 'membership', 'inactive_account'] as $case) {
            $p = clone $package;
            $a = clone $attempt;
            $u = clone $user;
            match ($case) {
                'foreign_user' => $a->user_id = 2,
                'foreign_package' => $a->checkpoint_package_id = 8,
                'draft' => $p->status = 'draft',
                'membership' => $p->access_type = 'membership',
                'inactive_account' => $u->account_status = 'inactive',
            };
            try {
                $service->authorize($u, $p, $case === 'draft' ? null : $a);
                $this->fail('Unauthorized request must fail.');
            } catch (HttpException $error) {
                $this->assertSame(in_array($case, ['foreign_user', 'foreign_package', 'draft'], true) ? 404 : 403, $error->getStatusCode());
            }
        }
    }

    public function test_payload_hides_key_until_completed_review_and_deadline_is_inclusive(): void
    {
        $media = $this->createMock(MediaService::class);
        $media->method('payload')->willReturnCallback(fn ($item) => $item);
        $this->app->instance(MediaService::class, $media);
        $service = new CheckpointAttemptService($this->createMock(ChapterAccessPolicy::class), new CheckpointPackageService);
        $this->travelTo(now()->startOfSecond());
        try {
            $attempt = (new CheckpointAttempt)->forceFill(['id' => 5, 'checkpoint_package_id' => 7, 'status' => 'in_progress', 'revision' => 0, 'answers' => [], 'content_snapshot' => $this->content(), 'grading_snapshot' => ['questions' => array_fill_keys([1, 2, 3, 4], ['correct_option' => 'B', 'explanation' => 'Secret'])], 'started_at' => now()->subMinute(), 'expires_at' => now()]);
            $this->assertTrue($service->expired($attempt));
            $payload = $service->payload($attempt);
            $this->assertNull($payload['result']);
            $this->assertStringNotContainsString('correct_option', json_encode($payload));
            $this->assertStringNotContainsString('Secret', json_encode($payload));
            try {
                $service->payload($attempt, true);
                $this->fail('Active review must fail.');
            } catch (HttpException $error) {
                $this->assertSame(403, $error->getStatusCode());
            }
            $attempt->status = 'completed';
            $this->assertSame('B', $service->payload($attempt, true)['questions'][0]['correct_option']);
            $this->assertFalse($service->expired($attempt));
        } finally {
            $this->travelBack();
        }
    }
}
