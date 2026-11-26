<?php

namespace App\Http\Controllers;

use App\Models\DailyPractice;
use App\Models\DailyPracticeAttempt;
use App\Services\DailyPracticeAttemptService;
use App\Services\DailyPracticeService;
use Illuminate\Http\Request;

class StudentDailyPracticeController extends Controller
{
    private function own(Request $request, DailyPractice $practice): DailyPracticeAttempt
    {
        return DailyPracticeAttempt::where('daily_practice_id', $practice->id)->where('user_id', $request->user()->id)->firstOrFail();
    }

    private function catalog(Request $request, DailyPractice $practice): array
    {
        $engine = app(DailyPracticeAttemptService::class);
        $engine->authorize($request->user(), $practice);
        $attempt = DailyPracticeAttempt::where('daily_practice_id', $practice->id)->where('user_id', $request->user()->id)->first();
        if ($attempt) {
            $attempt = $engine->refresh($request->user(), $practice, $attempt);
        }
        $status = $attempt?->status ?? 'open';

        return array_replace(app(DailyPracticeService::class)->payload($practice), [
            'status' => $status, 'can_review' => $attempt?->status === 'completed',
            'attempt' => $attempt ? ['id' => $attempt->id, 'status' => $attempt->status, 'result' => $engine->payload($attempt)['result']] : null,
        ]);
    }

    public function index(Request $request)
    {
        $practices = DailyPractice::where('status', 'published')->orderByDesc('id')->get();

        return response()->json(['data' => $practices->map(fn ($p) => $this->catalog($request, $p))])->header('Cache-Control', 'private, no-store');
    }

    public function show(Request $request, DailyPractice $practice)
    {
        return response()->json(['data' => $this->catalog($request, $practice)])->header('Cache-Control', 'private, no-store');
    }

    public function start(Request $request, DailyPractice $practice, DailyPracticeAttemptService $engine)
    {
        app(DailyPracticeService::class)->validateInput($request->all(), []);

        return response()->json(['data' => $engine->payload($engine->start($request->user(), $practice))])->header('Cache-Control', 'private, no-store');
    }

    public function attempt(Request $request, DailyPractice $practice, DailyPracticeAttemptService $engine)
    {
        return response()->json(['data' => $engine->payload($engine->refresh($request->user(), $practice, $this->own($request, $practice)))])->header('Cache-Control', 'private, no-store');
    }

    public function answers(Request $request, DailyPractice $practice, DailyPracticeAttemptService $engine)
    {
        $data = app(DailyPracticeService::class)->validateInput($request->all(), [
            'answers' => ['present', 'array'], 'answers.*' => ['required', 'in:A,B,C,D'], 'revision' => ['required', 'integer', 'min:0'],
        ]);

        return response()->json(['data' => $engine->payload($engine->save($request->user(), $practice, $this->own($request, $practice), $data['answers'], (int) $data['revision']))])->header('Cache-Control', 'private, no-store');
    }

    public function submit(Request $request, DailyPractice $practice, DailyPracticeAttemptService $engine)
    {
        $data = app(DailyPracticeService::class)->validateInput($request->all(), ['revision' => ['sometimes', 'integer', 'min:0']]);
        $attempt = $this->own($request, $practice);

        return response()->json(['data' => $engine->payload($engine->submit($request->user(), $practice, $attempt, (int) ($data['revision'] ?? -1)))])->header('Cache-Control', 'private, no-store');
    }

    public function review(Request $request, DailyPractice $practice, DailyPracticeAttemptService $engine)
    {
        return response()->json(['data' => $engine->payload($engine->refresh($request->user(), $practice, $this->own($request, $practice)), true)])->header('Cache-Control', 'private, no-store');
    }
}
