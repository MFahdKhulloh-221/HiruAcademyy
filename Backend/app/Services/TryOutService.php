<?php

namespace App\Services;

use App\Models\Program;
use App\Models\TryOut;
use App\Models\TryOutQuestion;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class TryOutService
{
    public const SESSIONS = ['vocabulary_kanji' => 'Kosakata & Kanji', 'grammar' => 'Tata Bahasa', 'reading' => 'Reading (Dokkai)', 'audio' => 'Audio (Choukai)'];

    public function validateInput(array $input, array $rules): array
    {
        $unknown = array_diff(array_keys($input), array_filter(array_keys($rules), fn ($key) => ! str_contains($key, '.')));
        if ($unknown !== []) {
            throw ValidationException::withMessages(array_fill_keys($unknown, 'Field is prohibited.'));
        }

        return Validator::make($input, $rules)->validate();
    }

    public function program(int $id): Program
    {
        $program = Program::findOrFail($id);
        if ($program->status !== 'active' || $program->family !== 'jlpt' || ! in_array($program->code, ['n5', 'n4', 'n3', 'n2', 'n1'], true)) {
            throw ValidationException::withMessages(['program_id' => 'Active JLPT N5–N1 program required.']);
        }

        return $program;
    }

    public function save(array $input, ?TryOut $tryOut = null): TryOut
    {
        return DB::transaction(function () use ($input, $tryOut) {
            $model = $tryOut ? TryOut::whereKey($tryOut->id)->lockForUpdate()->firstOrFail() : new TryOut;
            $required = $model->exists ? 'sometimes' : 'required';
            $data = $this->validateInput($input, [
                'program_id' => [$required, 'required', 'integer', 'exists:programs,id'],
                'title' => [$required, 'required', 'string', 'max:255'],
                'status' => ['sometimes', 'required', Rule::in(['draft', 'published'])],
                'total_passing_score' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:2147483647'],
                'max_score' => ['sometimes', 'required', 'integer', 'min:1', 'max:2147483647'],
                'sort_order' => ['sometimes', 'required', 'integer', 'min:0', 'max:2147483647'],
                'session_passing_scores' => ['sometimes', 'nullable', 'array:'.implode(',', array_keys(self::SESSIONS)), 'size:4'],
                'session_passing_scores.*' => ['required', 'integer', 'min:0', 'max:2147483647'],
                'duration_minutes' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:2147483647', function ($attribute, $value, $fail) {
                    if (is_bool($value)) {
                        $fail('Duration must be a positive integer.');
                    }
                }],
            ]);
            $model->fill($data);
            $model->max_score ??= 180;
            $model->sort_order ??= 0;
            if ($model->total_passing_score !== null && $model->total_passing_score > $model->max_score) {
                throw ValidationException::withMessages(['total_passing_score' => 'Passing score cannot exceed maximum score.']);
            }
            if ($model->exists && $model->isDirty('program_id') && DB::table('try_out_attempts')->where('try_out_id', $model->id)->exists()) {
                throw ValidationException::withMessages(['program_id' => 'Program cannot change after an attempt exists.']);
            }
            $this->program($model->program_id);
            $model->save();
            if ($model->status === 'published') {
                if ($model->questions()->where('status', '!=', 'published')->exists()) {
                    throw ValidationException::withMessages(['status' => 'Publish requires all questions to be published.']);
                }
                $this->assertPublishable($model);
            }

            return $model->fresh();
        }, 3);
    }

    private function questionRules(): array
    {
        $rules = [
            'session' => ['required', Rule::in(array_keys(self::SESSIONS))],
            'question' => ['required', 'string'],
            'instruction' => ['nullable', 'string'],
            'japanese' => ['nullable', 'array:text,reading'],
            'japanese.text' => ['required_with:japanese', 'string'],
            'japanese.reading' => ['nullable', 'string'],
            'options' => ['required', 'array:A,B,C,D', 'size:4'],
            'correct_option' => ['required', Rule::in(['A', 'B', 'C', 'D'])],
            'explanation' => ['nullable', 'string'],
            'point_value' => ['required', 'integer', 'min:1', 'max:180'],
            'reading_passage' => ['nullable', 'string'],
            'audio_url' => ['nullable', 'string', app(MediaService::class)->rule('audio')],
            'sort_order' => ['sometimes', 'required', 'integer', 'min:0', 'max:2147483647'],
            'status' => ['sometimes', 'required', Rule::in(['draft', 'published'])],
        ];
        foreach (['A', 'B', 'C', 'D'] as $option) {
            $rules["options.{$option}"] = ['required', 'string', function ($attribute, $value, $fail) {
                if (! is_string($value) || trim($value) === '') {
                    $fail('Nonempty option required.');
                }
            }];
        }

        return $rules;
    }

    private function assertQuestion(TryOutQuestion $question): void
    {
        Validator::make($question->only(array_keys($this->questionRules())), $this->questionRules())->validate();
        if ($question->status === 'published' && $question->session === 'audio' && ! $question->audio_url) {
            throw ValidationException::withMessages(['audio_url' => 'Published Audio question requires an audio URL.']);
        }
    }

    public function saveQuestion(TryOut $tryOut, array $input, ?TryOutQuestion $question = null): TryOutQuestion
    {
        return app(MediaService::class)->locked(fn () => $this->saveQuestionContent($tryOut, $input, $question));
    }

    private function saveQuestionContent(TryOut $tryOut, array $input, ?TryOutQuestion $question): TryOutQuestion
    {
        return DB::transaction(function () use ($tryOut, $input, $question) {
            $parent = TryOut::whereKey($tryOut->id)->lockForUpdate()->firstOrFail();
            $this->program($parent->program_id);
            $model = $question ? $parent->questions()->whereKey($question->id)->lockForUpdate()->firstOrFail() : new TryOutQuestion;
            $rules = $this->questionRules();
            if ($model->exists) {
                foreach ($rules as $key => &$rule) {
                    if (! str_contains($key, '.')) {
                        array_unshift($rule, 'sometimes');
                    } elseif (str_starts_with($key, 'options.')) {
                        $rule[0] = 'required_with:options';
                    }
                }
                unset($rule);
            }
            $model->fill($this->validateInput($input, $rules));
            $model->try_out_id = $parent->id;
            $model->status ??= 'draft';
            $model->sort_order ??= 0;
            $this->assertQuestion($model);
            $model->save();
            if ($parent->status === 'published') {
                $this->assertPublishable($parent);
            }

            return $model->fresh();
        }, 3);
    }

    public function publishQuestions(TryOut $tryOut, array $input): array
    {
        $this->validateInput($input, []);

        return app(MediaService::class)->locked(function () use ($tryOut) {
            $parent = TryOut::whereKey($tryOut->id)->lockForUpdate()->firstOrFail();
            $this->program($parent->program_id);
            $questions = $parent->questions()->orderBy('id')->lockForUpdate()->get();
            if ($questions->isEmpty()) {
                throw ValidationException::withMessages(['questions' => 'At least one question required.']);
            }
            foreach ($questions as $question) {
                $question->status = 'published';
                $this->assertQuestion($question);
            }
            $published = $parent->questions()->where('status', 'draft')->update(['status' => 'published']);
            if ($parent->status === 'published') {
                $this->assertPublishable($parent);
            }

            return ['try_out_id' => $parent->id, 'published_count' => $published];
        });
    }

    public function assertPublishable(TryOut $tryOut): void
    {
        $this->program($tryOut->program_id);
        $questions = $tryOut->questions()->where('status', 'published')->get();
        foreach ($questions as $question) {
            $this->assertQuestion($question);
        }
        $sessions = $questions->pluck('session')->unique()->all();
        if (count($sessions) !== 4 || array_diff(array_keys(self::SESSIONS), $sessions) !== [] || $questions->sum('point_value') !== $tryOut->max_score) {
            throw ValidationException::withMessages(['status' => 'Publish requires all four sessions and explicit question points matching max_score.']);
        }
        if ($tryOut->session_passing_scores !== null) {
            foreach (array_keys(self::SESSIONS) as $session) {
                if (! array_key_exists($session, $tryOut->session_passing_scores) || $tryOut->session_passing_scores[$session] > $questions->where('session', $session)->sum('point_value')) {
                    throw ValidationException::withMessages(['session_passing_scores' => 'Each session requires an achievable passing score in points.']);
                }
            }
        }
    }

    public function delete(TryOut $tryOut, ?TryOutQuestion $question = null): void
    {
        DB::transaction(function () use ($tryOut, $question) {
            $parent = TryOut::whereKey($tryOut->id)->lockForUpdate()->firstOrFail();
            if ($question) {
                $parent->questions()->whereKey($question->id)->firstOrFail()->delete();
                if ($parent->status === 'published') {
                    $this->assertPublishable($parent);
                }
            } else {
                if (DB::table('try_out_attempts')->where('try_out_id', $parent->id)->exists()) {
                    throw ValidationException::withMessages(['try_out' => 'Assessment with attempts cannot be deleted.']);
                }
                $parent->delete();
            }
        }, 3);
    }

    public function payload(TryOut $tryOut): array
    {
        return ['id' => $tryOut->id, 'program_id' => $tryOut->program_id, 'level' => strtoupper($tryOut->program->code), 'title' => $tryOut->title, 'status' => $tryOut->status, 'max_score' => $tryOut->max_score, 'sort_order' => $tryOut->sort_order, 'session_passing_scores' => $tryOut->session_passing_scores, 'section_passing_score' => $tryOut->session_passing_scores === null ? 19 : null, 'section_passing_score_basis' => $tryOut->session_passing_scores === null ? 'correct_answers' : 'points', 'total_passing_score' => $tryOut->total_passing_score, 'duration_minutes' => $tryOut->duration_minutes, 'sessions' => self::SESSIONS];
    }

    public function adminQuestion(TryOutQuestion $question): array
    {
        return app(MediaService::class)->payload($question->only(['id', 'try_out_id', 'session', 'question', 'options', 'correct_option', 'explanation', 'point_value', 'reading_passage', 'audio_url', 'sort_order', 'status', 'instruction', 'japanese']));
    }
}
