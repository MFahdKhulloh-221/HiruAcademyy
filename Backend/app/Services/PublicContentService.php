<?php

namespace App\Services;

use App\Models\BlogArticle;
use App\Models\CertificateTemplate;
use App\Models\SenseiProfile;
use App\Models\ShowcaseItem;
use App\Models\Testimonial;
use Carbon\CarbonImmutable;
use DateTimeImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class PublicContentService
{
    public const RESOURCES = [
        'showcase-items' => ShowcaseItem::class,
        'sensei-profiles' => SenseiProfile::class,
        'testimonials' => Testimonial::class,
        'blog-articles' => BlogArticle::class,
        'certificate-templates' => CertificateTemplate::class,
    ];

    public const SHOWCASE_LABELS = [
        'dashboard' => 'Dashboard',
        'journey' => 'Pembelajaran',
        'lesson' => 'Materi / Video Lesson',
        'flashcard' => 'Flashcard',
        'evaluation' => 'Try Out / Evaluasi',
    ];

    public const CATEGORIES = ['Tips Belajar', 'Grammar / Bunpou', 'Listening / Choukai', 'JLPT'];

    public function model(string $resource): string
    {
        abort_unless(isset(self::RESOURCES[$resource]), 404);

        return self::RESOURCES[$resource];
    }

    public function save(string $resource, array $input, ?Model $model = null): Model
    {
        $class = $this->model($resource);
        $model ??= new $class;
        $required = $model->exists ? 'sometimes' : 'required';
        $text = ['bail', $required, 'required', 'string'];
        $string = [...$text, 'max:255'];
        $optional = ['bail', 'sometimes', 'nullable', 'string'];
        $boolean = ['sometimes', 'required', 'boolean'];
        $order = ['sometimes', 'required', 'integer', 'min:1', 'max:2147483647'];
        $media = function ($attribute, $value, $fail) {
            if (! $this->safeReference($value)) {
                $fail('Use a safe storage-relative reference or HTTP/HTTPS URL without credentials.');
            }
        };
        $rules = match ($resource) {
            'showcase-items' => [
                'key' => [$required, 'required', Rule::in(array_keys(self::SHOWCASE_LABELS)), Rule::unique('showcase_items', 'key')->ignore($model)],
                'label' => ['sometimes', 'required', 'string'],
                'image_src' => [...$text, $media],
                'alt' => $text,
                'sort_order' => $order,
                'visible' => $boolean,
            ],
            'sensei-profiles' => [
                'name' => $string,
                'role' => $string,
                'bio' => $text,
                'photo' => [...$text, $media],
                'expertise' => [$required, 'required', 'array', 'list', 'min:1'],
                'expertise.*' => ['required', 'string', 'max:255', 'distinct:strict'],
                'active' => $boolean,
                'sort_order' => $order,
                'level' => ['sometimes', 'nullable', Rule::in(['n5', 'n4', 'n3', 'n2', 'n1'])],
            ],
            'testimonials' => [
                'name' => $string,
                'context' => $text,
                'quote' => $text,
                'image' => [...$optional, $media],
                'video_url' => ['bail', 'sometimes', 'nullable', 'string', 'url:http,https', $media],
                'video_title' => $optional,
                'published' => $boolean,
                'landing' => $boolean,
                'sort_order' => $order,
            ],
            'blog-articles' => [
                'title' => $string,
                'slug' => [...$string, 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', Rule::unique('blog_articles', 'slug')->ignore($model)],
                'excerpt' => $optional,
                'body' => [...$text, function ($attribute, $value, $fail) {
                    if (strip_tags($value) !== $value) {
                        $fail('Body must be plain text, not HTML.');
                    }
                }],
                'thumbnail' => [...$optional, $media],
                'category' => [$required, 'required', Rule::in(self::CATEGORIES)],
                'seo_title' => [...$optional, 'max:255'],
                'meta_description' => $optional,
                'featured' => $boolean,
                'published' => $boolean,
                'published_at' => ['bail', 'sometimes', 'nullable', 'string', function ($attribute, $value, $fail) {
                    if (! $this->validDate($value)) {
                        $fail('Use a real ISO 8601 datetime with UTC offset, or a UTC calendar date.');
                    }
                }],
                'author' => ['sometimes', 'required', Rule::in(['Hiru Academy'])],
            ],
            'certificate-templates' => [
                'program' => $string,
                'title' => $string,
                'description' => $text,
                'image' => [...$optional, $media],
                'sort_order' => $order,
                'status' => ['sometimes', 'required', Rule::in(['draft', 'published'])],
            ],
        };
        $unknown = array_diff(array_keys($input), array_keys($rules));
        if ($unknown !== []) {
            throw ValidationException::withMessages(array_fill_keys($unknown, 'Field is prohibited.'));
        }
        $data = Validator::make($input, $rules)->validate();
        $model->fill($data);
        if ($model instanceof ShowcaseItem) {
            $label = self::SHOWCASE_LABELS[$model->key];
            if (isset($data['label']) && $data['label'] !== $label) {
                throw ValidationException::withMessages(['label' => 'Label is locked to showcase key.']);
            }
            $model->label = $label;
        }
        if ($model instanceof Testimonial && (filled($model->video_url) !== filled($model->video_title))) {
            throw ValidationException::withMessages(['video_title' => 'Video URL and title must be provided or cleared together.']);
        }
        if ($model instanceof BlogArticle && isset($data['published_at'])) {
            $model->published_at = CarbonImmutable::parse($data['published_at'], 'UTC')->utc();
        }
        $model->save();

        return $model->fresh();
    }

    public function ordered(string $resource): Builder
    {
        $class = $this->model($resource);
        $query = $class::query();

        return $resource === 'blog-articles'
            ? $query->orderByRaw('published_at DESC NULLS LAST')->orderByDesc('id')
            : $query->orderBy('sort_order')->orderBy('id');
    }

    public function articles(): Builder
    {
        return $this->ordered('blog-articles')->where('published', true)
            ->where(fn ($query) => $query->whereNull('published_at')->orWhere('published_at', '<=', CarbonImmutable::now('UTC')->toISOString()));
    }

    public function payload(Model $model, bool $public = false): array
    {
        $fields = match (true) {
            $model instanceof ShowcaseItem => ['key', 'label', 'image_src', 'alt'],
            $model instanceof SenseiProfile => ['name', 'role', 'bio', 'photo', 'expertise', 'level'],
            $model instanceof Testimonial => ['name', 'context', 'quote', 'image', 'video_url', 'video_title'],
            $model instanceof BlogArticle => ['title', 'slug', 'excerpt', 'body', 'thumbnail', 'category', 'seo_title', 'meta_description', 'featured', 'published_at', 'author'],
            $model instanceof CertificateTemplate => ['program', 'title', 'description', 'image'],
        };
        if (! $public) {
            $fields = $model->getFillable();
        }
        $data = ['id' => $model->id];
        foreach ($fields as $field) {
            $value = $model->getAttribute($field);
            $data[$field] = $value instanceof \DateTimeInterface ? CarbonImmutable::instance($value)->utc()->toISOString() : $value;
        }

        return $data;
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

        return ! preg_match('~(?:^|/)(?:\.{1,2})(?:/|$)~', $parts['path'] ?? '')
            && (isset($parts['scheme']) || ($parts['path'] ?? '') !== '');
    }

    private function validDate(string $value): bool
    {
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/D', $value)) {
            $format = '!Y-m-d';
        } elseif (preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-3]):[0-5]\d|[+-]14:00)$/D', $value)) {
            $format = str_contains($value, '.') ? '!Y-m-d\TH:i:s.uP' : '!Y-m-d\TH:i:sP';
        } else {
            return false;
        }
        $date = DateTimeImmutable::createFromFormat($format, $value);
        $errors = DateTimeImmutable::getLastErrors();

        return $date !== false && ($errors === false || ($errors['warning_count'] === 0 && $errors['error_count'] === 0));
    }
}
