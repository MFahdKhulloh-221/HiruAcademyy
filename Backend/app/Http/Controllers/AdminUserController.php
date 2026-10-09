<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\EntitlementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminUserController extends Controller
{
    public function index(Request $request, EntitlementService $entitlements): JsonResponse
    {
        $data = $request->validate(['search' => ['nullable', 'string', 'max:255'], 'include' => ['sometimes', 'string', 'in:effective_access']]);
        $query = User::where('role', 'student');
        if ($search = $data['search'] ?? null) {
            $query->where(function ($query) use ($search) {
                $query->where('name', 'ilike', '%'.$search.'%')->orWhere('email', 'ilike', '%'.$search.'%')->orWhere('whatsapp', 'ilike', '%'.$search.'%');
            });
        }

        $fields = ['id', 'name', 'email', 'whatsapp', 'account_status', 'target_jlpt'];
        $users = $query->orderBy('id')->get([...$fields, 'role']);
        if (($data['include'] ?? null) === 'effective_access') {
            $grants = $entitlements->qualifyingGrants()->whereIn('user_id', $users->modelKeys())->get()->groupBy('user_id');
            foreach ($users as $user) {
                $user->setAttribute('effective_access', $entitlements->project($user, $grants->get($user->id, collect())));
            }
        }

        return response()->json(['data' => $users->map(fn ($user) => $user->only(isset($data['include']) ? [...$fields, 'effective_access'] : $fields))]);
    }
}
