<?php

namespace App\Http\Controllers;

use App\Services\AffiliateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StudentAffiliateController extends Controller
{
    public function show(Request $request, AffiliateService $affiliates): JsonResponse
    {
        abort_unless($request->user(), 401);
        abort_unless($request->user()->account_status === 'active', 401);
        abort_unless($request->user()->role === 'student', 403);

        return response()->json(['data' => $affiliates->student($request->user())], 200);
    }
}
