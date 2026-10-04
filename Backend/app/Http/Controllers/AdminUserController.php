<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminUserController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate(['search' => ['nullable', 'string', 'max:255']]);
        $query = User::where('role', 'student');
        if ($search = $data['search'] ?? null) {
            $query->where(function ($query) use ($search) {
                $query->where('name', 'ilike', '%'.$search.'%')->orWhere('email', 'ilike', '%'.$search.'%')->orWhere('whatsapp', 'ilike', '%'.$search.'%');
            });
        }

        return response()->json(['data' => $query->orderBy('id')->get(['id', 'name', 'email', 'whatsapp', 'account_status', 'target_jlpt'])]);
    }
}
