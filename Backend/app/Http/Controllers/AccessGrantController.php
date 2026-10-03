<?php

namespace App\Http\Controllers;

use App\Models\AccessGrant;
use App\Models\ProgramOffer;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AccessGrantController extends Controller
{
    public function index(User $user): JsonResponse
    {
        $this->requireStudent($user);

        return response()->json(['data' => AccessGrant::where('user_id', $user->id)->orderBy('id')->get()]);
    }

    public function store(Request $request, User $user): JsonResponse
    {
        return $this->save($request, new AccessGrant(['user_id' => $user->id]));
    }

    public function update(Request $request, AccessGrant $grant): JsonResponse
    {
        return $this->save($request, $grant);
    }

    public function destroy(AccessGrant $grant): JsonResponse
    {
        $grant->update(['status' => 'inactive']);

        return response()->json(null, 204);
    }

    private function requireStudent(User $user): void
    {
        if ($user->role !== 'student') {
            throw ValidationException::withMessages(['user_id' => 'Access grants require a student account.']);
        }
    }

    private function save(Request $request, AccessGrant $grant): JsonResponse
    {
        $creating = ! $grant->exists;
        $required = $creating ? 'required' : 'sometimes';
        $data = $request->validate([
            'user_id' => ['prohibited'],
            'program_id' => [$required, 'required', 'integer', 'exists:programs,id'],
            'plan_code' => [$required, 'required', Rule::in(['lms', 'sensei'])],
            'starts_at' => [$required, 'required', 'date_format:Y-m-d'],
            'ends_at' => [$required, 'required', 'date_format:Y-m-d'],
            'status' => [$required, 'required', Rule::in(['active', 'inactive'])],
        ]);

        DB::transaction(function () use ($grant, $data, $creating) {
            if (! $creating) {
                $grant->setRawAttributes(AccessGrant::whereKey($grant->id)->lockForUpdate()->firstOrFail()->getAttributes(), true);
            }
            $this->requireStudent(User::whereKey($grant->user_id)->lockForUpdate()->firstOrFail());
            $grant->fill($data);
            if ($grant->ends_at->lt($grant->starts_at)) {
                throw ValidationException::withMessages(['ends_at' => 'End date must not precede start date.']);
            }
            if (! ProgramOffer::where('program_id', $grant->program_id)->where('plan_code', $grant->plan_code)->exists()) {
                throw ValidationException::withMessages(['plan_code' => 'Program and plan combination is unsupported.']);
            }
            $grant->save();
        });

        return response()->json(['data' => $grant->fresh()], $creating ? 201 : 200);
    }
}
