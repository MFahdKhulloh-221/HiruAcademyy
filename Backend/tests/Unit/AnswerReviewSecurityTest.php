<?php

namespace Tests\Unit;

use App\Models\Chapter;
use App\Models\LearningAttempt;
use App\Models\Program;
use App\Models\TryOut;
use App\Models\TryOutAttempt;
use App\Models\User;
use App\Services\ChapterAccessPolicy;
use App\Services\LearningAttemptService;
use App\Services\LearningProgressService;
use App\Services\MediaService;
use App\Services\TryOutAttemptService;
use App\Services\TryOutService;
use Illuminate\Container\Container;
use Illuminate\Support\Carbon;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpKernel\Exception\HttpException;

final class AnswerReviewSecurityTest extends TestCase
{
    public function test_active_payloads_hide_keys_and_completed_review_preserves_answers(): void
    {
        $previous = Container::getInstance();
        Container::setInstance(new class extends Container {
            public function abort($code, $message = '', array $headers = []): never
            {
                throw new HttpException($code, $message, null, $headers);
            }
        });
        app()->instance(MediaService::class, new MediaService);
        try {
            foreach (['reading', 'mini', 'tryout'] as $kind) {
                $service = $kind === 'tryout'
                    ? new TryOutAttemptService($this->createMock(ChapterAccessPolicy::class), new TryOutService)
                    : new LearningAttemptService($this->createMock(LearningProgressService::class));
                $content = array_map(fn ($id) => ['id' => $id, 'session' => $kind === 'tryout' ? 'vocabulary_kanji' : 1, 'part' => 1, 'duration_minutes' => 10, 'passing_score' => 70, 'question' => 'Question', 'options' => ['A' => 'A', 'B' => 'B'], 'correct_option' => 'B', 'explanation' => 'Injected secret'], [1, 2, 3]);
                $grades = array_fill_keys([1, 2, 3], ['correct_option' => 'A', 'explanation' => '<ruby>学校<rt>がっこう</rt></ruby>', 'point_value' => 1]);
                $attempt = $kind === 'tryout' ? new TryOutAttempt : new LearningAttempt;
                $attempt->forceFill(['id' => 9, 'user_id' => 1, 'chapter_id' => 2, 'try_out_id' => 3, 'kind' => $kind, 'status' => 'in_progress', 'content_snapshot' => $content, 'grading_snapshot' => $kind === 'tryout' ? ['questions' => $grades] : $grades, 'answers' => [1 => 'A', 2 => 'B'], 'created_at' => Carbon::now(), 'started_at' => Carbon::now(), 'result_snapshot' => ['correct' => 1, 'wrong' => 1, 'unanswered' => 1, 'percentage' => 33.33, 'sessions' => []]]);
                foreach ($service->payload($attempt)['questions'] as $question) {
                    $this->assertArrayNotHasKey('correct_option', $question);
                    $this->assertArrayNotHasKey('explanation', $question);
                }
                try {
                    $service->payload($attempt, true);
                    $this->fail('Active review must be denied.');
                } catch (HttpException $error) {
                    $this->assertSame(403, $error->getStatusCode());
                }
                $attempt->status = 'completed';
                $review = $service->payload($attempt, true);
                $this->assertSame([1, 2, 3], array_column($review['questions'], 'id'));
                $this->assertSame([1 => 'A', 2 => 'B'], $review['answers']);
                $this->assertSame('A', $review['questions'][0]['correct_option']);
                $this->assertSame($grades[1]['explanation'], $review['questions'][0]['explanation']);
                $this->assertArrayNotHasKey('grading_snapshot', $review);
                if ($kind !== 'tryout') $this->assertSame(['correct', 'wrong', 'unanswered'], array_column($review['questions'], 'status'));
                // Both authorization paths must reject another owner or assessment before access queries.
                $user = (new User)->forceFill(['id' => 1, 'role' => 'student', 'account_status' => 'active']);
                foreach ([['user_id' => 99], [$kind === 'tryout' ? 'try_out_id' : 'chapter_id' => 99]] as $invalid) {
                    $foreign = clone $attempt;
                    $foreign->forceFill($invalid);
                    try {
                        if ($kind === 'tryout') $service->authorize($user, (new TryOut)->forceFill(['id' => 3]), $foreign);
                        else $service->authorize($user, new Program, (new Chapter)->forceFill(['id' => 2]), $foreign);
                        $this->fail('Foreign review must be denied.');
                    } catch (HttpException $error) {
                        $this->assertSame(404, $error->getStatusCode());
                    }
                }
            }
        } finally {
            Container::setInstance($previous);
        }
    }
}
