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
    public function publicIndex(Request $request): JsonResponse
    {
        $data = $request->validate(['catalog' => ['sometimes', 'required', Rule::in(['programs'])]]);

        return response()->json(['data' => LearningProgramResource::collection(Program::query()
            ->where('status', 'active')
            ->when(($data['catalog'] ?? null) === 'programs', fn ($query) => $query->where('show_on_programs', true))
            ->orderBy('sort_order')->orderBy('id')->get())]);
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
            'show_on_programs' => ['sometimes', 'required', 'boolean'],
            'sort_order' => ['required', 'integer', 'min:0', 'max:32767'],
            'plan_code' => ['required', Rule::in(['lms', 'sensei'])],
            'duration_months' => ['required', 'integer', 'min:1', 'max:32767'],
            'base_price' => ['required', 'integer', 'min:0', 'max:2147483647'],
        ]);
        $program = $this->locked(function () use ($data) {
            $ids = Program::query()->orderBy('sort_order')->orderBy('id')->pluck('id')->all();
            $this->validatePosition((int) $data['sort_order'], count($ids));
            $program = Program::create([
                'name' => $data['name'], 'slug' => $data['slug'], 'code' => $data['slug'],
                'description' => $data['description'] ?? null, 'sort_order' => $data['sort_order'],
                'family' => 'interview', 'status' => 'draft',
                'show_on_programs' => $data['show_on_programs'] ?? true,
            ]);
            ProgramOffer::create([
                'program_id' => $program->id, 'plan_code' => $data['plan_code'],
                'duration_months' => $data['duration_months'], 'base_price' => $data['base_price'],
                'currency' => 'IDR', 'status' => 'inactive',
            ]);

            array_splice($ids, (int) $data['sort_order'], 0, [$program->id]);
            $this->normalizeOrder($ids);

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
            'show_on_programs' => ['sometimes', 'required', 'boolean'],
            'sort_order' => ['sometimes', 'required', 'integer', 'min:0', 'max:32767'],
        ]);
        $program = $this->locked(function () use ($data, $program) {
            $program = Program::query()->findOrFail($program->id);
            if (array_key_exists('sort_order', $data)) {
                $ids = Program::query()->orderBy('sort_order')->orderBy('id')->pluck('id')->all();
                $this->validatePosition((int) $data['sort_order'], count($ids) - 1);
                $ids = array_values(array_diff($ids, [$program->id]));
                array_splice($ids, (int) $data['sort_order'], 0, [$program->id]);
                $this->normalizeOrder($ids);
            }
            $program->update($data);

            return $program->refresh();
        });

        return response()->json(['data' => $program]);
    }

    public function destroy(Program $program): JsonResponse
    {
        try {
            $this->locked(function () use ($program) {
                // Restrictive foreign keys reject deletion of any referenced program, including races.
                $program = Program::query()->findOrFail($program->id);
                if ($program->delete()) {
                    $this->normalizeOrder(Program::query()->orderBy('sort_order')->orderBy('id')->pluck('id')->all());
                }
            });
        } catch (QueryException $error) {
            if (in_array((string) $error->getCode(), ['23503', '23000'], true)) {
                throw ValidationException::withMessages(['program' => 'Program memiliki relasi atau histori. Gunakan Nonaktifkan.']);
            }
            throw $error;
        }

        return response()->json(['data' => null]);
    }

    private function locked(callable $operation): mixed
    {
        return DB::transaction(function () use ($operation) {
            // Global lock also serializes inserts when no program exists yet.
            DB::select('SELECT pg_advisory_xact_lock(hashtext(?))', ['program-sort-order']);

            return $operation();
        });
    }

    private function validatePosition(int $position, int $maximum): void
    {
        if ($position < 0 || $position > $maximum) {
            throw ValidationException::withMessages(['sort_order' => "Posisi harus antara 0 dan {$maximum}."]);
        }
    }

    private function normalizeOrder(array $ids): void
    {
        foreach ($ids as $position => $id) {
            Program::query()->whereKey($id)->where('sort_order', '!=', $position)->update(['sort_order' => $position]);
        }
    }
}
