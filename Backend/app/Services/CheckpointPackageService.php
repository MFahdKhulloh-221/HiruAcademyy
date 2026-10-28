<?php

namespace App\Services;

use App\Models\CheckpointPackage;
use App\Models\Program;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class CheckpointPackageService
{
    public const SESSIONS = ['vocabulary_kanji' => 'Kosakata & Kanji', 'audio' => 'Choukai', 'reading' => 'Dokkai', 'grammar' => 'Tata Bahasa'];

    public function save(array $input, ?CheckpointPackage $package = null): CheckpointPackage
    {
        $data = app(TryOutService::class)->validateInput($input, [
            'program_id' => ['required', 'integer', 'exists:programs,id'],
            'title' => ['required', 'string', 'max:255'],
            'access_type' => ['required', Rule::in(['free', 'membership'])],
            'status' => ['required', Rule::in(['draft', 'published'])],
            'duration_minutes' => ['required', 'integer', 'min:1', 'max:2147483647'],
            'passing_score' => ['required', 'integer', 'min:0', 'max:100'],
            'questions' => ['present', 'array'],
            'questions.*' => ['required', 'array:id,session,audio_url,reading_passage'],
            'questions.*.id' => ['required', 'integer', 'distinct', 'exists:checkpoint_questions,id'],
            'questions.*.session' => ['required', Rule::in(array_keys(self::SESSIONS))],
            'questions.*.audio_url' => ['nullable', 'string', app(MediaService::class)->rule('audio')],
            'questions.*.reading_passage' => ['nullable', 'string'],
        ]);

        return app(MediaService::class)->locked(fn () => DB::transaction(function () use ($data, $package) {
            $model = $package ? CheckpointPackage::whereKey($package->id)->lockForUpdate()->firstOrFail() : new CheckpointPackage;
            $program = Program::whereKey($data['program_id'])->lockForUpdate()->firstOrFail();
            if ($program->status !== 'active') {
                throw ValidationException::withMessages(['program_id' => 'Pilih program aktif.']);
            }
            if ($model->exists && $model->program_id !== $program->id && DB::table('checkpoint_attempts')->where('checkpoint_package_id', $model->id)->exists()) {
                throw ValidationException::withMessages(['program_id' => 'Program paket dengan riwayat pengerjaan tidak dapat diganti.']);
            }
            $model->fill(array_diff_key($data, ['questions' => true]));
            $model->save();
            $links = [];
            foreach ($data['questions'] as $index => $item) {
                $links[$item['id']] = ['session' => $item['session'], 'sort_order' => $index, 'audio_url' => $item['audio_url'] ?? null, 'reading_passage' => isset($item['reading_passage']) ? PlacementRichText::sanitize($item['reading_passage']) : null];
            }
            $model->questions()->sync($links);
            $this->questions($model, $model->status === 'published');

            return $model->fresh();
        }, 3));
    }

    public function questions(CheckpointPackage $package, bool $publish = true)
    {
        $questions = $package->questions()->with('chapter')->lockForUpdate()->get();
        foreach ($questions as $question) {
            if ($question->chapter->program_id !== $package->program_id) {
                throw ValidationException::withMessages(['questions' => 'Semua soal harus berasal dari program paket.']);
            }
            if (! $publish) {
                continue;
            }
            $texts = [$question->question, ...array_values($question->options ?? [])];
            if ($question->status !== 'published' || $question->chapter->status !== 'published'
                || array_diff(['A', 'B', 'C', 'D'], array_keys($question->options ?? [])) !== []
                || count($question->options ?? []) !== 4 || ! in_array($question->correct_option, ['A', 'B', 'C', 'D'], true)
                || count(array_filter($texts, fn ($text) => trim(html_entity_decode(strip_tags($text), ENT_QUOTES | ENT_HTML5, 'UTF-8'), " \t\n\r\0\x0B\xc2\xa0") === '')) > 0
                || ! array_key_exists($question->pivot->session, self::SESSIONS)
                || ($question->pivot->session === 'audio' && ! $question->pivot->audio_url)
                || ($question->pivot->session === 'reading' && ! trim(strip_tags($question->pivot->reading_passage ?? '')))) {
                throw ValidationException::withMessages(['questions' => 'Soal harus lengkap dan Published; Choukai memerlukan audio, Dokkai memerlukan bacaan.']);
            }
        }
        if ($publish && ($questions->isEmpty() || count(array_unique($questions->map(fn ($question) => $question->pivot->session)->all())) !== 4)) {
            throw ValidationException::withMessages(['questions' => 'Paket harus memiliki soal pada empat bagian.']);
        }

        return $questions;
    }

    public function payload(CheckpointPackage $package, bool $admin = false): array
    {
        $result = $package->only(['id', 'program_id', 'title', 'access_type', 'status', 'duration_minutes', 'passing_score']);
        $result += ['program' => $package->program->only(['id', 'code', 'name']), 'max_score' => 100, 'question_count' => $package->questions()->count(), 'sessions' => self::SESSIONS];
        if ($admin) {
            $result['questions'] = $package->questions->map(fn ($question) => ['id' => $question->id, 'session' => $question->pivot->session, 'audio_url' => $question->pivot->audio_url, 'reading_passage' => $question->pivot->reading_passage])->all();
        }

        return $result;
    }
}
