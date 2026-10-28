<?php

namespace Tests\Unit;

use App\Models\LearningAttempt;
use App\Models\ReadingPassage;
use App\Models\ReadingQuestion;
use App\Services\LearningAttemptService;
use App\Services\LearningProgressService;
use App\Services\MediaService;
use Illuminate\Container\Container;
use Illuminate\Database\Connection;
use Illuminate\Database\ConnectionResolver;
use Illuminate\Database\Eloquent\Relations\HasMany;
use PHPUnit\Framework\TestCase;

final class ReadingAttemptSnapshotPayloadTest extends TestCase
{
    public function test_reading_payload_preserves_shared_passage_questions_and_answers_without_active_grading(): void
    {
        $previousContainer = Container::getInstance();
        $container = new Container;
        $container->instance(MediaService::class, new MediaService);
        Container::setInstance($container);

        try {
            $passage = ['id' => 17, 'title' => 'Shared reading', 'body' => '日本語の文章。'];
            $options = ['A' => 'First', 'B' => 'Second', 'C' => 'Third', 'D' => 'Fourth'];
            $questions = [
                ['id' => 31, 'question' => 'First question?', 'options' => $options, 'passage' => $passage],
                ['id' => 32, 'question' => 'Second question?', 'options' => $options, 'passage' => $passage],
            ];
            $answers = [31 => 'B', 32 => 'A'];
            $grading = [
                31 => ['correct_option' => 'B', 'explanation' => 'First explanation'],
                32 => ['correct_option' => 'D', 'explanation' => 'Second explanation'],
            ];
            $attempt = new LearningAttempt;
            $attempt->forceFill([
                'id' => 41,
                'chapter_id' => 9,
                'kind' => 'reading',
                'status' => 'in_progress',
                'revision' => 2,
                'content_snapshot' => $questions,
                'grading_snapshot' => $grading,
                'answers' => $answers,
            ]);
            $service = new LearningAttemptService($this->createMock(LearningProgressService::class));

            // Exercise real model casts and payload serialization, not start/save or DB persistence.
            $active = $service->payload($attempt);
            $this->assertSame('reading', $active['kind']);
            $this->assertSame('in_progress', $active['status']);
            $this->assertSame(2, $active['revision']);
            $this->assertSame($questions, $active['questions']);
            $this->assertSame($answers, $active['answers']);
            $this->assertNull($active['result']);
            foreach ($active['questions'] as $question) {
                $this->assertArrayNotHasKey('correct_option', $question);
                $this->assertArrayNotHasKey('explanation', $question);
                $this->assertArrayNotHasKey('selected_answer', $question);
            }
            $this->assertArrayNotHasKey('grading_snapshot', $active);

            $result = ['correct' => 1, 'wrong' => 1, 'unanswered' => 0, 'total' => 2, 'percentage' => 50];
            $attempt->forceFill(['status' => 'completed', 'result_snapshot' => $result]);
            $review = $service->payload($attempt, true);

            $this->assertSame('completed', $review['status']);
            $this->assertSame($answers, $review['answers']);
            $this->assertSame($result, $review['result']);
            $this->assertSame([
                $questions[0] + $grading[31] + ['selected_answer' => 'B', 'status' => 'correct'],
                $questions[1] + $grading[32] + ['selected_answer' => 'A', 'status' => 'wrong'],
            ], $review['questions']);
            $this->assertSame($questions, $attempt->content_snapshot);
            $this->assertSame($grading, $attempt->grading_snapshot);
        } finally {
            Container::setInstance($previousContainer);
        }
    }

    public function test_reading_passage_declares_has_many_questions_without_opening_database(): void
    {
        $previousResolver = ReadingPassage::getConnectionResolver();
        // Null PDO permits query construction only; no database connection can open.
        $resolver = new ConnectionResolver(['snapshot-test' => new Connection(null)]);
        $resolver->setDefaultConnection('snapshot-test');
        ReadingPassage::setConnectionResolver($resolver);

        try {
            $passage = new ReadingPassage;
            $passage->id = 17;
            $relation = $passage->questions();

            $this->assertInstanceOf(HasMany::class, $relation);
            $this->assertInstanceOf(ReadingQuestion::class, $relation->getRelated());
            $this->assertSame($passage, $relation->getParent());
            $this->assertSame('reading_passage_id', $relation->getForeignKeyName());
            $this->assertSame('id', $relation->getLocalKeyName());
        } finally {
            if ($previousResolver === null) {
                ReadingPassage::unsetConnectionResolver();
            } else {
                ReadingPassage::setConnectionResolver($previousResolver);
            }
        }
    }
}
