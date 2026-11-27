<?php

namespace App\Http\Controllers;

use App\Services\LearningContentService;
use App\Services\MediaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminLearningController extends Controller
{
    public function __construct(private LearningContentService $content) {}

    public function index(Request $request): JsonResponse
    {
        $class = $this->content->model($this->resource($request));

        return response()->json(['data' => app(MediaService::class)->payload($class::query()->orderBy('sort_order')->orderBy('id')->get()->toArray())]);
    }

    public function store(Request $request): JsonResponse
    {
        return response()->json(['data' => app(MediaService::class)->payload($this->content->save($this->resource($request), $request->all())->toArray())], 201);
    }

    public function miniBatch(Request $request): JsonResponse
    {
        return response()->json(['data' => app(MediaService::class)->payload($this->content->saveMiniBatch($request->all()))]);
    }

    public function show(Request $request): JsonResponse
    {
        $class = $this->content->model($this->resource($request));

        $model = $class::query()->whereKey($this->id($request))->firstOrFail();
        $data = $model->toArray();
        if ($this->resource($request) === 'chapters') {
            $data['mini_checkpoint_readiness_errors'] = $this->content->miniReadiness($model);
        }

        return response()->json(['data' => app(MediaService::class)->payload($data)]);
    }

    public function update(Request $request): JsonResponse
    {
        $resource = $this->resource($request);
        $class = $this->content->model($resource);
        $model = $class::query()->whereKey($this->id($request))->firstOrFail();

        return response()->json(['data' => app(MediaService::class)->payload($this->content->save($resource, $request->all(), $model)->toArray())]);
    }

    public function destroy(Request $request): JsonResponse
    {
        $data = $request->validate(['force' => ['sometimes', 'boolean'], 'confirmed' => ['exclude_unless:force,true', 'required', 'accepted']]);
        $this->content->delete($this->resource($request), $this->id($request), (bool) ($data['force'] ?? false));

        return response()->json(null, 204);
    }

    private function resource(Request $request): string
    {
        $resource = $request->route('resource');
        abort_unless(is_string($resource), 404);

        return $resource;
    }

    private function id(Request $request): string|int
    {
        $id = $request->route('content');
        abort_unless((is_string($id) || is_int($id)) && preg_match('/^[1-9][0-9]*$/D', (string) $id)
            && (strlen((string) $id) < 19 || (strlen((string) $id) === 19 && strcmp((string) $id, '9223372036854775807') <= 0)), 404);

        return $id;
    }
}
