<?php

namespace App\Http\Controllers;

use App\Services\GamificationService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class StudentGamificationController extends Controller
{
    public function show(Request $request, GamificationService $service)
    {
        return response()->json(['data' => $service->summary($request->user())]);
    }

    public function leaderboard(Request $request, GamificationService $service)
    {
        $input = $request->validate(['scope' => ['sometimes', 'required', Rule::in(['all', 'lms', 'sensei'])]]);

        return response()->json(['data' => $service->leaderboard($request->user(), $input['scope'] ?? 'all')]);
    }
}
