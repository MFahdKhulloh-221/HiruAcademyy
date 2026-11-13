<?php

namespace App\Http\Controllers;

use App\Models\Program;
use App\Models\ProgramAchievementSetting;
use App\Services\ProgramAchievementSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class AdminProgramAchievementController extends Controller
{
    public function __construct(private ProgramAchievementSettings $settings) {}

    public function index(Request $request): JsonResponse
    {
        $input = $request->validate([
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);
        $page = Program::query()->orderBy('id')->paginate($input['per_page'] ?? 20);

        return response()->json([
            'data' => $page->getCollection()->map(fn (Program $program) => $this->configuration($program)),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(),
                'total' => $page->total(), 'per_page' => $page->perPage()],
        ])->header('Cache-Control', 'private, no-store');
    }

    public function update(Request $request, string $program): JsonResponse
    {
        $program = $this->program($program);
        $unknown = array_diff(array_keys($request->all()), ['automatic_enabled', 'title', 'description']);
        if ($unknown !== []) {
            throw ValidationException::withMessages(array_fill_keys($unknown, 'Unsupported achievement setting.'));
        }
        $input = $request->validate([
            'automatic_enabled' => ['sometimes', 'required', 'boolean'],
            'title' => ['sometimes', 'required', 'string', 'not_regex:/[<>]/u'],
            'description' => ['sometimes', 'nullable', 'string', 'not_regex:/[<>]/u'],
        ]);
        // Settings service resolves defaults only; keep writes scoped to validated editable fields.
        ProgramAchievementSetting::query()->updateOrCreate(['program_id' => $program->id], $input);

        return response()->json(['data' => $this->configuration($program)])->header('Cache-Control', 'private, no-store');
    }

    public function preview(string $program): JsonResponse
    {
        return response()->json(['data' => $this->configuration($this->program($program))])->header('Cache-Control', 'private, no-store');
    }

    private function program(string $id): Program
    {
        abort_unless(filter_var($id, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) !== false, 404);

        return Program::query()->findOrFail($id);
    }

    private function configuration(Program $program): array
    {
        $settings = $this->settings->resolve($program);
        $settings['title'] = is_string($settings['title']) ? trim(strip_tags($settings['title'])) : null;
        $settings['description'] = is_string($settings['description']) ? trim(strip_tags($settings['description'])) : null;
        $settings['background_image'] = null;

        return [
            'program' => $program->only(['id', 'code', 'name']),
            'settings' => $settings,
            'is_default' => ! ProgramAchievementSetting::query()->where('program_id', $program->id)->exists(),
        ];
    }
}
