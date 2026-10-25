<?php

namespace App\Services;

use App\Models\PlacementAttempt;
use App\Models\PlacementConfig;
use App\Models\PlacementQuestion;
use App\Models\Program;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class PlacementService
{
    public const RESOURCES = ['placement-configs' => PlacementConfig::class, 'placement-questions' => PlacementQuestion::class];

    public const CATEGORIES = ['Bunpou', 'Moji・Goi', 'Dokkai', 'Choukai'];

    public const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];

    private const CONFIG_FIELDS = ['id', 'title', 'intro_heading', 'duration_minutes', 'description', 'question_count'];

    private const QUESTION_FIELDS = ['id', 'prompt', 'options', 'category', 'level', 'passage', 'sort_order', 'image_url', 'audio_url'];

    public function model(string $resource): string
    {
        abort_unless(isset(self::RESOURCES[$resource]), 404);

        return self::RESOURCES[$resource];
    }

    public function ordered(string $resource): Builder
    {
        $class = $this->model($resource);

        return $class::query()->orderBy($resource === 'placement-questions' ? 'sort_order' : 'id')->orderBy('id');
    }

    public function validateInput(array $input, array $rules): array
    {
        $unknown = array_diff(array_keys($input), array_filter(array_keys($rules), fn ($key) => ! str_contains($key, '.')));
        if ($unknown !== []) {
            throw ValidationException::withMessages(array_fill_keys($unknown, 'Field is prohibited.'));
        }

        return Validator::make($input, $rules)->validate();
    }

    private function rules(string $resource, bool $updating): array
    {
        $required = $updating ? 'sometimes' : 'required';
        $text = [$required, 'required', 'string'];
        $status = ['sometimes', 'required', Rule::in(['draft', 'published'])];
        if ($resource === 'placement-configs') {
            return ['title' => [...$text, 'max:255'], 'intro_heading' => [...$text, 'max:255'], 'duration_minutes' => [$required, 'required', 'integer', 'min:1', 'max:2147483647'], 'description' => $text, 'status' => $status, 'recommendation_rules' => ['sometimes', 'array'], 'recommendation_rules.*.id' => ['sometimes', 'required', 'string', 'max:100', 'distinct:strict'], 'recommendation_rules.*.minScore' => ['required', 'integer', 'between:0,100'], 'recommendation_rules.*.maxScore' => ['required', 'integer', 'between:0,100'], 'recommendation_rules.*.recommendedProgramCode' => ['required', Rule::in(['N5', 'N4', 'N3', 'N2', 'N1'])], 'recommendation_rules.*.resultTitle' => ['required', 'string', 'max:255'], 'recommendation_rules.*.resultDescription' => ['required', 'string', 'max:5000']];
        }
        $media = ['bail', 'sometimes', 'nullable', 'string', function ($attribute, $value, $fail) {
            if (! $this->safeReference($value)) {
                $fail('Use a safe storage-relative reference or HTTP/HTTPS URL without credentials.');
            }
        }];
        $rules = [
            'placement_config_id' => [$required, 'required', 'integer', 'exists:placement_configs,id'],
            'level' => ['sometimes', 'nullable', Rule::in(self::LEVELS)],
            'passage' => ['sometimes', 'nullable', 'string'],
            'prompt' => $text,
            'options' => [$required, 'required', 'array:A,B,C,D', 'size:4'],
            'correct_option' => [$required, 'required', Rule::in(['A', 'B', 'C', 'D'])],
            'category' => [$required, 'required', Rule::in(self::CATEGORIES)],
            'status' => $status,
            'sort_order' => ['sometimes', 'required', 'integer', 'min:1', 'max:2147483647'],
            'image_url' => $media,
            'audio_url' => $media,
            'explanation' => ['sometimes', 'nullable', 'string'],
        ];
        foreach (['A', 'B', 'C', 'D'] as $option) {
            $rules['options.'.$option] = [$updating ? 'required_with:options' : 'required', 'string', function ($attribute, $value, $fail) {
                if (is_string($value) && trim($value) === '') {
                    $fail('Nonempty option required.');
                }
            }];
        }

        return $rules;
    }

    public function save(string $resource, array $input, ?Model $model = null): Model
    {
        $class = $this->model($resource);
        $data = $this->validateInput($input, $this->rules($resource, $model?->exists ?? false));
        if ($resource === 'placement-questions') {
            foreach (['prompt', 'passage', 'explanation'] as $field) {
                if (isset($data[$field])) {
                    $data[$field] = PlacementRichText::sanitize($data[$field]);
                }
            }
            if (isset($data['options'])) {
                $data['options'] = array_map(PlacementRichText::sanitize(...), $data['options']);
            }
            foreach (['prompt' => $data['prompt'] ?? null, ...($data['options'] ?? [])] as $field => $value) {
                if ($value !== null && trim(html_entity_decode(strip_tags(preg_replace('/<rt>.*?<\/rt>/s', '', $value)), ENT_QUOTES, 'UTF-8')) === '') {
                    throw ValidationException::withMessages([$field => 'Konten teks wajib diisi.']);
                }
            }
        }

        return DB::transaction(function () use ($class, $resource, $data, $model) {
            if ($resource === 'placement-configs') {
                $locked = $model ? PlacementConfig::whereKey($model->id)->lockForUpdate()->firstOrFail() : new PlacementConfig;
                $rules = $this->recommendationRules($data['recommendation_rules'] ?? $locked->recommendation_rules ?? [], $locked->id);
                usort($rules, fn ($first, $second) => $first['minScore'] <=> $second['minScore']);
                $previous = -1;
                foreach ($rules as $rule) {
                    if ($rule['maxScore'] < $rule['minScore'] || $rule['minScore'] <= $previous) {
                        throw ValidationException::withMessages(['recommendation_rules' => 'Rentang skor tidak valid atau tumpang tindih.']);
                    }
                    $previous = $rule['maxScore'];
                }
                $locked->fill([...$data, 'recommendation_rules' => $rules])->save();
                $this->assertPublishable($locked);
            } else {
                $parentId = $model?->placement_config_id ?? $data['placement_config_id'];
                if ($model && isset($data['placement_config_id']) && (int) $data['placement_config_id'] !== $parentId) {
                    throw ValidationException::withMessages(['placement_config_id' => 'Question cannot move between configurations.']);
                }
                $parent = PlacementConfig::whereKey($parentId)->lockForUpdate()->firstOrFail();
                $locked = $model ? $class::whereKey($model->id)->lockForUpdate()->firstOrFail() : new $class;
                $locked->fill($data)->save();
                // Readiness may fall below minimum; existing attempts keep their snapshots.
            }

            return $locked->fresh();
        }, 3);
    }

    public function assertPublishable(PlacementConfig $config): void
    {
        if ($config->status === 'published') {
            $this->assertCoverage($config);
        }
    }

    public function delete(Model $model): void
    {
        DB::transaction(function () use ($model) {
            $parent = PlacementConfig::whereKey($model instanceof PlacementConfig ? $model->id : $model->placement_config_id)->lockForUpdate()->firstOrFail();
            if ($model instanceof PlacementQuestion) {
                $parent->questions()->whereKey($model->id)->firstOrFail()->delete();
                // Readiness may fall below minimum; existing attempts keep their snapshots.
            } else {
                if (PlacementAttempt::where('placement_config_id', $parent->id)->exists()) {
                    throw ValidationException::withMessages(['placement_config' => 'Configuration with attempts cannot be deleted.']);
                }
                $parent->delete();
            }
        }, 3);
    }

    private function recommendationRules(array $rules, ?int $configId): array
    {
        foreach ($rules as $index => &$rule) {
            $rule['id'] ??= $configId ? "placement-{$configId}-rule-{$index}" : (string) Str::uuid();
        }

        return $rules;
    }

    public function adminPayload(Model $model): array
    {
        return $model instanceof PlacementConfig
            ? [...$model->only([...self::CONFIG_FIELDS, 'status']), 'question_count' => $this->validBank($model)->count(), 'recommendation_rules' => $this->recommendationRules($model->recommendation_rules ?? [], $model->id), 'availability' => $this->availability($model)]
            : $model->only([...self::QUESTION_FIELDS, 'placement_config_id', 'correct_option', 'explanation', 'status']);
    }

    private function publicQuestion(array $question): array
    {
        $item = array_intersect_key($question, array_flip(self::QUESTION_FIELDS));
        $item['options'] = array_intersect_key($question['options'], array_flip(['A', 'B', 'C', 'D']));

        if (array_key_exists('passage', $question)) {
            $item['reading_passage'] = $question['passage'];
        }

        return $item;
    }

    public function published(): PlacementConfig
    {
        return PlacementConfig::where('status', 'published')->orderByDesc('id')->firstOrFail();
    }

    public function publicPayload(PlacementConfig $config): array
    {
        $count = $this->validBank($config)->count();

        return [...$config->only(self::CONFIG_FIELDS), 'question_count' => $count, 'adaptive' => false, 'question_limit' => $count, 'is_ready' => $count >= 15, 'questions' => []];
    }

    private function assertStudent(Request $request): void
    {
        if ($user = $request->user()) {
            abort_unless($user->role === 'student' && $user->account_status === 'active', 403);
        }
    }

    public function authorize(Request $request, PlacementAttempt $attempt): void
    {
        if ($attempt->config_snapshot['preview'] ?? false) {
            abort_unless($request->user()?->role === 'admin' && $request->user()?->account_status === 'active' && $request->user()?->id === $attempt->user_id && $request->is('api/admin/*'), 404);

            return;
        }
        $this->assertStudent($request);
        if ($attempt->user_id !== null) {
            abort_unless($request->user()?->id === $attempt->user_id, 404);
        } else {
            $token = $request->session()->get('placement_owner');
            abort_unless(is_string($token) && hash_equals($attempt->owner_hash, hash('sha256', $token)), 404);
        }
    }

    public function start(Request $request): PlacementAttempt
    {
        $this->assertStudent($request);
        $data = $this->validateInput($request->all(), [
            'name' => ['required', 'string', 'max:255'],
            'whatsapp' => ['required', 'string', 'regex:/^\+?[0-9][0-9 ()-]{5,30}[0-9]$/D'],
            'target' => ['required', Rule::in(['N1', 'N2', 'N3', 'N4', 'N5', 'Belum menentukan'])],
            'privacy' => ['required', 'accepted'],
            'whatsappConsent' => ['sometimes', 'required', 'boolean'],
        ]);
        $data['privacy'] = true;
        $data['whatsappConsent'] = (bool) ($data['whatsappConsent'] ?? false);
        $token = $request->session()->get('placement_owner');
        if (! is_string($token) || strlen($token) !== 64) {
            $token = bin2hex(random_bytes(32));
            $request->session()->put('placement_owner', $token);
        }

        return DB::transaction(function () use ($request, $data, $token) {
            $config = PlacementConfig::whereKey($this->published()->id)->lockForUpdate()->firstOrFail();
            abort_unless($config->status === 'published', 404);
            try {
                $this->assertCoverage($config);
            } catch (ValidationException) {
                throw ValidationException::withMessages([
                    'availability' => 'Placement Test sedang disiapkan. Silakan coba lagi nanti.',
                ]);
            }
            $questions = $this->validBank($config);
            $grading = [];
            foreach ($questions as $question) {
                $grading[$question->id] = $question->correct_option;
            }
            $started = CarbonImmutable::now('UTC');

            return PlacementAttempt::create([
                'placement_config_id' => $config->id,
                'user_id' => $request->user()?->id,
                'owner_hash' => $request->user() ? null : hash('sha256', $token),
                'applicant_snapshot' => $data,
                'config_snapshot' => [...$config->only([...self::CONFIG_FIELDS, 'recommendation_rules']), 'question_count' => $questions->count(), 'scoring_version' => 'percentage-v1'],
                'adaptive_state' => ['revision' => 0],
                'content_snapshot' => $questions->map(fn ($question) => $question->only(self::QUESTION_FIELDS))->all(),
                'grading_snapshot' => $grading,
                'answers' => [],
                'status' => 'in_progress',
                'started_at' => $started,
                'expires_at' => $started->addMinutes($config->duration_minutes),
            ])->fresh();
        }, 3);
    }

    private function assertAnswers(PlacementAttempt $attempt, array $answers): void
    {
        $ids = array_map('strval', $attempt->adaptive_state['issued_ids'] ?? array_column($attempt->content_snapshot, 'id'));
        foreach ($answers as $id => $answer) {
            if (! in_array((string) $id, $ids, true)) {
                throw ValidationException::withMessages(['answers' => 'Only attempt questions allowed.']);
            }
        }
    }

    public function saveAnswers(Request $request, PlacementAttempt $attempt): PlacementAttempt
    {
        $this->authorize($request, $attempt);
        $data = $this->validateInput($request->all(), ['revision' => ['sometimes', 'required', 'integer', 'min:0'], 'answers' => ['present', 'array'], 'answers.*' => ['required', Rule::in(['A', 'B', 'C', 'D'])]]);

        return DB::transaction(function () use ($request, $attempt, $data) {
            $locked = $attempt->newQuery()->whereKey($attempt->id)->lockForUpdate()->firstOrFail();
            $this->authorize($request, $locked);
            if ($locked->adaptive_state !== null && $locked->status === 'completed') {
                $this->assertAnswers($locked, $data['answers']);

                return $locked;
            }
            if ($locked->adaptive_state !== null && $locked->status === 'in_progress' && CarbonImmutable::now('UTC')->gte($locked->expires_at)) {
                $this->assertAnswers($locked, $data['answers']);
                $locked->update(['result_snapshot' => $this->result($locked, $locked->answers), 'status' => 'completed', 'completed_at' => CarbonImmutable::now('UTC')]);

                return $locked->fresh();
            }
            abort_unless($locked->status === 'in_progress' && CarbonImmutable::now('UTC')->lt($locked->expires_at), 409, 'Attempt completed or deadline reached.');
            $this->assertAnswers($locked, $data['answers']);
            if (isset($locked->adaptive_state['issued_ids'])) {
                $answers = $this->adaptiveAnswers($locked, $data);
                $state = $locked->adaptive_state;
                $ids = $state['issued_ids'];
                $current = end($ids);
                if (isset($answers[$current]) && count($ids) < $locked->config_snapshot['question_count']) {
                    $question = collect($locked->content_snapshot)->firstWhere('id', $current);
                    $index = array_search($question['level'], self::LEVELS, true);
                    $level = self::LEVELS[max(0, min(4, $index + ($answers[$current] === $locked->grading_snapshot[$current] ? 1 : -1)))];
                    $state['issued_ids'][] = $this->selectQuestion($locked->content_snapshot, $ids, $level, count($ids))['id'];
                }
                $state['revision']++;
                $locked->update(['answers' => $answers, 'adaptive_state' => $state]);
            } else {
                if ($locked->adaptive_state !== null) {
                    abort_unless(($data['revision'] ?? null) === $locked->adaptive_state['revision'], 409, 'Stale placement revision. Refresh attempt.');
                }
                $locked->update(['answers' => $data['answers'], 'adaptive_state' => $locked->adaptive_state === null ? null : ['revision' => $locked->adaptive_state['revision'] + 1]]);
            }

            return $locked->fresh();
        }, 3);
    }

    public function submit(Request $request, PlacementAttempt $attempt): PlacementAttempt
    {
        $this->authorize($request, $attempt);
        $data = $this->validateInput($request->all(), ['revision' => ['sometimes', 'required', 'integer', 'min:0'], 'answers' => ['present', 'array'], 'answers.*' => ['required', Rule::in(['A', 'B', 'C', 'D'])]]);

        return DB::transaction(function () use ($request, $attempt, $data) {
            $locked = $attempt->newQuery()->whereKey($attempt->id)->lockForUpdate()->firstOrFail();
            $this->authorize($request, $locked);
            $this->assertAnswers($locked, $data['answers']);
            if ($locked->status === 'completed') {
                return $locked;
            }
            $completed = CarbonImmutable::now('UTC');
            $answers = $completed->lt($locked->expires_at) ? (isset($locked->adaptive_state['issued_ids']) ? $this->adaptiveAnswers($locked, $data) : $data['answers']) : $locked->answers;
            if (isset($locked->adaptive_state['issued_ids'])) {
                $locked->update(['answers' => $answers, 'result_snapshot' => $this->adaptiveResult($locked, $answers), 'status' => 'completed', 'completed_at' => $completed]);

                return $locked->fresh();
            }
            if ($locked->adaptive_state !== null && $completed->lt($locked->expires_at)) {
                abort_unless(($data['revision'] ?? null) === $locked->adaptive_state['revision'], 409, 'Stale placement revision. Refresh attempt.');
            }
            $result = $this->result($locked, $answers);
            $locked->update(['answers' => $answers, 'result_snapshot' => $result, 'status' => 'completed', 'completed_at' => $completed]);

            return $locked->fresh();
        }, 3);
    }

    private function result(PlacementAttempt $attempt, array $answers): array
    {
        if (isset($attempt->adaptive_state['issued_ids'])) {
            return $this->adaptiveResult($attempt, $answers);
        }
        $result = ['correct' => 0, 'wrong' => 0, 'unanswered' => 0, 'total' => count($attempt->content_snapshot), 'percentage' => 0, 'recommendation_level' => null];
        foreach ($attempt->grading_snapshot as $id => $correct) {
            $answer = $answers[$id] ?? null;
            $result[$answer === null ? 'unanswered' : ($answer === $correct ? 'correct' : 'wrong')]++;
        }
        $percentage = $result['correct'] * 100 / $result['total'];
        $result['percentage'] = ($attempt->config_snapshot['scoring_version'] ?? null) === 'percentage-v1' ? $percentage : (int) round($percentage);
        $result['areas'] = $this->categoryResults($attempt, $answers);
        foreach ($attempt->config_snapshot['recommendation_rules'] ?? [] as $rule) {
            if ($result['percentage'] >= $rule['minScore'] && $result['percentage'] <= $rule['maxScore']) {
                $result['recommendation_level'] = $rule['recommendedProgramCode'];
                break;
            }
        }
        if (($attempt->config_snapshot['scoring_version'] ?? null) === 'percentage-v1') {
            $level = match (true) {
                $percentage < 25 => 'N5',
                $percentage < 50 => 'N4',
                $percentage < 70 => 'N3',
                $percentage < 85 => 'N2',
                default => 'N1',
            };
            $program = Program::where('status', 'active')->where('family', 'jlpt')->whereRaw('LOWER(code) = ?', [strtolower($level)])->orderBy('id')->first();
            $result = [...$result, 'recommendation_level' => $level, 'result_title' => "Estimasi Level JLPT {$level}",
                'result_description' => 'Estimasi berdasarkan persentase jawaban benar, bukan sertifikasi JLPT.', 'estimation_label' => 'Estimasi Level JLPT',
                'recommended_program' => $program ? ['code' => $program->code, 'title' => $program->name, 'path' => '/program?level='.rawurlencode($program->code)] : null,
                'program_message' => $program ? 'Program sesuai estimasi tersedia.' : 'Program sesuai estimasi belum tersedia.'];
        }

        return $result;
    }

    private function categoryResults(PlacementAttempt $attempt, array $answers): array
    {
        return array_map(function ($category) use ($attempt, $answers) {
            $questions = array_filter($this->issuedQuestions($attempt), fn ($question) => $question['category'] === $category);
            $correct = count(array_filter($questions, fn ($question) => isset($answers[$question['id']]) && $answers[$question['id']] === ($attempt->grading_snapshot[$question['id']] ?? null)));
            $total = count($questions);

            return ['name' => $category, 'score' => $total > 0 ? (int) round($correct * 100 / $total) : 0, 'correct' => $correct, 'total' => $total];
        }, self::CATEGORIES);
    }

    public function refreshAttempt(Request $request, PlacementAttempt $attempt): PlacementAttempt
    {
        $this->authorize($request, $attempt);

        return DB::transaction(function () use ($request, $attempt) {
            $locked = $attempt->newQuery()->whereKey($attempt->id)->lockForUpdate()->firstOrFail();
            $this->authorize($request, $locked);
            if ($locked->adaptive_state !== null && $locked->status === 'in_progress' && CarbonImmutable::now('UTC')->gte($locked->expires_at)) {
                $locked->update(['result_snapshot' => $this->result($locked, $locked->answers), 'status' => 'completed', 'completed_at' => CarbonImmutable::now('UTC')]);
            }

            return $locked->fresh();
        }, 3);
    }

    public function attemptPayload(PlacementAttempt $attempt): array
    {
        return [
            'id' => $attempt->id,
            'placement_config_id' => $attempt->placement_config_id,
            'status' => $attempt->status,
            'config' => array_intersect_key($attempt->config_snapshot, array_flip(self::CONFIG_FIELDS)),
            'adaptive' => isset($attempt->adaptive_state['issued_ids']),
            'question_limit' => $attempt->config_snapshot['question_count'] ?? count($attempt->content_snapshot),
            'revision' => $attempt->adaptive_state['revision'] ?? 0,
            'scoring_version' => $attempt->config_snapshot['scoring_version'] ?? null,
            'questions' => array_map(fn ($question) => $this->publicQuestion($question), $this->issuedQuestions($attempt)),
            'answers' => $attempt->answers,
            'result' => $attempt->status === 'completed' ? [...array_intersect_key($attempt->result_snapshot, array_flip(['correct', 'wrong', 'unanswered', 'total', 'percentage', 'recommendation_level', 'result_title', 'result_description', 'estimation_label', 'evidence', 'recommended_program', 'availability_message', 'program_message'])), 'areas' => $attempt->result_snapshot['areas'] ?? $this->categoryResults($attempt, $attempt->answers)] : null,
            'started_at' => $attempt->started_at->utc()->toISOString(),
            'expires_at' => $attempt->expires_at->utc()->toISOString(),
            'completed_at' => $attempt->completed_at?->utc()->toISOString(),
        ];
    }

    private function validBank(PlacementConfig $config): Collection
    {
        return $config->questions()->where('status', 'published')->whereIn('level', self::LEVELS)->orderBy('sort_order')->orderBy('id')->get()->filter(function ($q) {
            return trim($q->prompt) !== '' && in_array($q->category, self::CATEGORIES, true)
                && in_array($q->correct_option, ['A', 'B', 'C', 'D'], true)
                && ($q->category !== 'Choukai' || (is_string($q->audio_url) && trim($q->audio_url) !== ''))
                && ($q->category !== 'Dokkai' || (is_string($q->passage) && trim($q->passage) !== ''))
                && count($q->options ?? []) === 4
                && collect(['A', 'B', 'C', 'D'])->every(fn ($key) => is_string($q->options[$key] ?? null) && trim($q->options[$key]) !== '')
                && collect([$q->image_url, $q->audio_url])->every(fn ($value) => $value === null || $this->safeReference($value));
        })->values();
    }

    public function availability(PlacementConfig $config): array
    {
        $bank = $this->validBank($config);
        $availability = [];
        foreach (self::LEVELS as $level) {
            foreach (self::CATEGORIES as $category) {
                $availability[$level][$category] = ['valid' => $bank->where('level', $level)->where('category', $category)->count(), 'required' => 0];
            }
        }

        return $availability;
    }

    public function missingCoverage(PlacementConfig $config): array
    {
        $missing = max(0, 15 - $this->validBank($config)->count());

        return ['total' => $missing, 'details' => $missing ? ["Minimum 15 soal valid; kurang {$missing} soal"] : []];
    }

    public function assertCoverage(PlacementConfig $config): void
    {
        $coverage = $this->missingCoverage($config);
        if ($coverage['total'] > 0) {
            throw ValidationException::withMessages([
                'availability' => "Placement Test belum siap: masih kurang {$coverage['total']} soal terbit yang valid (" . implode(', ', $coverage['details']) . ').',
            ]);
        }
    }

    private function selectQuestion(array $bank, array $issued, string $level, int $position): array
    {
        $category = self::CATEGORIES[$position % count(self::CATEGORIES)];
        foreach ($bank as $question) {
            if ($question['level'] === $level && $question['category'] === $category && ! in_array($question['id'], $issued, true)) {
                return $question;
            }
        }
        throw ValidationException::withMessages(['availability' => 'Bank adaptif tidak mencukupi.']);
    }

    private function issuedQuestions(PlacementAttempt $attempt): array
    {
        if (! isset($attempt->adaptive_state['issued_ids'])) {
            return $attempt->content_snapshot;
        }
        $bank = array_column($attempt->content_snapshot, null, 'id');

        return array_map(fn ($id) => $bank[$id], $attempt->adaptive_state['issued_ids']);
    }

    private function adaptiveAnswers(PlacementAttempt $attempt, array $data): array
    {
        if (! array_key_exists('revision', $data)) {
            throw ValidationException::withMessages(['revision' => 'Revision wajib untuk attempt adaptif.']);
        }
        abort_unless($data['revision'] === $attempt->adaptive_state['revision'], 409, 'Stale placement revision. Refresh attempt.');
        foreach ($attempt->answers as $id => $answer) {
            if (isset($data['answers'][$id]) && $data['answers'][$id] !== $answer) {
                throw ValidationException::withMessages(['answers' => 'Jawaban yang sudah dikunci tidak dapat diubah.']);
            }
        }

        return array_replace($attempt->answers, $data['answers']);
    }

    private function adaptiveResult(PlacementAttempt $attempt, array $answers): array
    {
        $total = $attempt->config_snapshot['question_count'];
        $correct = 0;
        $wrong = 0;
        $evidence = [];
        foreach (self::LEVELS as $level) {
            $evidence[$level] = ['correct' => 0, 'answered' => 0, 'categories' => [], 'accuracy' => 0, 'mastered' => false];
        }
        foreach ($this->issuedQuestions($attempt) as $question) {
            $id = $question['id'];
            if (! isset($answers[$id])) {
                continue;
            }
            $entry = &$evidence[$question['level']];
            $entry['answered']++;
            if ($answers[$id] === $attempt->grading_snapshot[$id]) {
                $correct++;
                $entry['correct']++;
                $entry['categories'][] = $question['category'];
            } else {
                $wrong++;
            }
            unset($entry);
        }
        $level = 'N5';
        foreach ($evidence as $candidate => &$entry) {
            $entry['categories'] = array_values(array_unique($entry['categories']));
            $entry['accuracy'] = $entry['answered'] ? (int) round(100 * $entry['correct'] / $entry['answered']) : 0;
            $entry['mastered'] = $entry['correct'] >= 2 && count($entry['categories']) >= 2 && $entry['correct'] * 3 >= $entry['answered'] * 2;
            if ($entry['mastered']) {
                $level = $candidate;
            }
        }
        unset($entry);
        $program = Program::where('status', 'active')->where('family', 'jlpt')->whereRaw('LOWER(code) = ?', [strtolower($level)])->orderBy('id')->first();

        return ['correct' => $correct, 'wrong' => $wrong, 'unanswered' => $total - $correct - $wrong, 'total' => $total, 'percentage' => (int) round(100 * $correct / $total), 'recommendation_level' => $level,
            'result_title' => "Estimasi Level {$level}", 'result_description' => 'Estimasi berdasarkan bukti jawaban per level dan kategori, bukan sertifikasi JLPT.',
            'estimation_label' => 'Estimasi kemampuan awal', 'evidence' => $evidence, 'areas' => $this->categoryResults($attempt, $answers),
            'recommended_program' => $program ? ['code' => $program->code, 'title' => $program->name, 'path' => '/program?level='.rawurlencode($program->code)] : null,
            'program_message' => $program ? 'Program sesuai estimasi tersedia.' : 'Program sesuai estimasi belum tersedia.',
            'availability_message' => $program ? 'Program sesuai estimasi tersedia.' : 'Program sesuai estimasi belum tersedia.'];
    }

    public function preview(Request $request, PlacementConfig $config): PlacementAttempt
    {
        abort_unless($request->user()?->role === 'admin' && $request->user()?->account_status === 'active', 403);
        $this->validateInput($request->all(), []);

        return DB::transaction(function () use ($request, $config) {
            $config = PlacementConfig::whereKey($config->id)->lockForUpdate()->firstOrFail();
            $this->assertCoverage($config);
            $questions = $this->validBank($config);
            $bank = $questions->map(fn ($q) => $q->only(self::QUESTION_FIELDS))->all();
            $started = CarbonImmutable::now('UTC');

            return PlacementAttempt::create(['placement_config_id' => $config->id, 'user_id' => $request->user()->id, 'owner_hash' => null,
                'applicant_snapshot' => [], 'config_snapshot' => [...$config->only(self::CONFIG_FIELDS), 'question_count' => $questions->count(), 'scoring_version' => 'percentage-v1', 'preview' => true],
                'content_snapshot' => $bank, 'grading_snapshot' => $questions->pluck('correct_option', 'id')->all(),
                'adaptive_state' => ['revision' => 0],
                'answers' => [], 'status' => 'in_progress', 'started_at' => $started, 'expires_at' => $started->addMinutes($config->duration_minutes)])->fresh();
        }, 3);
    }

    private function safeReference(string $value): bool
    {
        $decoded = $value;
        for ($i = 0; $i < 3; $i++) {
            $decoded = rawurldecode($decoded);
        }
        if (preg_match('/[\x00-\x20\x7f\\\\]/', $decoded) || str_contains($decoded, '%') || str_starts_with($decoded, '//')) {
            return false;
        }
        $parts = parse_url($decoded);
        if ($parts === false || isset($parts['user']) || isset($parts['pass'])) {
            return false;
        }
        if (isset($parts['scheme'])) {
            if (! in_array(strtolower($parts['scheme']), ['http', 'https'], true) || ! filter_var($value, FILTER_VALIDATE_URL) || empty($parts['host'])) {
                return false;
            }
        } elseif (str_starts_with($decoded, '/') || isset($parts['host']) || str_contains($decoded, ':') || isset($parts['query']) || isset($parts['fragment'])) {
            return false;
        }

        return ! preg_match('~(?:^|/)(?:\.{1,2})(?:/|$)~', $parts['path'] ?? '') && (isset($parts['scheme']) || ($parts['path'] ?? '') !== '');
    }
}
