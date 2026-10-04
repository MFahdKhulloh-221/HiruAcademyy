<?php

namespace App\Http\Controllers;

use App\Models\PlacementAttempt;
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

    public function start(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->placement->attemptPayload($this->placement->start($request))], 201);
    }

    public function show(Request $request): JsonResponse
    {
        $attempt = $this->attempt($request);
        $this->placement->authorize($request, $attempt);

        return response()->json(['data' => $this->placement->attemptPayload($attempt)]);
    }

    public function save(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->placement->attemptPayload($this->placement->saveAnswers($request, $this->attempt($request)))]);
    }

    public function submit(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->placement->attemptPayload($this->placement->submit($request, $this->attempt($request)))]);
    }

    private function attempt(Request $request): PlacementAttempt
    {
        $value = $request->route('attempt');
        $id = (string) ($value instanceof PlacementAttempt ? $value->id : $value);
        abort_unless(preg_match('/^[1-9][0-9]*$/D', $id) && (strlen($id) < 19 || (strlen($id) === 19 && strcmp($id, '9223372036854775807') <= 0)), 404);

        return PlacementAttempt::findOrFail($id);
    }
}
