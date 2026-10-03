<?php

namespace App\Http\Controllers;

use App\Models\Chapter;
use App\Models\LearningAttempt;
use App\Models\Program;
use App\Services\LearningAttemptService;
use App\Services\LearningProgressService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class StudentAssessmentController extends Controller
{
    private function input(Request $request, array $rules): array
    {
        $unknown = array_diff(array_keys($request->all()), array_keys($rules));
        if ($unknown !== []) {
            throw ValidationException::withMessages(array_fill_keys($unknown, 'Field is prohibited.'));
        }

        return $request->validate($rules);
    }

    public function progress(Request $request, Program $program, Chapter $chapter, LearningProgressService $progress)
    {
        return response()->json(['data' => $progress->progress($request->user(), $program, $chapter)]);
    }

    public function complete(Request $request, Program $program, Chapter $chapter, LearningProgressService $progress)
    {
        $data = $this->input($request, ['type' => ['required', Rule::in(['video', 'module', 'flashcard'])], 'resource_id' => ['nullable', 'integer', 'min:1']]);

        return response()->json(['data' => $progress->complete($request->user(), $program, $chapter, $data['type'], $data['resource_id'] ?? null)]);
    }

    public function start(Request $request, Program $program, Chapter $chapter, LearningAttemptService $attempts)
    {
        $data = $this->input($request, ['kind' => ['required', Rule::in(['audio', 'reading', 'mini'])]]);
        $attempt = $attempts->start($request->user(), $program, $chapter, $data['kind']);

        return response()->json(['data' => $attempts->payload($attempt)], 201);
    }

    public function show(Request $request, Program $program, Chapter $chapter, LearningAttempt $attempt, LearningAttemptService $attempts)
    {
        $attempts->authorize($request->user(), $program, $chapter, $attempt);

        return response()->json(['data' => $attempts->payload($attempt)]);
    }

    public function save(Request $request, Program $program, Chapter $chapter, LearningAttempt $attempt, LearningAttemptService $attempts)
    {
        $data = $this->input($request, ['answers' => ['present', 'array'], 'revision' => ['required', 'integer', 'min:0']]);
        $saved = $attempts->save($request->user(), $program, $chapter, $attempt, $data['answers'], $data['revision']);

        return response()->json(['data' => $attempts->payload($saved)]);
    }

    public function submit(Request $request, Program $program, Chapter $chapter, LearningAttempt $attempt, LearningAttemptService $attempts)
    {
        $data = $this->input($request, ['answers' => ['present', 'array'], 'revision' => ['required', 'integer', 'min:0']]);
        $submitted = $attempts->submit($request->user(), $program, $chapter, $attempt, $data['answers'], $data['revision']);

        return response()->json(['data' => $attempts->payload($submitted)]);
    }

    public function review(Request $request, Program $program, Chapter $chapter, LearningAttempt $attempt, LearningAttemptService $attempts)
    {
        $attempts->authorize($request->user(), $program, $chapter, $attempt);

        return response()->json(['data' => $attempts->payload($attempt, true)]);
    }
}
