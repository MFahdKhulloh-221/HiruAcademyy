<?php

namespace App\Http\Controllers;

use App\Models\CheckpointPackage;
use App\Models\CheckpointAttempt;
use App\Services\ChapterAccessPolicy;
use App\Services\CheckpointAttemptService;
use App\Services\CheckpointPackageService;
use Illuminate\Http\Request;

class StudentCheckpointController extends Controller
{
    public function index(Request $request, CheckpointAttemptService $attempts, CheckpointPackageService $content, ChapterAccessPolicy $access)
    {
        abort_unless($request->user()?->role === 'student' && $request->user()?->account_status === 'active', 403);
        $items = CheckpointPackage::where('status', 'published')
            ->whereHas('program', fn ($query) => $access->scopePrograms($query, $request->user())->where('family', 'jlpt')->whereIn('code', ['n5', 'n4', 'n3', 'n2', 'n1']))
            ->with('program')
            ->orderBy('sort_order')->orderBy('id')->get()
            ->values();

        return response()->json(['data' => $items->map(fn ($package) => $content->payload($package) + ['can_access' => $attempts->canAccess($request->user(), $package)])]);
    }

    public function show(Request $request, CheckpointPackage $package, CheckpointAttemptService $attempts, CheckpointPackageService $content)
    {
        $attempts->authorize($request->user(), $package);

        return response()->json(['data' => $content->payload($package)]);
    }

    public function start(Request $request, CheckpointPackage $package, CheckpointAttemptService $attempts, CheckpointPackageService $content)
    {
        $content->validateInput($request->all(), []);

        return response()->json(['data' => $attempts->payload($attempts->start($request->user(), $package))], 201);
    }

    public function attempt(Request $request, CheckpointPackage $package, CheckpointAttempt $attempt, CheckpointAttemptService $attempts)
    {
        $attempts->authorize($request->user(), $package, $attempt);

        return response()->json(['data' => $attempts->payload($attempts->refresh($request->user(), $package, $attempt))]);
    }

    public function save(Request $request, CheckpointPackage $package, CheckpointAttempt $attempt, CheckpointAttemptService $attempts, CheckpointPackageService $content)
    {
        $data = $content->validateInput($request->all(), ['answers' => ['present', 'array'], 'revision' => ['required', 'integer', 'min:0'], 'finish_session' => ['sometimes', 'boolean']]);
        $saved = $attempts->save($request->user(), $package, $attempt, $data['answers'], $data['revision'], (bool) ($data['finish_session'] ?? false));

        return response()->json(['data' => $attempts->payload($saved)]);
    }

    public function submit(Request $request, CheckpointPackage $package, CheckpointAttempt $attempt, CheckpointAttemptService $attempts, CheckpointPackageService $content)
    {
        $data = $content->validateInput($request->all(), ['revision' => ['required', 'integer', 'min:0']]);

        return response()->json(['data' => $attempts->payload($attempts->submit($request->user(), $package, $attempt, $data['revision']))]);
    }

    public function abandon(Request $request, CheckpointPackage $package, CheckpointAttempt $attempt, CheckpointAttemptService $attempts, CheckpointPackageService $content)
    {
        $content->validateInput($request->all(), []);
        $attempts->abandon($request->user(), $package, $attempt);

        return response()->noContent();
    }

    public function result(Request $request, CheckpointPackage $package, CheckpointAttempt $attempt, CheckpointAttemptService $attempts)
    {
        $current = $attempts->refresh($request->user(), $package, $attempt);
        abort_unless($current->status === 'completed', 403);
        return response()->json(['data' => $attempts->payload($current)]);
    }

    public function review(Request $request, CheckpointPackage $package, CheckpointAttempt $attempt, CheckpointAttemptService $attempts, CheckpointPackageService $content)
    {
        $attempts->authorize($request->user(), $package, $attempt);
        $content->validateInput($request->all(), ['incorrect_only' => ['sometimes', 'boolean']]);

        return response()->json(['data' => $attempts->payload($attempts->refresh($request->user(), $package, $attempt), true, $request->boolean('incorrect_only'))]);
    }

    public function history(Request $request, CheckpointPackage $package, CheckpointAttemptService $attempts)
    {
        return response()->json(['data' => $attempts->history($request->user(), $package)]);
    }
}
