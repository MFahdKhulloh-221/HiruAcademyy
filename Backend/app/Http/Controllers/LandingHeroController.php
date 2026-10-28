<?php

namespace App\Http\Controllers;

use App\Services\LandingHeroService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

class LandingHeroController extends Controller
{
    public function __construct(private LandingHeroService $hero) {}

    public function show(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json(['data' => $this->hero->snapshot()]);
    }

    public function draft(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json(['data' => $this->hero->saveDraft($request->all())]);
    }

    public function publish(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json(['data' => $this->hero->publish($request->all())]);
    }

    public function publicShow(): JsonResponse
    {
        return response()->json(['data' => $this->hero->published()])->header('Cache-Control', 'no-store');
    }

    private function authorizeAdmin(Request $request): void
    {
        if ($request->user()?->role !== 'admin') {
            throw new AccessDeniedHttpException;
        }
    }
}
