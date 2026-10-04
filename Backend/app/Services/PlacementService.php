<?php

namespace App\Services;

use App\Models\PlacementAttempt;
use App\Models\PlacementConfig;
use App\Models\PlacementQuestion;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class PlacementService
{
    public const RESOURCES = ['placement-configs' => PlacementConfig::class, 'placement-questions' => PlacementQuestion::class];

    public const CATEGORIES = ['Bunpou', 'Moji・Goi', 'Dokkai', 'Choukai'];

    private const CONFIG_FIELDS = ['id', 'title', 'intro_heading', 'duration_minutes', 'description'];

    private const QUESTION_FIELDS = ['id', 'prompt', 'options', 'category', 'sort_order', 'image_url', 'audio_url'];

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
            return ['title' => [...$text, 'max:255'], 'intro_heading' => [...$text, 'max:255'], 'duration_minutes' => [$required, 'required', 'integer', 'min:1', 'max:2147483647'], 'description' => $text, 'status' => $status];
        }
        $media = ['bail', 'sometimes', 'nullable', 'string', function ($attribute, $value, $fail) {
            if (! $this->safeReference($value)) {
                $fail('Use a safe storage-relative reference or HTTP/HTTPS URL without credentials.');
            }
        }];
        $rules = [
            'placement_config_id' => [$required, 'required', 'integer', 'exists:placement_configs,id'],
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

        return DB::transaction(function () use ($class, $resource, $data, $model) {
            if ($resource === 'placement-configs') {
                $locked = $model ? PlacementConfig::whereKey($model->id)->lockForUpdate()->firstOrFail() : new PlacementConfig;
                $locked->fill($data)->save();
                $this->assertPublishable($locked);
            } else {
                $parentId = $model?->placement_config_id ?? $data['placement_config_id'];
                if ($model && isset($data['placement_config_id']) && (int) $data['placement_config_id'] !== $parentId) {
                    throw ValidationException::withMessages(['placement_config_id' => 'Question cannot move between configurations.']);
                }
                $parent = PlacementConfig::whereKey($parentId)->lockForUpdate()->firstOrFail();
                $locked = $model ? $class::whereKey($model->id)->lockForUpdate()->firstOrFail() : new $class;
                $locked->fill($data)->save();
                $this->assertPublishable($parent);
            }

            return $locked->fresh();
        }, 3);
    }

    public function assertPublishable(PlacementConfig $config): void
    {
        if ($config->status === 'published' && ! $config->questions()->where('status', 'published')->exists()) {
            throw ValidationException::withMessages(['status' => 'Published configuration requires a published question.']);
        }
    }

    public function delete(Model $model): void
    {
        DB::transaction(function () use ($model) {
            $parent = PlacementConfig::whereKey($model instanceof PlacementConfig ? $model->id : $model->placement_config_id)->lockForUpdate()->firstOrFail();
            if ($model instanceof PlacementQuestion) {
                $parent->questions()->whereKey($model->id)->firstOrFail()->delete();
                $this->assertPublishable($parent);
            } else {
                if (PlacementAttempt::where('placement_config_id', $parent->id)->exists()) {
                    throw ValidationException::withMessages(['placement_config' => 'Configuration with attempts cannot be deleted.']);
                }
                $parent->delete();
            }
        }, 3);
    }

    public function adminPayload(Model $model): array
    {
        return $model instanceof PlacementConfig
            ? $model->only([...self::CONFIG_FIELDS, 'status'])
            : $model->only([...self::QUESTION_FIELDS, 'placement_config_id', 'correct_option', 'explanation', 'status']);
    }

    private function publicQuestion(array $question): array
    {
        $item = array_intersect_key($question, array_flip(self::QUESTION_FIELDS));
        $item['options'] = array_intersect_key($question['options'], array_flip(['A', 'B', 'C', 'D']));

        return $item;
    }

    public function published(): PlacementConfig
    {
        return PlacementConfig::where('status', 'published')->whereHas('questions', fn ($query) => $query->where('status', 'published'))->orderByDesc('id')->firstOrFail();
    }

    public function publicPayload(PlacementConfig $config): array
    {
        return [...$config->only(self::CONFIG_FIELDS), 'questions' => $config->questions()->where('status', 'published')->orderBy('sort_order')->orderBy('id')->get()->map(fn ($question) => $this->publicQuestion($question->only(self::QUESTION_FIELDS)))->all()];
    }

    private function assertStudent(Request $request): void
    {
        if ($user = $request->user()) {
            abort_unless($user->role === 'student' && $user->account_status === 'active', 403);
        }
    }

    public function authorize(Request $request, PlacementAttempt $attempt): void
    {
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
            $this->assertPublishable($config);
            $questions = $config->questions()->where('status', 'published')->orderBy('sort_order')->orderBy('id')->get();
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
                'config_snapshot' => $config->only(self::CONFIG_FIELDS),
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
        $ids = array_map('strval', array_column($attempt->content_snapshot, 'id'));
        foreach ($answers as $id => $answer) {
            if (! in_array((string) $id, $ids, true)) {
                throw ValidationException::withMessages(['answers' => 'Only attempt questions allowed.']);
            }
        }
    }

    public function saveAnswers(Request $request, PlacementAttempt $attempt): PlacementAttempt
    {
        $this->authorize($request, $attempt);
        $data = $this->validateInput($request->all(), ['answers' => ['present', 'array'], 'answers.*' => ['required', Rule::in(['A', 'B', 'C', 'D'])]]);

        return DB::transaction(function () use ($request, $attempt, $data) {
            $locked = $attempt->newQuery()->whereKey($attempt->id)->lockForUpdate()->firstOrFail();
            $this->authorize($request, $locked);
            abort_unless($locked->status === 'in_progress' && CarbonImmutable::now('UTC')->lt($locked->expires_at), 409, 'Attempt completed or deadline reached.');
            $this->assertAnswers($locked, $data['answers']);
            $locked->update(['answers' => $data['answers']]);

            return $locked->fresh();
        }, 3);
    }

    public function submit(Request $request, PlacementAttempt $attempt): PlacementAttempt
    {
        $this->authorize($request, $attempt);
        $data = $this->validateInput($request->all(), ['answers' => ['present', 'array'], 'answers.*' => ['required', Rule::in(['A', 'B', 'C', 'D'])]]);

        return DB::transaction(function () use ($request, $attempt, $data) {
            $locked = $attempt->newQuery()->whereKey($attempt->id)->lockForUpdate()->firstOrFail();
            $this->authorize($request, $locked);
            $this->assertAnswers($locked, $data['answers']);
            if ($locked->status === 'completed') {
                return $locked;
            }
            $completed = CarbonImmutable::now('UTC');
            $answers = $completed->lt($locked->expires_at) ? $data['answers'] : $locked->answers;
            $result = ['correct' => 0, 'wrong' => 0, 'unanswered' => 0, 'total' => count($locked->content_snapshot), 'percentage' => 0, 'recommendation_level' => null];
            foreach ($locked->grading_snapshot as $id => $correct) {
                $answer = $answers[$id] ?? null;
                $result[$answer === null ? 'unanswered' : ($answer === $correct ? 'correct' : 'wrong')]++;
            }
            $result['percentage'] = (int) round($result['correct'] * 100 / $result['total']);
            $locked->update(['answers' => $answers, 'result_snapshot' => $result, 'status' => 'completed', 'completed_at' => $completed]);

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
            'questions' => array_map(fn ($question) => $this->publicQuestion($question), $attempt->content_snapshot),
            'answers' => $attempt->answers,
            'result' => $attempt->status === 'completed' ? array_intersect_key($attempt->result_snapshot, array_flip(['correct', 'wrong', 'unanswered', 'total', 'percentage', 'recommendation_level'])) : null,
            'started_at' => $attempt->started_at->utc()->toISOString(),
            'expires_at' => $attempt->expires_at->utc()->toISOString(),
            'completed_at' => $attempt->completed_at?->utc()->toISOString(),
        ];
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
