<?php

namespace App\Http\Controllers;

use App\Http\Resources\LearningProgramResource;
use App\Models\Program;
use App\Models\ProgramOffer;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ProgramController extends Controller
{
    public function publicIndex(): JsonResponse
    {
        return response()->json(['data' => LearningProgramResource::collection(Program::query()
            ->where('status', 'active')->orderBy('sort_order')->orderBy('id')->get())]);
    }

    public function adminIndex(): JsonResponse
    {
        return response()->json(['data' => Program::query()->orderBy('sort_order')->orderBy('id')->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255', 'regex:/\S/u', Rule::unique('programs', 'name')],
            'slug' => ['required', 'string', 'max:255', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/', Rule::unique('programs', 'slug'), Rule::unique('programs', 'code')],
            'description' => ['nullable', 'string', 'max:10000'],
            'sort_order' => ['required', 'integer', 'min:0', 'max:32767'],
            'plan_code' => ['required', Rule::in(['lms', 'sensei'])],
            'duration_months' => ['required', 'integer', 'min:1', 'max:32767'],
            'base_price' => ['required', 'integer', 'min:0', 'max:2147483647'],
        ]);
        $program = DB::transaction(function () use ($data) {
            $program = Program::create([
                'name' => $data['name'], 'slug' => $data['slug'], 'code' => $data['slug'],
                'description' => $data['description'] ?? null, 'sort_order' => $data['sort_order'],
                'family' => 'interview', 'status' => 'draft',
            ]);
            ProgramOffer::create([
                'program_id' => $program->id, 'plan_code' => $data['plan_code'],
                'duration_months' => $data['duration_months'], 'base_price' => $data['base_price'],
                'currency' => 'IDR', 'status' => 'inactive',
            ]);

            return $program;
        });

        return response()->json(['data' => $program], 201);
    }

    public function update(Request $request, Program $program): JsonResponse
    {
        // Identity and activity family stay immutable to preserve existing URLs and chapters.
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255', 'regex:/\S/u', Rule::unique('programs', 'name')->ignore($program)],
            'description' => ['sometimes', 'nullable', 'string', 'max:10000'],
            'status' => ['sometimes', 'required', Rule::in(['draft', 'active', 'inactive'])],
            'sort_order' => ['sometimes', 'required', 'integer', 'min:0', 'max:32767'],
        ]);
        $program->update($data);

        return response()->json(['data' => $program]);
    }

    public function destroy(Program $program): JsonResponse
    {
        try {
            // Restrictive foreign keys reject deletion of any referenced program, including races.
            $program->delete();
        } catch (QueryException $error) {
            if (in_array((string) $error->getCode(), ['23503', '23000'], true)) {
                throw ValidationException::withMessages(['program' => 'Program memiliki relasi atau histori. Gunakan Nonaktifkan.']);
            }
            throw $error;
        }

        return response()->json(['data' => null]);
    }
}
