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
                'total_passing_score' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:180'],
            ]);
            $model->fill($data);
            if ($model->exists && $model->isDirty('program_id') && DB::table('try_out_attempts')->where('try_out_id', $model->id)->exists()) {
                throw ValidationException::withMessages(['program_id' => 'Program cannot change after an attempt exists.']);
            }
            $this->program($model->program_id);
            $model->save();
            if ($model->status === 'published') {
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
                    } else {
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

    public function assertPublishable(TryOut $tryOut): void
    {
        $this->program($tryOut->program_id);
        $questions = $tryOut->questions()->where('status', 'published')->get();
        foreach ($questions as $question) {
            $this->assertQuestion($question);
        }
        $sessions = $questions->pluck('session')->unique()->all();
        if (count($sessions) !== 4 || array_diff(array_keys(self::SESSIONS), $sessions) !== [] || $questions->sum('point_value') !== 180) {
            throw ValidationException::withMessages(['status' => 'Publish requires all four sessions and exactly 180 explicit question points.']);
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
        return ['id' => $tryOut->id, 'program_id' => $tryOut->program_id, 'level' => strtoupper($tryOut->program->code), 'title' => $tryOut->title, 'status' => $tryOut->status, 'max_score' => 180, 'section_passing_score' => 19, 'total_passing_score' => $tryOut->total_passing_score, 'sessions' => self::SESSIONS];
    }

    public function adminQuestion(TryOutQuestion $question): array
    {
        return app(MediaService::class)->payload($question->only(['id', 'try_out_id', 'session', 'question', 'options', 'correct_option', 'explanation', 'point_value', 'reading_passage', 'audio_url', 'sort_order', 'status']));
    }
}
