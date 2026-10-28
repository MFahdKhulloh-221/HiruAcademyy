<?php

namespace App\Http\Controllers;

use App\Models\PlacementAttempt;
use App\Models\PlacementConfig;
use App\Services\MediaService;
use App\Services\PlacementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PublicPlacementController extends Controller
{
    public function __construct(private PlacementService $placement) {}

    public function index(): JsonResponse
    {
        return response()->json(['data' => $this->placement->publicPayload($this->placement->published())]);
    }

    public function current(Request $request): JsonResponse
    {
        $attempt = $this->placement->current($request);

        return response()->json(['data' => $attempt ? app(MediaService::class)->payload($this->placement->attemptPayload($attempt)) : null]);
    }

    public function start(Request $request): JsonResponse
    {
        return response()->json(['data' => app(MediaService::class)->payload($this->placement->attemptPayload($this->placement->start($request)))], 201);
    }

    public function preview(Request $request, PlacementConfig $config): JsonResponse
    {
        return response()->json(['data' => app(MediaService::class)->payload($this->placement->attemptPayload($this->placement->preview($request, $config)))], 201);
    }

    public function show(Request $request): JsonResponse
    {
        $attempt = $this->placement->refreshAttempt($request, $this->attempt($request));

        return response()->json(['data' => app(MediaService::class)->payload($this->placement->attemptPayload($attempt))]);
    }

    public function save(Request $request): JsonResponse
    {
        return response()->json(['data' => app(MediaService::class)->payload($this->placement->attemptPayload($this->placement->saveAnswers($request, $this->attempt($request))))]);
    }

    public function submit(Request $request): JsonResponse
    {
        return response()->json(['data' => app(MediaService::class)->payload($this->placement->attemptPayload($this->placement->submit($request, $this->attempt($request))))]);
    }

    private function attempt(Request $request): PlacementAttempt
    {
        $value = $request->route('attempt');
        $id = (string) ($value instanceof PlacementAttempt ? $value->id : $value);
        abort_unless(preg_match('/^[1-9][0-9]*$/D', $id) && (strlen($id) < 19 || (strlen($id) === 19 && strcmp($id, '9223372036854775807') <= 0)), 404);

        return PlacementAttempt::findOrFail($id);
    }
}
