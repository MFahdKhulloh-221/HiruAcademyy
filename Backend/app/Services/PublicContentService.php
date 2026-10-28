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
        'module' => 'Modul',
        'practice' => 'Latihan',
        'checkpoint' => 'Checkpoint',
        'replay' => 'Jadwal & Replay',
        'community' => 'Komunitas',
    ];

    public function model(string $resource): string
    {
        abort_unless(isset(self::RESOURCES[$resource]), 404);

        return self::RESOURCES[$resource];
    }

    public function save(string $resource, array $input, ?Model $model = null): Model
    {
        return app(MediaService::class)->locked(fn () => $this->saveContent($resource, $input, $model));
    }

    private function saveContent(string $resource, array $input, ?Model $model): Model
    {
        $class = $this->model($resource);
        if (in_array($resource, ['testimonials', 'blog-articles'], true) && $model?->exists) {
            $model = $class::query()->lockForUpdate()->findOrFail($model->getKey());
        }
        $model ??= new $class;
        if ($model instanceof BlogArticle && ! $model->exists && ! array_key_exists('author', $input)) {
            $input['author'] = $model->author;
        }
        if ($resource === 'testimonials' && $model->source !== 'student') {
            if (array_key_exists('video_title', $input)) {
                if (array_key_exists('title', $input) && $input['title'] !== $input['video_title']) {
                    throw ValidationException::withMessages(['title' => 'Title aliases must match.']);
                }
                $input['title'] = $input['video_title'];
            }
            if (! array_key_exists('type', $input) && array_key_exists('video_url', $input)) {
                $input['type'] = filled($input['video_url']) ? 'video' : 'text';
            }
        }
        $required = $model->exists ? 'sometimes' : 'required';
        $text = ['bail', $required, 'required', 'string'];
        $string = [...$text, 'max:255'];
        $optional = ['bail', 'sometimes', 'nullable', 'string'];
        $boolean = ['sometimes', 'required', 'boolean'];
        $order = ['sometimes', 'required', 'integer', 'min:1', 'max:2147483647'];
        $media = app(MediaService::class)->rule('image');
        $rules = match ($resource) {
            'showcase-items' => [
                'key' => [$required, 'required', Rule::in(array_keys(self::SHOWCASE_LABELS)), Rule::unique('showcase_items', 'key')->ignore($model)],
                'label' => [...$string, 'regex:/\S/u'],
                'image_src' => [...$optional, $media],
                'alt' => $text,
                'sort_order' => $order,
                'visible' => $boolean,
            ],
            'sensei-profiles' => [
                'name' => $string,
                'role' => $string,
                'bio' => $text,
                'photo' => [...$optional, $media],
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
                'video_url' => [...$optional, app(MediaService::class)->rule('video')],
                'video_title' => [...$optional, 'max:255'],
                'title' => [...$optional, 'max:255'],
                'type' => ['sometimes', 'required', Rule::in(['text', 'video'])],
                'video_thumbnail' => [...$optional, app(MediaService::class)->rule('video_thumbnail')],
                'archived_at' => ['sometimes', 'nullable', 'date'],
                'show_on_testimonials' => $boolean,
                'published' => $boolean,
                'landing' => $boolean,
                'landing_position' => ['sometimes', 'required', 'integer', 'min:1', 'max:6'],
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
                'category' => [...$string, app(BlogCatalogService::class)->articleRule('category', $model)],
                'seo_title' => [...$optional, 'max:255'],
                'meta_description' => $optional,
                'featured' => $boolean,
                'published' => $boolean,
                'published_at' => ['bail', 'sometimes', 'nullable', 'string', function ($attribute, $value, $fail) {
                    if (! $this->validDate($value)) {
                        $fail('Use a real ISO 8601 datetime with UTC offset, or a UTC calendar date.');
                    }
                }],
                'author' => [...$string, app(BlogCatalogService::class)->articleRule('author', $model)],
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
        if ($model instanceof Testimonial && $model->source === 'student') {
            $rules = [
                'moderation_status' => ['sometimes', 'required', Rule::in(['pending', 'approved', 'rejected'])],
                'moderation_note' => $optional,
                'quote' => ['sometimes', 'required', 'string', 'max:500'],
                'title' => [...$optional, 'max:255'],
                'video_title' => [...$optional, 'max:255'],
                'video_url' => [...$optional, app(MediaService::class)->rule('student_video')],
                'video_thumbnail' => [...$optional, app(MediaService::class)->rule('video_thumbnail')],
                'archived_at' => ['sometimes', 'nullable', 'date'],
                'show_on_testimonials' => $boolean,
                'published' => $boolean,
                'landing' => $boolean,
                'landing_position' => ['sometimes', 'required', 'integer', 'min:1', 'max:6'],
                'sort_order' => $order,
            ];
        }
        $unknown = array_diff(array_keys($input), array_keys($rules));
        if ($unknown !== []) {
            throw ValidationException::withMessages(array_fill_keys($unknown, 'Field is prohibited.'));
        }
        $data = Validator::make($input, $rules)->validate();
        $landingPosition = $data['landing_position'] ?? null;
        unset($data['landing_position']);
        $wasLanding = $model->exists && $model->landing;
        $model->fill($data);
        if ($model instanceof Testimonial) {
            if (! $model->exists) {
                $model->forceFill(['source' => 'admin', 'user_id' => null, 'moderation_status' => 'approved', 'consent_public' => true]);
            }
            if ($model->isDirty('title')) {
                $model->video_title = $model->title;
            }
            if ($model->source === 'student' && $model->moderation_status === 'approved' && $model->first_approved_at === null && array_key_exists('moderation_status', $data)) {
                if (! $model->consent_public) {
                    throw ValidationException::withMessages(['moderation_status' => 'Student approval requires public consent.']);
                }
                $model->first_approved_at = now();
                $model->published = true;
                $model->landing = $data['landing'] ?? false;
                $model->show_on_testimonials = true;
            }
            if ($model->archived_at !== null) {
                $model->published = false;
                $model->landing = false;
                $model->show_on_testimonials = false;
            }
            if ($model->moderation_status !== 'approved') {
                $model->published = false;
            }
            if ($model->source === 'student' && $model->published && ! $model->consent_public) {
                throw ValidationException::withMessages(['published' => 'Student publication requires approval and public consent.']);
            }
            if ($model->source === 'admin' && ! $model->exists && ! array_key_exists('show_on_testimonials', $data)) {
                $model->show_on_testimonials = $model->published;
            }
        }
        if ($model instanceof Testimonial && $model->type === 'video' && (! $model->exists || $model->isDirty(['type', 'video_url', 'title', 'video_thumbnail'])) && (! filled($model->video_url) || ! filled($model->title))) {
            throw ValidationException::withMessages(['video_url' => 'Video testimonials require a video URL and title.']);
        }
        if ($model instanceof Testimonial && $model->type === 'video' && (! $model->exists || $model->isDirty(['type', 'video_url', 'title', 'video_thumbnail'])) && ! filled($model->video_thumbnail)) {
            throw ValidationException::withMessages(['video_thumbnail' => 'New or changed videos require a thumbnail.']);
        }
        if ($model instanceof Testimonial && (filled($model->video_url) !== filled($model->video_title))) {
            throw ValidationException::withMessages(['video_title' => 'Video URL and title must be provided or cleared together.']);
        }
        if ($model instanceof BlogArticle && isset($data['published_at'])) {
            $model->published_at = CarbonImmutable::parse($data['published_at'], 'UTC')->utc();
        }
        if ($model instanceof Testimonial && ! $model->published && ! ($data['landing'] ?? false)) {
            $model->landing = false;
        }
        if ($model instanceof Testimonial && (($model->landing && ($model->isDirty(['landing', 'published', 'consent_public', 'moderation_status', 'archived_at', 'type', 'video_url', 'video_thumbnail', 'title']) || array_key_exists('landing', $data))) || $landingPosition !== null)) {
            if (! $model->published || ! $model->consent_public || $model->moderation_status !== 'approved' || $model->archived_at !== null || ! $model->landing) {
                throw ValidationException::withMessages(['landing' => 'Landing requires an active, approved testimonial with valid public consent.']);
            }
            if ($model->type !== 'text' || filled($model->video_url)) {
                throw ValidationException::withMessages(['landing' => 'Landing hanya untuk testimoni teks. Video tersedia di halaman /testimoni.']);
            }
            $selected = Testimonial::query()->where('type', 'text')->whereNull('video_url')->where('landing', true)->where('published', true)->where('consent_public', true)
                ->where('moderation_status', 'approved')->whereNull('archived_at')
                ->when($model->exists, fn ($query) => $query->whereKeyNot($model->id))
                ->orderBy('sort_order')->orderBy('id')->get();
            if ($selected->count() >= 6) {
                throw ValidationException::withMessages(['landing' => 'Maksimal 6 testimoni Landing. Hapus salah satu pilihan terlebih dahulu.']);
            }
            if ($landingPosition !== null || ! $wasLanding) {
                $position = min($landingPosition ?? ($selected->count() + 1), $selected->count() + 1);
                $selected->splice($position - 1, 0, [$model]);
                foreach ($selected as $index => $item) {
                    $item->sort_order = $index + 1;
                    if ($item !== $model) $item->save();
                }
            }
        }
        $model->save();

        return $model->fresh();
    }

    public function ordered(string $resource): Builder
    {
        $class = $this->model($resource);
        $query = $class::query();
        if ($resource === 'testimonials') {
            $query->with('user:id,name,avatar');
        }

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
            $model instanceof Testimonial => ['name', 'context', 'quote', 'image', 'type', 'title', 'video_url', 'video_title', 'video_thumbnail', 'landing', 'show_on_testimonials'],
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

        if ($model instanceof Testimonial) {
            $data['created_at'] = $model->created_at?->utc()->toISOString();
            if (! $public) {
                foreach (['source', 'user_id', 'consent_public'] as $field) {
                    $data[$field] = $model->getAttribute($field);
                }
            }
            if ($model->source === 'student') {
                $model->loadMissing('user:id,name,avatar');
                $data['name'] = $model->user?->name ?? $model->name;
                $data['image'] = $model->user?->avatar;
                $data['video_title'] = $model->title;
                try {
                    $data['image_resolved_url'] = app(MediaService::class)->url($data['image']);
                } catch (\Throwable $exception) {
                    report($exception);
                    $data['image_resolved_url'] = null;
                }
                foreach (['video_url', 'video_thumbnail'] as $field) {
                    $data[$field.'_resolved_url'] = filled($data[$field]) ? app(MediaService::class)->url($data[$field]) : null;
                }

                return $data;
            }
        }

        return app(MediaService::class)->payload($data);
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
