<?php

namespace App\Http\Controllers;

use App\Services\PlacementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminPlacementController extends Controller
{
    public function __construct(private PlacementService $placement) {}

    private function authorize(Request $request): void
    {
        abort_unless($request->user(), 401);
        abort_unless($request->user()->account_status === 'active', 401);
        abort_unless($request->user()->role === 'admin', 403);
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorize($request);

        return response()->json(['data' => $this->placement->ordered($request->route('resource'))->get()->map(fn ($model) => $this->placement->adminPayload($model))]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize($request);
        $model = $this->placement->save($request->route('resource'), $request->all());

        return response()->json(['data' => $this->placement->adminPayload($model)], 201);
    }

    public function show(Request $request): JsonResponse
    {
        $this->authorize($request);
        $class = $this->placement->model($request->route('resource'));

        return response()->json(['data' => $this->placement->adminPayload($class::findOrFail($this->id($request)))]);
    }

    public function update(Request $request): JsonResponse
    {
        $this->authorize($request);
        $resource = $request->route('resource');
        $class = $this->placement->model($resource);
        $model = $this->placement->save($resource, $request->all(), $class::findOrFail($this->id($request)));

        return response()->json(['data' => $this->placement->adminPayload($model)]);
    }

    public function destroy(Request $request): JsonResponse
    {
        $this->authorize($request);
        $class = $this->placement->model($request->route('resource'));
        $this->placement->delete($class::findOrFail($this->id($request)));

        return response()->json(null, 204);
    }

    private function id(Request $request): string
    {
        $id = (string) $request->route('content');
        abort_unless(preg_match('/^[1-9][0-9]*$/D', $id) && (strlen($id) < 19 || (strlen($id) === 19 && strcmp($id, '9223372036854775807') <= 0)), 404);

        return $id;
    }
}
