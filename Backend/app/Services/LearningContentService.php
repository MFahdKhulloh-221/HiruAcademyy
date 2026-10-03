<?php

namespace App\Services;

use App\Models\AudioQuestion;
use App\Models\Chapter;
use App\Models\Flashcard;
use App\Models\LearningModule;
use App\Models\MiniCheckpointQuestion;
use App\Models\Program;
use App\Models\ReadingPassage;
use App\Models\ReadingQuestion;
use App\Models\VideoLesson;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class LearningContentService
{
    public const RESOURCES = [
        'chapters' => [Chapter::class, null],
        'video-lessons' => [VideoLesson::class, 'video'],
        'modules' => [LearningModule::class, 'module'],
        'flashcards' => [Flashcard::class, 'flashcard'],
        'audio-questions' => [AudioQuestion::class, 'audio'],
        'reading-passages' => [ReadingPassage::class, 'reading'],
        'reading-questions' => [ReadingQuestion::class, 'reading'],
        'mini-checkpoint-questions' => [MiniCheckpointQuestion::class, 'mini_checkpoint'],
    ];

    public const ACTIVITIES = [
        'foundation' => ['video', 'module', 'flashcard', 'mini_checkpoint'],
        'jlpt' => ['video', 'module', 'flashcard', 'audio', 'reading', 'mini_checkpoint'],
        'ssw' => ['video', 'module', 'flashcard', 'mini_checkpoint'],
        'interview' => ['video', 'module'],
    ];

    public function model(string $resource): string
    {
        abort_unless(isset(self::RESOURCES[$resource]), 404);

        return self::RESOURCES[$resource][0];
    }

    public function rules(string $resource, ?Model $model = null): array
    {
        $this->model($resource);
        $required = $model?->exists ? 'sometimes' : 'required';
        $text = [$required, 'required', 'string'];
        $title = [...$text, 'max:255'];
        $rules = [
            'sort_order' => ['sometimes', 'required', 'integer', 'min:0', 'max:2147483647'],
            'status' => ['sometimes', 'required', Rule::in(['draft', 'published'])],
        ];
        if (in_array($resource, ['chapters', 'video-lessons', 'modules'])) {
            $rules['description'] = ['sometimes', 'nullable', 'string'];
        }
        if ($resource === 'chapters') {
            return $rules + [
                'program_id' => [$required, 'required', 'integer', 'exists:programs,id'],
                'chapter_number' => [$required, 'required', 'integer', 'min:1', 'max:2147483647'],
                'title' => $title,
            ];
        }
        $parent = $resource === 'reading-questions' ? 'reading_passage_id' : 'chapter_id';
        $table = $resource === 'reading-questions' ? 'reading_passages' : 'chapters';
        $rules[$parent] = [$required, 'required', 'integer', "exists:{$table},id"];
        $rules += match ($resource) {
            'video-lessons' => ['title' => $title, 'video_url' => [$required, 'required', 'url:http,https']],
            'modules' => ['title' => $title, 'file_url' => [$required, 'required', 'url:http,https'], 'module_type' => [$required, 'required', Rule::in(['grammar', 'kanji', 'general'])]],
            'flashcards' => ['japanese' => $text, 'reading' => $text, 'meaning' => $text, 'example' => ['sometimes', 'nullable', 'string']],
            'reading-passages' => ['title' => $title, 'body' => $text],
            'audio-questions' => ['title' => ['sometimes', 'nullable', 'string', 'max:255'], 'audio_url' => [$required, 'required', 'url:http,https']],
            default => [],
        };
        if (in_array($resource, ['audio-questions', 'reading-questions', 'mini-checkpoint-questions'])) {
            $rules += [
                'question' => $text,
                'options' => [$required, 'required', 'array:A,B,C,D', 'size:4'],
                'correct_option' => [$required, 'required', Rule::in(['A', 'B', 'C', 'D'])],
                'explanation' => ['sometimes', 'nullable', 'string'],
            ];
            foreach (['A', 'B', 'C', 'D'] as $option) {
                $rules["options.{$option}"] = ['required_with:options', 'string', function ($attribute, $value, $fail) {
                    if (! is_string($value) || trim($value) === '') {
                        $fail('Option must be a nonempty string.');
                    }
                }];
            }
        }

        return $rules;
    }

    public function save(string $resource, array $input, ?Model $model = null): Model
    {
        $class = $this->model($resource);
        $model ??= new $class;
        $data = Validator::make($input, $this->rules($resource, $model))->validate();

        try {
            return DB::transaction(function () use ($resource, $model, $data) {
                if ($model->exists) {
                    $model = $model->newQuery()->whereKey($model->getKey())->lockForUpdate()->firstOrFail();
                }
                $model->fill($data);
                if ($resource === 'chapters') {
                    $family = Program::findOrFail($model->program_id)->family;
                    $duplicate = Chapter::where('program_id', $model->program_id)
                        ->where('chapter_number', $model->chapter_number)
                        ->when($model->exists, fn ($query) => $query->whereKeyNot($model->getKey()))->exists();
                    if ($duplicate) {
                        throw ValidationException::withMessages(['chapter_number' => 'Chapter number already exists in this program.']);
                    }
                    if ($model->exists && $model->isDirty('program_id')) {
                        foreach (self::RESOURCES as $endpoint => [$contentClass, $activity]) {
                            if ($activity === null || $endpoint === 'reading-questions' || $this->allowed($family, $activity)) {
                                continue;
                            }
                            if ($contentClass::where('chapter_id', $model->getKey())->exists()) {
                                throw ValidationException::withMessages(['program_id' => 'Existing content is not allowed in the target program family.']);
                            }
                        }
                    }
                } else {
                    $parent = 'chapter_id';
                    if ($resource === 'reading-questions') {
                        $parent = 'reading_passage_id';
                        $passage = ReadingPassage::whereKey($model->reading_passage_id)->lockForUpdate()->firstOrFail();
                        $chapterId = $passage->chapter_id;
                    } else {
                        $chapterId = $model->chapter_id;
                    }
                    $chapter = Chapter::whereKey($chapterId)->lockForUpdate()->firstOrFail();
                    if (! $this->allowed($chapter->program()->firstOrFail()->family, self::RESOURCES[$resource][1])) {
                        throw ValidationException::withMessages([$parent => 'Content is not allowed in this program family.']);
                    }
                }
                $model->save();

                return $model->fresh();
            }, 3);
        } catch (UniqueConstraintViolationException $exception) {
            if ($resource !== 'chapters') {
                throw $exception;
            }
            throw ValidationException::withMessages(['chapter_number' => 'Chapter number already exists in this program.']);
        }
    }

    private function allowed(string $family, string $activity): bool
    {
        return in_array($activity, self::ACTIVITIES[$family] ?? [], true);
    }
}
