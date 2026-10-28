<?php

namespace App\Http\Controllers;

use App\Services\BlogCatalogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminBlogCatalogController extends Controller
{
    public function __construct(private BlogCatalogService $catalog) {}

    public function index(Request $request): JsonResponse
    {
        $class = $this->catalog->model($request->route('resource'));

        return response()->json(['data' => $class::query()->orderBy('name')->orderBy('id')->get()
            ->map(fn ($model) => $this->catalog->payload($model))]);
    }

    public function store(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->catalog->payload($this->catalog->save($request->route('resource'), $request->all()))], 201);
    }

    public function update(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->catalog->payload($this->catalog->save($request->route('resource'), $request->all(), $this->id($request)))]);
    }

    public function destroy(Request $request): JsonResponse
    {
        $this->catalog->delete($request->route('resource'), $this->id($request));

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
