<?php

namespace App\Http\Controllers;

use App\Models\TryOut;
use App\Models\TryOutAttempt;
use App\Services\ChapterAccessPolicy;
use App\Services\TryOutAttemptService;
use App\Services\TryOutService;
use Illuminate\Http\Request;

class StudentTryOutController extends Controller
{
    public function index(Request $request, TryOutAttemptService $attempts, TryOutService $content, ChapterAccessPolicy $access)
    {
        abort_unless($request->user()?->role === 'student' && $request->user()?->account_status === 'active', 403);
        $items = TryOut::where('status', 'published')
            ->whereHas('program', fn ($query) => $query->where('status', 'active')->where('family', 'jlpt')->whereIn('code', ['n5', 'n4', 'n3', 'n2', 'n1']))
            ->with('program')
            ->orderBy('id')->get()
            ->filter(fn ($tryOut) => $access->canAccessChapter($request->user(), $tryOut->program->code, 1))
            ->values();

        return response()->json(['data' => $items->map(fn ($tryOut) => $content->payload($tryOut))]);
    }

    public function show(Request $request, TryOut $tryOut, TryOutAttemptService $attempts, TryOutService $content)
    {
        $attempts->authorize($request->user(), $tryOut);

        return response()->json(['data' => $content->payload($tryOut)]);
    }

    public function start(Request $request, TryOut $tryOut, TryOutAttemptService $attempts, TryOutService $content)
    {
        $content->validateInput($request->all(), []);

        return response()->json(['data' => $attempts->payload($attempts->start($request->user(), $tryOut))], 201);
    }

    public function attempt(Request $request, TryOut $tryOut, TryOutAttempt $attempt, TryOutAttemptService $attempts)
    {
        $attempts->authorize($request->user(), $tryOut, $attempt);

        return response()->json(['data' => $attempts->payload($attempt)]);
    }

    public function save(Request $request, TryOut $tryOut, TryOutAttempt $attempt, TryOutAttemptService $attempts, TryOutService $content)
    {
        $data = $content->validateInput($request->all(), ['answers' => ['present', 'array'], 'revision' => ['required', 'integer', 'min:0'], 'finish_session' => ['required', 'boolean']]);
        $saved = $attempts->save($request->user(), $tryOut, $attempt, $data['answers'], $data['revision'], (bool) $data['finish_session']);

        return response()->json(['data' => $attempts->payload($saved)]);
    }

    public function submit(Request $request, TryOut $tryOut, TryOutAttempt $attempt, TryOutAttemptService $attempts, TryOutService $content)
    {
        $data = $content->validateInput($request->all(), ['revision' => ['required', 'integer', 'min:0']]);

        return response()->json(['data' => $attempts->payload($attempts->submit($request->user(), $tryOut, $attempt, $data['revision']))]);
    }

    public function review(Request $request, TryOut $tryOut, TryOutAttempt $attempt, TryOutAttemptService $attempts, TryOutService $content)
    {
        $attempts->authorize($request->user(), $tryOut, $attempt);
        $content->validateInput($request->all(), ['incorrect_only' => ['sometimes', 'boolean']]);

        return response()->json(['data' => $attempts->payload($attempt, true, $request->boolean('incorrect_only'))]);
    }

    public function history(Request $request, TryOut $tryOut, TryOutAttemptService $attempts)
    {
        return response()->json(['data' => $attempts->history($request->user(), $tryOut)]);
    }
}
