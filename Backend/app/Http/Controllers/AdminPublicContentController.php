<?php

namespace App\Http\Controllers;

use App\Services\PublicContentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminPublicContentController extends Controller
{
    public function __construct(private PublicContentService $content) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->content->ordered($request->route('resource'))->get()
            ->map(fn ($model) => $this->content->payload($model))]);
    }

    public function store(Request $request): JsonResponse
    {
        $model = $this->content->save($request->route('resource'), $request->all());

        return response()->json(['data' => $this->content->payload($model)], 201);
    }

    public function show(Request $request): JsonResponse
    {
        $class = $this->content->model($request->route('resource'));

        return response()->json(['data' => $this->content->payload($class::findOrFail($this->id($request)))]);
    }

    public function update(Request $request): JsonResponse
    {
        $resource = $request->route('resource');
        $class = $this->content->model($resource);
        $model = $this->content->save($resource, $request->all(), $class::findOrFail($this->id($request)));

        return response()->json(['data' => $this->content->payload($model)]);
    }

    public function destroy(Request $request): JsonResponse
    {
        $class = $this->content->model($request->route('resource'));
        $class::findOrFail($this->id($request))->delete();

        return response()->json(null, 204);
    }

    private function id(Request $request): string
    {
        $id = (string) $request->route('content');
        abort_unless(preg_match('/^[1-9][0-9]*$/D', $id)
            && (strlen($id) < 19 || (strlen($id) === 19 && strcmp($id, '9223372036854775807') <= 0)), 404);

        return $id;
    }
}
