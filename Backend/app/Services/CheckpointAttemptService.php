<?php

namespace App\Services;

use App\Models\CheckpointAttempt;
use App\Models\CheckpointPackage;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CheckpointAttemptService
{
    public function __construct(private ChapterAccessPolicy $access, private CheckpointPackageService $content) {}

    public function canAccess(User $user, CheckpointPackage $package): bool
    {
        return $this->access->canAccessProgram($user, $package->program)
            && ($package->access_type === 'free' || $this->access->canAccessChapter($user, $package->program->code, 2));
    }

    public function authorize(User $user, CheckpointPackage $package, ?CheckpointAttempt $attempt = null): void
    {
        abort_unless($user->role === 'student' && $user->account_status === 'active', 403);
        if ($attempt) {
            abort_unless($attempt->user_id === $user->id && $attempt->checkpoint_package_id === $package->id, 404);
        }
        abort_unless($package->status === 'published', 404);
        abort_unless($this->canAccess($user, $package), 403);
    }

    public function start(User $user, CheckpointPackage $package): CheckpointAttempt
    {
        return DB::transaction(function () use ($user, $package) {
            // All starts serialize on user, then package; unique partial index is final guard.
            User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $package = CheckpointPackage::whereKey($package->id)->lockForUpdate()->firstOrFail();
            $this->authorize($user, $package);
            $active = CheckpointAttempt::where('user_id', $user->id)->where('checkpoint_package_id', $package->id)->where('status', 'in_progress')->lockForUpdate()->first();
            if ($active) {
                return $this->expired($active) ? $this->finalize($active) : $active;
            }
            $questions = $this->content->questions($package);
            $content = [];
            $grading = ['passing_score' => $package->passing_score, 'questions' => []];
            foreach ($questions as $question) {
                $content[] = ['id' => $question->id, 'session' => $question->pivot->session, 'question' => $question->question, 'options' => $question->options, 'audio_url' => $question->pivot->audio_url, 'reading_passage' => $question->pivot->reading_passage];
                $grading['questions'][$question->id] = ['correct_option' => $question->correct_option, 'explanation' => $question->explanation];
            }
            $now = now();

            return CheckpointAttempt::create(['user_id' => $user->id, 'checkpoint_package_id' => $package->id, 'status' => 'in_progress', 'content_snapshot' => $content, 'grading_snapshot' => $grading, 'answers' => [], 'revision' => 0, 'started_at' => $now, 'expires_at' => $now->copy()->addMinutes($package->duration_minutes)]);
        }, 3);
    }

    public function expired(CheckpointAttempt $attempt): bool
    {
        return $attempt->status === 'in_progress' && now()->greaterThanOrEqualTo($attempt->expires_at);
    }

    public function mutate(User $user, CheckpointPackage $package, CheckpointAttempt $attempt, string $action, ?int $revision = null, array $answers = []): CheckpointAttempt
    {
        return DB::transaction(function () use ($user, $package, $attempt, $action, $revision, $answers) {
            $package = CheckpointPackage::whereKey($package->id)->lockForUpdate()->firstOrFail();
            $locked = CheckpointAttempt::whereKey($attempt->id)->lockForUpdate()->firstOrFail();
            $this->authorize($user, $package, $locked);
            if ($this->expired($locked)) {
                return $this->finalize($locked);
            }
            if ($action === 'read' || ($action === 'submit' && $locked->status === 'completed')) {
                return $locked;
            }
            abort_unless($locked->status === 'in_progress' && $locked->revision === $revision, 409, 'Jawaban sudah berubah. Muat ulang pengerjaan sebelum mencoba lagi.');
            if ($action === 'submit') {
                return $this->finalize($locked);
            }
            $locked->update(['answers' => self::mergeAnswers($locked->answers, $answers, $locked->content_snapshot), 'revision' => $locked->revision + 1]);

            return $locked;
        }, 3);
    }

    public static function mergeAnswers(array $current, array $incoming, array $questions): array
    {
        $ids = array_column($questions, 'id');
        foreach ($incoming as $id => $answer) {
            if (! ctype_digit((string) $id) || ! in_array((int) $id, $ids, true) || ! in_array($answer, ['A', 'B', 'C', 'D', null], true)) {
                throw ValidationException::withMessages(['answers' => 'Nomor soal atau pilihan jawaban tidak sesuai.']);
            }
            if ($answer === null) {
                unset($current[$id]);
            } else {
                $current[$id] = $answer;
            }
        }

        return $current;
    }

    public static function grade(array $content, array $grading, array $answers): array
    {
        $result = ['correct' => 0, 'wrong' => 0, 'unanswered' => 0, 'total' => count($content), 'passing_score' => $grading['passing_score'], 'sessions' => []];
        foreach (CheckpointPackageService::SESSIONS as $code => $label) {
            $section = ['code' => $code, 'label' => $label, 'correct' => 0, 'wrong' => 0, 'unanswered' => 0];
            foreach ($content as $question) {
                if ($question['session'] !== $code) {
                    continue;
                }
                $answer = $answers[$question['id']] ?? null;
                $outcome = $answer === null ? 'unanswered' : ($answer === $grading['questions'][$question['id']]['correct_option'] ? 'correct' : 'wrong');
                $section[$outcome]++;
                $result[$outcome]++;
            }
            $result['sessions'][] = $section;
        }
        $result['score'] = $result['total'] > 0 ? round($result['correct'] * 100 / $result['total'], 2) : 0;
        $result['earned'] = $result['score'];
        $result['max'] = 100;
        $result['percentage'] = $result['score'];
        $result['passed'] = $result['total'] > 0 && $result['correct'] * 100 >= $grading['passing_score'] * $result['total'];

        $result['overall_pass'] = $result['passed'];
        $result['total_passing_score'] = $grading['passing_score'];

        return $result;
    }

    private function finalize(CheckpointAttempt $attempt): CheckpointAttempt
    {
        $attempt->update(['result_snapshot' => self::grade($attempt->content_snapshot, $attempt->grading_snapshot, $attempt->answers), 'status' => 'completed', 'submitted_at' => now(), 'revision' => $attempt->revision + 1]);

        return $attempt;
    }

    public function payload(CheckpointAttempt $attempt, bool $review = false): array
    {
        abort_if($review && $attempt->status !== 'completed', 403);
        $questions = array_map(function ($question) use ($attempt, $review) {
            $item = array_intersect_key($question, array_flip(['id', 'session', 'question', 'options', 'audio_url', 'reading_passage']));
            if ($review) {
                $item += array_intersect_key($attempt->grading_snapshot['questions'][$question['id']], array_flip(['correct_option', 'explanation']));
            }

            return app(MediaService::class)->payload($item);
        }, $attempt->content_snapshot);

        return ['id' => $attempt->id, 'checkpoint_package_id' => $attempt->checkpoint_package_id, 'status' => $attempt->status, 'revision' => $attempt->revision, 'questions' => $questions, 'answers' => (object) $attempt->answers, 'result' => $attempt->status === 'completed' ? $attempt->result_snapshot : null, 'started_at' => $attempt->started_at->toISOString(), 'expires_at' => $attempt->expires_at->toISOString(), 'submitted_at' => $attempt->submitted_at?->toISOString(), 'server_now' => now()->toISOString()];
    }
}
