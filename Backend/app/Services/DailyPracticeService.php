<?php

namespace App\Services;

use App\Models\DailyPractice;
use App\Models\DailyPracticePassage;
use App\Models\DailyPracticeQuestion;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class DailyPracticeService extends TryOutService
{
    protected string $assessmentModel = DailyPractice::class;

    protected string $questionModel = DailyPracticeQuestion::class;

    protected string $passageModel = DailyPracticePassage::class;

    protected string $attemptTable = 'daily_practice_attempts';

    protected string $parentKey = 'daily_practice_id';

    public const CATEGORIES = ['vocabulary' => 'vocabulary_kanji', 'grammar' => 'grammar', 'reading' => 'reading', 'audio' => 'audio'];

    protected function supportsTryOutContent(): bool
    {
        return true;
    }

    protected function validateAssessment(Model $assessment): void {}

    public function builderCapabilities(): array
    {
        return ['images' => true, 'decimal_points' => true];
    }

    public function passageFields(): array
    {
        return ['id', 'title', 'body', 'image', 'image_alt', 'image_position', 'blocks'];
    }

    public function assertMutable(Model $practice): void
    {
        abort_if(DB::table($this->attemptTable)->where($this->parentKey, $practice->id)->exists(), 409, 'Latihan yang sudah dikerjakan tidak dapat diubah atau dihapus.');
    }

    public function save(array $input, ?Model $tryOut = null): Model
    {
        return DB::transaction(function () use ($input, $tryOut) {
            $model = $tryOut ? DailyPractice::whereKey($tryOut->id)->lockForUpdate()->firstOrFail() : new DailyPractice;
            if ($model->exists) {
                $this->assertMutable($model);
            }
            $required = $model->exists ? 'sometimes' : 'required';
            $data = $this->validateInput($input, [
                'title' => [$required, 'required', 'string', 'max:255'],
                'category' => [$required, 'required', Rule::in(array_keys(self::CATEGORIES))],
                'target_level' => [$required, 'required', 'string', Rule::exists('programs', 'code')],
                'status' => ['sometimes', 'required', Rule::in(['draft', 'published'])],
            ]);
            $model->fill($data);
            $model->status ??= 'draft';
            $model->save();
            if ($model->status === 'published') {
                $this->assertPublishable($model);
            }

            return $model->fresh();
        }, 3);
    }

    public function assertPublishable(Model $tryOut): void
    {
        $questions = $tryOut->questions()->get();
        if ($questions->isEmpty() || $questions->contains(fn ($q) => $q->status !== 'published' || $q->session !== self::CATEGORIES[$tryOut->category])) {
            throw ValidationException::withMessages(['status' => 'Latihan hanya dapat diterbitkan jika semua soal sudah diterbitkan dan sesuai dengan kategori latihan.']);
        }
        foreach ($questions as $question) {
            $this->assertQuestion($question);
        }
    }

    public function saveQuestion(Model $tryOut, array $input, ?Model $question = null): Model
    {
        return app(MediaService::class)->locked(function () use ($tryOut, $input, $question) {
            $parent = DailyPractice::whereKey($tryOut->id)->lockForUpdate()->firstOrFail();
            $this->assertMutable($parent);

            return parent::saveQuestion($parent, $input, $question);
        });
    }

    public function saveStudio(Model $tryOut, array $input): Model
    {
        return app(MediaService::class)->locked(function () use ($tryOut, $input) {
            $parent = DailyPractice::whereKey($tryOut->id)->lockForUpdate()->firstOrFail();
            $this->assertMutable($parent);

            return parent::saveStudio($parent, $input);
        });
    }

    public function delete(Model $tryOut, ?Model $question = null): void
    {
        DB::transaction(function () use ($tryOut) {
            $parent = DailyPractice::whereKey($tryOut->id)->lockForUpdate()->firstOrFail();
            $this->assertMutable($parent);
            // Delete questions first: passages have restricted foreign keys.
            $parent->questions()->delete();
            $parent->delete();
        }, 3);
    }

    public function payload(Model $tryOut): array
    {
        return $tryOut->only(['id', 'title', 'category', 'target_level', 'status']) + [
            'starts_at' => $tryOut->starts_at?->toISOString(), 'ends_at' => $tryOut->ends_at?->toISOString(),
            'locked' => DB::table($this->attemptTable)->where($this->parentKey, $tryOut->id)->exists(),
            'question_count' => $tryOut->questions()->count(), 'max_score' => (float) $tryOut->questions()->sum('point_value'),
            'server_now' => now()->toISOString(),
        ];
    }
}
