<?php

namespace App\Services;

use App\Models\TryOut;
use App\Models\TryOutAttempt;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;

class AdminTryOutReportService
{
    public function readSnapshot(callable $read): mixed
    {
        $connection = (new TryOutAttempt)->getConnection();

        return $connection->transaction(function () use ($connection, $read) {
            if ($connection->getDriverName() === 'pgsql') {
                if ($connection->transactionLevel() !== 1) {
                    throw new \RuntimeException('Report snapshot requires a top-level transaction.');
                }
                $connection->statement('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
            }

            return $read();
        });
    }

    public function cohort(TryOut $tryOut, array $filters): Builder
    {
        $query = TryOutAttempt::query()->where('try_out_id', $tryOut->id)
            ->where('status', 'completed')->whereNull('abandoned_at')->whereNotNull('completed_at');
        if (! empty($filters['user_id'])) {
            $query->where('user_id', $filters['user_id']);
        }
        if (! empty($filters['date_from'])) {
            $query->where('completed_at', '>=', CarbonImmutable::parse($filters['date_from'], 'Asia/Jakarta')->startOfDay()->utc());
        }
        if (! empty($filters['date_to'])) {
            $query->where('completed_at', '<', CarbonImmutable::parse($filters['date_to'], 'Asia/Jakarta')->addDay()->startOfDay()->utc());
        }
        if (! empty($filters['search'])) {
            $search = str_replace(['!', '%', '_'], ['!!', '!%', '!_'], mb_strtolower($filters['search']));
            $query->whereIn('user_id', User::query()->select('id')->whereRaw("LOWER(name) LIKE ? ESCAPE '!'", ['%'.$search.'%']));
        }
        if (in_array($filters['status'] ?? 'all', ['passed', 'failed'], true)) {
            $query->where('result_snapshot->overall_pass', $filters['status'] === 'passed');
        }

        return $query;
    }

    public function attempts(TryOut $tryOut, array $filters): \Generator
    {
        foreach ($this->cohort($tryOut, $filters)->orderBy('id')->lazyById(200) as $attempt) {
            yield $attempt;
        }
    }

    public function participantsQuery(TryOut $tryOut, array $filters): Builder
    {
        return $this->cohort($tryOut, $filters)->leftJoin('users', 'users.id', '=', 'try_out_attempts.user_id')
            ->select(['try_out_attempts.*', 'users.name as participant_name', 'users.whatsapp as participant_whatsapp']);
    }

    public function participant(TryOutAttempt $attempt): array
    {
        $result = $attempt->result_snapshot ?? [];

        return ['id' => $attempt->id, 'attempt_id' => $attempt->id, 'user_id' => $attempt->user_id,
            'name' => $attempt->participant_name, 'whatsapp' => $attempt->participant_whatsapp,
            'status' => $attempt->status, 'started_at' => $attempt->started_at?->toISOString(),
            'completed_at' => $attempt->completed_at?->toISOString(),
            'raw_score' => $result['earned'] ?? null, 'final_score' => $result['earned'] ?? null,
            'max_score' => $result['max'] ?? null, 'sessions' => $result['sessions'] ?? [],
            'overall_pass' => $result['overall_pass'] ?? null, 'result' => $result];
    }

    public function individual(TryOut $tryOut, array $filters, int $id): array
    {
        $attempt = $this->participantsQuery($tryOut, $filters)->where('try_out_attempts.id', $id)->firstOrFail();

        $questions = [];
        foreach ($attempt->content_snapshot ?? [] as $index => $question) {
            $grade = $attempt->grading_snapshot['questions'][$question['id']] ?? [];
            $answer = $attempt->answers[$question['id']] ?? null;
            $outcome = $this->outcome($answer, $grade);
            $questions[] = array_replace($question, [
                'correct_option' => $grade['correct_option'] ?? null, 'explanation' => $grade['explanation'] ?? null,
                'point_value' => $grade['point_value'] ?? null, 'number' => $index + 1, 'answer' => $answer,
                'outcome' => $outcome === 'blank' ? 'unanswered' : $outcome,
                'earned' => $outcome === 'correct' ? ($grade['point_value'] ?? 0) : 0,
                'passage' => $attempt->grading_snapshot['passages'][$question['passage_id'] ?? ''] ?? null,
            ]);
        }
        $historyFilters = $filters;
        $historyFilters['user_id'] = $attempt->user_id;
        $history = [];
        foreach ($this->attempts($tryOut, $historyFilters) as $previous) {
            $history[] = ['id' => $previous->id, 'started_at' => $previous->started_at?->toISOString(),
                'completed_at' => $previous->completed_at?->toISOString(), 'raw_score' => $previous->result_snapshot['earned'] ?? null];
        }

        return ['participant' => $this->participant($attempt), 'try_out' => $this->tryOut($tryOut),
            'questions' => app(MediaService::class)->payload($questions), 'attempts' => $history, 'content_snapshot' => $attempt->content_snapshot,
            'grading_snapshot' => $attempt->grading_snapshot, 'answers' => $attempt->answers,
            'result_snapshot' => $attempt->result_snapshot];
    }

    public function tryOut(TryOut $tryOut): array
    {
        $tryOut->loadMissing('program');

        return ['id' => $tryOut->id, 'title' => $tryOut->title, 'level' => $tryOut->program?->code];
    }

    private function canonical(mixed $value): mixed
    {
        if (! is_array($value)) {
            return $value;
        }
        if (! array_is_list($value)) {
            ksort($value);
        }

        return array_map(fn ($item) => $this->canonical($item), $value);
    }

    public function questionVersion(array $question, array $grading): array
    {
        $grade = $grading['questions'][$question['id']] ?? [];
        $passage = isset($question['passage_id']) ? ($grading['passages'][$question['passage_id']] ?? null) : null;
        $fingerprint = hash('sha256', json_encode($this->canonical(['content' => $question, 'grading' => $grade, 'passage' => $passage]), JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));

        return ['version' => $question['id'].':'.$fingerprint, 'question_id' => $question['id'],
            'fingerprint' => $fingerprint, 'session' => $question['session'] ?? null,
            'content' => $question, 'grading' => $grade, 'passage' => $passage];
    }

    public function outcome(mixed $answer, array $grade): string
    {
        return $answer === null || $answer === '' ? 'blank' : ($answer === ($grade['correct_option'] ?? null) ? 'correct' : 'wrong');
    }

    public function overview(TryOut $tryOut, array $filters, bool $includeSnapshots = false): array
    {
        $total = 0;
        $passed = 0;
        // ponytail: memory scales with unique scores and snapshot versions; move aggregation to disk if report cardinality grows.
        $scores = [];
        $questions = [];
        foreach ($this->attempts($tryOut, $filters) as $attempt) {
            $total++;
            $result = $attempt->result_snapshot ?? [];
            $score = $result['earned'] ?? 0;
            $scores[(string) $score] = ($scores[(string) $score] ?? 0) + 1;
            $passed += ($result['overall_pass'] ?? false) === true ? 1 : 0;
            $seen = [];
            foreach ($attempt->content_snapshot ?? [] as $index => $question) {
                $version = $this->questionVersion($question, $attempt->grading_snapshot ?? []);
                $key = $version['version'];
                if (isset($seen[$key])) {
                    continue;
                }
                $seen[$key] = true;
                $questions[$key] ??= $version + ['id' => $question['id'], 'section' => $question['session'] ?? null,
                    'number' => $index + 1, 'question' => $question['question'] ?? '', 'options' => $question['options'] ?? [],
                    'correct_option' => $version['grading']['correct_option'] ?? null,
                    'received' => 0, 'correct' => 0, 'wrong' => 0, 'unanswered' => 0,
                    'distribution' => array_fill_keys(['A', 'B', 'C', 'D'], ['count' => 0, 'percentage' => 0])];
                $questions[$key]['received']++;
                $answer = $attempt->answers[$question['id']] ?? null;
                $outcome = $this->outcome($answer, $version['grading']);
                $questions[$key][$outcome === 'blank' ? 'unanswered' : $outcome]++;
                if (isset($questions[$key]['distribution'][$answer ?? ''])) {
                    $questions[$key]['distribution'][$answer]['count']++;
                }
            }
        }
        uksort($scores, fn ($a, $b) => (float) $a <=> (float) $b);
        $sum = 0;
        $position = 0;
        $middle = [];
        $histogram = [];
        foreach ($scores as $score => $count) {
            $sum += (float) $score * $count;
            foreach ([intdiv(max(0, $total - 1), 2), intdiv($total, 2)] as $index) {
                if ($index >= $position && $index < $position + $count) {
                    $middle[] = (float) $score;
                }
            }
            $position += $count;
            $histogram[] = ['label' => (string) $score, 'score' => (float) $score, 'count' => $count];
        }
        foreach ($questions as &$question) {
            $question['not_received'] = $total - $question['received'];
            $question['correct_percentage'] = $question['correct'] / $question['received'] * 100;
            foreach ($question['distribution'] as &$option) {
                $option['percentage'] = $option['count'] / $question['received'] * 100;
            }
            unset($option);
        }
        unset($question);
        if (! $includeSnapshots) {
            foreach ($questions as &$question) {
                unset($question['content'], $question['grading'], $question['passage']);
            }
            unset($question);
        }
        $questions = array_values($questions);
        usort($questions, fn ($a, $b) => ($a['correct_percentage'] <=> $b['correct_percentage']) ?: strcmp($a['version'], $b['version']));

        return ['try_out' => $this->tryOut($tryOut), 'try_out_id' => $tryOut->id, 'filters' => $filters, 'timezone' => 'Asia/Jakarta',
            'summary' => ['responses' => $total, 'unique_participants' => $this->cohort($tryOut, $filters)->distinct()->count('user_id'),
                'passed' => $passed, 'failed' => $total - $passed, 'mean' => $total ? $sum / $total : null,
                'median' => $middle ? array_sum($middle) / count($middle) : null,
                'min' => $total ? (float) array_key_first($scores) : null, 'max' => $total ? (float) array_key_last($scores) : null],
            'histogram' => $histogram, 'questions' => $questions, 'hardest' => array_slice($questions, 0, 10)];
    }
}
