<?php

namespace App\Services;

use App\Models\BlogArticle;
use App\Models\BlogCategory;
use App\Models\BlogContributor;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class BlogCatalogService
{
    public const RESOURCES = [
        'blog-categories' => BlogCategory::class,
        'blog-contributors' => BlogContributor::class,
    ];

    public function model(string $resource): string
    {
        abort_unless(isset(self::RESOURCES[$resource]), 404);

        return self::RESOURCES[$resource];
    }

    public function payload(Model $model): array
    {
        return ['id' => $model->id, 'name' => $model->name, 'active' => $model->active];
    }

    public function save(string $resource, array $input, ?string $id = null): Model
    {
        $class = $this->model($resource);
        try {
            return app(MediaService::class)->locked(function () use ($class, $input, $id) {
                $model = $id === null ? new $class : $class::query()->lockForUpdate()->findOrFail($id);
                $unknown = array_diff(array_keys($input), ['name', 'active']);
                if ($unknown !== []) {
                    throw ValidationException::withMessages(array_fill_keys($unknown, 'Field is prohibited.'));
                }
                if (isset($input['name']) && is_string($input['name'])) {
                    if (strip_tags($input['name']) !== $input['name'] || preg_match('/[\x00-\x1F\x7F]/u', $input['name'])) {
                        throw ValidationException::withMessages(['name' => 'Name must be plain text without control characters.']);
                    }
                    $input['name'] = trim($input['name']);
                }
                $data = Validator::make($input, [
                    'name' => ['bail', $model->exists ? 'sometimes' : 'required', 'required', 'string', 'max:255', 'regex:/\S/u'],
                    'active' => ['sometimes', 'required', 'boolean'],
                ])->validate();
                if (isset($data['name']) && $class::query()->whereRaw('lower(trim(name)) = lower(trim(?))', [$data['name']])
                    ->when($model->exists, fn ($query) => $query->whereKeyNot($model->id))->exists()) {
                    throw ValidationException::withMessages(['name' => 'Name already exists.']);
                }
                $model->fill($data)->save();

                return $model->fresh();
            });
        } catch (QueryException $error) {
            if (($error->errorInfo[0] ?? $error->getCode()) === '23505') {
                throw ValidationException::withMessages(['name' => 'Name already exists.']);
            }
            throw $error;
        }
    }

    public function delete(string $resource, string $id): void
    {
        $class = $this->model($resource);
        try {
            app(MediaService::class)->locked(function () use ($class, $id, $resource) {
                $model = $class::query()->lockForUpdate()->findOrFail($id);
                $column = $resource === 'blog-categories' ? 'category' : 'author';
                abort_if(BlogArticle::query()->where($column, $model->name)->exists(), 409, 'Catalog entry is in use. Deactivate it instead.');
                $model->delete();
            });
        } catch (QueryException $error) {
            if (($error->errorInfo[0] ?? $error->getCode()) === '23503') {
                abort(409, 'Catalog entry is in use. Deactivate it instead.');
            }
            throw $error;
        }
    }

    public function articleRule(string $column, ?Model $article): \Closure
    {
        return function ($attribute, $value, $fail) use ($column, $article) {
            $class = $column === 'category' ? BlogCategory::class : BlogContributor::class;
            $entry = $class::query()->where('name', $value)->lockForUpdate()->first();
            if (! $entry || (! $entry->active && (! $article?->exists || $article->getAttribute($column) !== $value))) {
                $fail('Choose an active catalog entry.');
            }
        };
    }
}
