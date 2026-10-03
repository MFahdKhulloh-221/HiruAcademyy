<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\EntitlementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EffectiveAccessController extends Controller
{
    public function student(Request $request, EntitlementService $entitlements): JsonResponse
    {
        return response()->json(['data' => $entitlements->effectiveAccess($request->user())]);
    }

    public function admin(User $user, EntitlementService $entitlements): JsonResponse
    {
        return response()->json(['data' => $entitlements->effectiveAccess($user)]);
    }
}
