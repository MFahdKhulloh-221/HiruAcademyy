<?php

namespace App\Http\Controllers;

use App\Services\AssessmentAudioService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class AssessmentAudioController extends Controller
{
    public function status(Request $request, string $domain, string $attempt, string $question, AssessmentAudioService $audio)
    {
        abort_unless($request->all() === [], 422);

        return response()->json(['data' => $audio->handle($request, $domain, $attempt, $question, 'status', null)])->header('Cache-Control', 'no-store');
    }

    public function mutate(Request $request, string $domain, string $attempt, string $question, string $action, AssessmentAudioService $audio)
    {
        if (array_diff(array_keys($request->all()), ['token']) !== []) {
            throw ValidationException::withMessages(['input' => 'Unknown field.']);
        }
        $data = $request->validate(['token' => ['required', 'uuid']]);

        return response()->json(['data' => $audio->handle($request, $domain, $attempt, $question, $action, strtolower($data['token']))])->header('Cache-Control', 'no-store');
    }
}
