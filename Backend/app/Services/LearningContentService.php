<?php

namespace App\Services;

use App\Models\ActivityCompletion;
use App\Models\AudioQuestion;
use App\Models\Chapter;
use App\Models\CheckpointQuestion;
use App\Models\Flashcard;
use App\Models\LearningAttempt;
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
        'checkpoint-questions' => [CheckpointQuestion::class, null],
        'video-lessons' => [VideoLesson::class, 'video'],
        'modules' => [LearningModule::class, 'module'],
        'flashcards' => [Flashcard::class, 'flashcard'],
        'audio-questions' => [AudioQuestion::class, 'audio'],
        'reading-passages' => [ReadingPassage::class, 'reading'],
        'reading-questions' => [ReadingQuestion::class, 'reading'],
        'mini-checkpoint-questions' => [MiniCheckpointQuestion::class, 'mini_checkpoint'],
    ];

    public const ACTIVITIES = [
        'foundation' => ['video', 'module', 'audio', 'reading', 'mini_checkpoint'],
        'jlpt' => ['video', 'module', 'flashcard', 'audio', 'reading', 'mini_checkpoint'],
        'ssw' => ['video', 'module', 'mini_checkpoint'],
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
                'mini_checkpoint_duration_minutes' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:2147483647'],
                'mini_checkpoint_passing_score' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:100'],
            ];
        }
        $parent = $resource === 'reading-questions' ? 'reading_passage_id' : 'chapter_id';
        $table = $resource === 'reading-questions' ? 'reading_passages' : 'chapters';
        $rules[$parent] = [$required, 'required', 'integer', "exists:{$table},id"];
        $rules += match ($resource) {
            'video-lessons' => ['title' => $title, 'video_url' => ['sometimes', 'nullable', 'string', app(MediaService::class)->rule('video')]],
            'modules' => ['title' => $title, 'file_url' => ['sometimes', 'nullable', 'string', app(MediaService::class)->rule()], 'module_type' => [$required, 'required', Rule::in(['grammar', 'kanji', 'general'])]],
            'flashcards' => ['japanese' => $text, 'reading' => ['sometimes', 'nullable', 'string'], 'meaning' => $text, 'example' => ['sometimes', 'nullable', 'string']],
            'reading-passages' => ['title' => $title, 'body' => $text],
            'audio-questions' => ['title' => ['sometimes', 'nullable', 'string', 'max:255'], 'audio_url' => ['sometimes', 'nullable', 'string', app(MediaService::class)->rule('audio')]],
            default => [],
        };
        if (in_array($resource, ['audio-questions', 'reading-questions', 'mini-checkpoint-questions', 'checkpoint-questions'])) {
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

        if ($resource === 'mini-checkpoint-questions') {
            foreach (['session', 'part', 'duration_minutes', 'passing_score'] as $field) {
                $rules[$field] = ['prohibited'];
            }
        }

        return $rules;
    }

    public function save(string $resource, array $input, ?Model $model = null): Model
    {
        return app(MediaService::class)->locked(fn () => $this->saveContent($resource, $input, $model));
    }

    private function saveContent(string $resource, array $input, ?Model $model): Model
    {
        $class = $this->model($resource);
        $model ??= new $class;
        if ($resource === 'checkpoint-questions') {
            $unknown = array_diff(array_keys($input), ['id', 'chapter_id', 'question', 'options', 'correct_option', 'explanation', 'sort_order', 'status']);
            if ($unknown !== []) {
                throw ValidationException::withMessages(array_fill_keys($unknown, 'Field is prohibited.'));
            }
        }
        $data = Validator::make($input, $this->rules($resource, $model))->validate();
        if (in_array($resource, ['audio-questions', 'reading-questions', 'mini-checkpoint-questions', 'reading-passages', 'checkpoint-questions'], true)) {
            foreach (['question', 'explanation', 'body'] as $field) {
                if (isset($data[$field])) {
                    $data[$field] = PlacementRichText::sanitize($data[$field]);
                }
            }
            if (isset($data['options'])) {
                $data['options'] = array_map(PlacementRichText::sanitize(...), $data['options']);
            }
            Validator::make($data, $this->rules($resource, $model))->validate();
        }


        if ($resource === 'checkpoint-questions') {
            foreach (\Illuminate\Support\Arr::dot(array_intersect_key($data, array_flip(['question', 'options']))) as $field => $value) {
                if ($value !== null && trim(html_entity_decode(strip_tags($value), ENT_QUOTES | ENT_HTML5, 'UTF-8'), " \t\n\r\0\x0B\xc2\xa0") === '') {
                    throw ValidationException::withMessages([$field => 'Text must not be empty.']);
                }
            }
        }

        try {
            return DB::transaction(function () use ($resource, $model, $data) {
                if ($resource === 'chapters') {
                    $this->lockChapters();
                }
                if ($model->exists) {
                    $model = $model->newQuery()->whereKey($model->getKey())->lockForUpdate()->firstOrFail();
                }
                if ($model->exists && $resource !== 'chapters') {
                    $sourceChapterId = $resource === 'reading-questions'
                        ? ReadingPassage::whereKey($model->reading_passage_id)->value('chapter_id') : $model->chapter_id;
                    Chapter::whereKey($sourceChapterId)->lockForUpdate()->firstOrFail();
                }
                $model->fill($data);
                if ($resource === 'flashcards' && $model->reading === null) {
                    $model->reading = '';
                }
                if ($resource === 'chapters') {
                    $duration = $model->mini_checkpoint_duration_minutes;
                    $score = $model->mini_checkpoint_passing_score;
                    if (($duration === null) !== ($score === null)) {
                        throw ValidationException::withMessages(['mini_checkpoint_duration_minutes' => 'Set both Mini Checkpoint settings together.']);
                    }
                    if ($duration === null && $model->exists && $model->miniCheckpointQuestions()->where('status', 'published')->exists()) {
                        throw ValidationException::withMessages(['mini_checkpoint_duration_minutes' => 'Published Mini Checkpoint questions require chapter settings.']);
                    }
                    $program = Program::findOrFail($model->program_id);
                    if ($model->exists && $model->isDirty('program_id') && ! in_array($program->code, ['n5', 'n4', 'n3', 'n2'], true) && $model->miniCheckpointQuestions()->exists()) {
                        throw ValidationException::withMessages(['program_id' => 'Mini Checkpoint requires an N5–N2 program.']);
                    }
                    if ($model->exists && $model->isDirty('program_id') && ! $this->allowsFlashcards($program) && $model->flashcards()->exists()) {
                        throw ValidationException::withMessages(['program_id' => 'Flashcards require a JLPT N5–N1 program.']);
                    }
                    $family = $program->family;
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
                    if ($resource === 'video-lessons' && VideoLesson::where('chapter_id', $chapterId)
                        ->when($model->exists, fn ($query) => $query->whereKeyNot($model->getKey()))->exists()) {
                        throw ValidationException::withMessages(['chapter_id' => 'Only one video is allowed per chapter.']);
                    }
                    $program = $chapter->program()->firstOrFail();
                    if ($resource === 'flashcards' && ! $this->allowsFlashcards($program)) {
                        throw ValidationException::withMessages(['chapter_id' => 'Flashcards require a JLPT N5–N1 program.']);
                    }
                    if ($resource !== 'checkpoint-questions' && ! $this->allowed($program->family, self::RESOURCES[$resource][1])) {
                        throw ValidationException::withMessages([$parent => 'Content is not allowed in this program family.']);
                    }
                }
                if ($resource === 'mini-checkpoint-questions') {
                    $model->session = 1;
                    $model->part = 1;
                    $model->duration_minutes = $chapter->mini_checkpoint_duration_minutes;
                    $model->passing_score = $chapter->mini_checkpoint_passing_score;
                    if ($model->status === 'published') {
                        if (! in_array($chapter->program->code, ['n5', 'n4', 'n3', 'n2'], true)) {
                            throw ValidationException::withMessages(['chapter_id' => 'Mini Checkpoint requires an N5–N2 program.']);
                        }
                        app(LearningAttemptService::class)->chapterMiniConfiguration($chapter);
                    }
                }
                $reorderChapter = $resource === 'chapters'
                    && (! $model->exists || $model->isDirty('program_id') || array_key_exists('sort_order', $data));
                if ($reorderChapter) {
                    $oldProgramId = $model->exists ? $model->getRawOriginal('program_id') : null;
                    $siblings = $this->chapterSiblings($model->program_id, $model->getKey());
                    $position = array_key_exists('sort_order', $data) ? (int) $data['sort_order'] : $siblings->count();
                    if ($position > $siblings->count()) {
                        throw ValidationException::withMessages(['sort_order' => 'Position is outside this program.']);
                    }
                    $model->sort_order = $position;
                }
                $moved = $model->exists && $resource !== 'chapters'
                    && $model->isDirty($resource === 'reading-questions' ? 'reading_passage_id' : 'chapter_id');
                $model->save();
                if ($moved && in_array(self::RESOURCES[$resource][1], ['video', 'module', 'flashcard', 'audio', 'reading'], true)) {
                    $ids = $resource === 'reading-passages' ? $model->questions()->pluck('id')->all() : [$model->id];
                    ActivityCompletion::where('type', self::RESOURCES[$resource][1])->whereIn('resource_id', $ids)
                        ->update(['chapter_id' => $chapterId]);
                }
                if ($reorderChapter) {
                    $siblings->splice($position, 0, [$model]);
                    $this->normalizeChapters($siblings);
                    if ($oldProgramId !== null && (int) $oldProgramId !== $model->program_id) {
                        $this->normalizeChapters($this->chapterSiblings((int) $oldProgramId));
                    }
                }

                return $model->fresh();
            }, 3);
        } catch (UniqueConstraintViolationException $exception) {
            if ($resource === 'video-lessons') {
                throw ValidationException::withMessages(['chapter_id' => 'Only one video is allowed per chapter.']);
            }
            if ($resource !== 'chapters') {
                throw $exception;
            }
            throw ValidationException::withMessages(['chapter_number' => 'Chapter number already exists in this program.']);
        }
    }

    public function delete(string $resource, string|int $id): void
    {
        $class = $this->model($resource);
        DB::transaction(function () use ($resource, $class, $id) {
            if ($resource === 'chapters') {
                $this->lockChapters();
            }
            $model = $class::whereKey($id)->lockForUpdate()->firstOrFail();
            if ($resource === 'chapters' && CheckpointQuestion::where('chapter_id', $model->id)->exists()) {
                throw ValidationException::withMessages(['chapter' => 'Chapter has Checkpoint questions and cannot be deleted.']);
            }
            if ($resource === 'chapters' && LearningAttempt::where('chapter_id', $model->id)->exists()) {
                throw ValidationException::withMessages(['chapter' => 'Chapter has retained learning attempts and cannot be deleted.']);
            }
            $model->delete();
            if ($resource === 'chapters') {
                $this->normalizeChapters($this->chapterSiblings($model->program_id));
            }
        }, 3);
    }

    private function lockChapters(): void
    {
        DB::select('SELECT pg_advisory_xact_lock(hashtext(?))', ['learning-chapter-order']);
    }

    private function chapterSiblings(int $programId, ?int $exceptId = null): \Illuminate\Database\Eloquent\Collection
    {
        return Chapter::where('program_id', $programId)
            ->when($exceptId !== null, fn ($query) => $query->whereKeyNot($exceptId))
            ->orderBy('sort_order')->orderBy('chapter_number')->orderBy('id')
            ->lockForUpdate()->get();
    }

    private function normalizeChapters(\Illuminate\Database\Eloquent\Collection $chapters): void
    {
        foreach ($chapters->values() as $position => $chapter) {
            if ($chapter->sort_order !== $position) {
                $chapter->sort_order = $position;
                $chapter->save();
            }
        }
    }

    private function allowsFlashcards(Program $program): bool
    {
        return $program->family === 'jlpt' && in_array($program->code, ['n5', 'n4', 'n3', 'n2', 'n1'], true);
    }

    private function allowed(string $family, string $activity): bool
    {
        return in_array($activity, self::ACTIVITIES[$family] ?? [], true);
    }
}
