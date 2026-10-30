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

        return response()->json(['data' => $this->mediaPayload($this->hero->snapshot())]);
    }

    public function draft(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json(['data' => $this->mediaPayload($this->hero->saveDraft($request->all()))]);
    }

    public function publish(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json(['data' => $this->mediaPayload($this->hero->publish($request->all()))]);
    }

    public function publicShow(): JsonResponse
    {
        return response()->json(['data' => $this->mediaPayload($this->hero->published())])->header('Cache-Control', 'no-store');
    }

    private function mediaPayload(?array $value): ?array
    {
        if ($value === null) return null;
        foreach ($value as $key => $item) {
            if (is_array($item)) $value[$key] = $this->mediaPayload($item);
            elseif (in_array($key, ['desktopSrc', 'mobileSrc'], true) && is_string($item) && str_starts_with($item, 'media/')) {
                $value[$key.'_resolved_url'] = app(\App\Services\MediaService::class)->url($item);
            }
        }
        return $value;
    }

    private function authorizeAdmin(Request $request): void
    {
        if ($request->user()?->role !== 'admin') {
            throw new AccessDeniedHttpException;
        }
    }
}
