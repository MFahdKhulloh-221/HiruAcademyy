<?php

namespace App\Http\Controllers;

use App\Services\Ga4ReportingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Throwable;

class AdminAnalyticsController extends Controller
{
    public function realtime(Ga4ReportingService $analytics): JsonResponse
    {
        try {
            return response()->json(['data' => $analytics->realtime()])->header('Cache-Control', 'no-store');
        } catch (Throwable) {
            return response()->json([
                'code' => 'analytics_unavailable',
                'message' => 'Analytics unavailable. Please try again later.',
            ], 503)->header('Cache-Control', 'no-store');
        }
    }

    public function show(Request $request, Ga4ReportingService $analytics): JsonResponse
    {
        $validated = $request->validate(['period' => ['sometimes', 'required', Rule::in(['7d', '30d'])]]);
        try {
            return response()->json(['data' => $analytics->summary($validated['period'] ?? '7d')])
                ->header('Cache-Control', 'no-store');
        } catch (Throwable) {
            // Never expose/log provider responses, JWT assertions, or credential contents.
            return response()->json([
                'code' => 'analytics_unavailable',
                'message' => 'Analytics unavailable. Please try again later.',
            ], 503)->header('Cache-Control', 'no-store');
        }
    }
}
