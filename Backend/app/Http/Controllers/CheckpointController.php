<?php

namespace App\Http\Controllers;

use App\Models\CheckpointAttempt;
use App\Models\CheckpointPackage;
use App\Services\ChapterAccessPolicy;
use App\Services\CheckpointAttemptService;
use App\Services\CheckpointPackageService;
use App\Services\TryOutService;
use Illuminate\Http\Request;

class CheckpointController extends Controller
{
    public function adminIndex(CheckpointPackageService $content)
    {
        return response()->json(['data' => CheckpointPackage::orderByDesc('id')->get()->map(fn ($package) => $content->payload($package, true))]);
    }

    public function store(Request $request, CheckpointPackageService $content)
    {
        return response()->json(['data' => $content->payload($content->save($request->all()), true)], 201);
    }

    public function update(Request $request, CheckpointPackage $package, CheckpointPackageService $content)
    {
        return response()->json(['data' => $content->payload($content->save($request->all(), $package), true)]);
    }

    public function adminShow(CheckpointPackage $package, CheckpointPackageService $content)
    {
        return response()->json(['data' => $content->payload($package, true)]);
    }

    public function destroy(CheckpointPackage $package)
    {
        \Illuminate\Support\Facades\DB::transaction(function () use ($package) {
            $locked = CheckpointPackage::whereKey($package->id)->lockForUpdate()->firstOrFail();
            if (CheckpointAttempt::where('checkpoint_package_id', $locked->id)->exists()) {
                throw \Illuminate\Validation\ValidationException::withMessages(['package' => 'Paket dengan riwayat pengerjaan tidak dapat dihapus.']);
            }
            $locked->delete();
        }, 3);

        return response()->noContent();
    }

    public function history(Request $request, CheckpointPackage $package, CheckpointAttemptService $attempts)
    {
        $attempts->authorize($request->user(), $package);
        $items = CheckpointAttempt::where('checkpoint_package_id', $package->id)->where('user_id', $request->user()->id)->orderByDesc('id')->get();
        $history = $items->map(function ($attempt) use ($request, $package, $attempts) {
            $current = $attempts->mutate($request->user(), $package, $attempt, 'read');

            return ['id' => $current->id, 'status' => $current->status, 'expires_at' => $current->expires_at->toISOString(), 'server_now' => now()->toISOString(), 'result' => $current->result_snapshot];
        });

        return response()->json(['data' => ['attempts' => $history, 'best_score' => $history->max('result.score')]]);
    }

    public function index(Request $request, ChapterAccessPolicy $access, CheckpointAttemptService $attempts, CheckpointPackageService $content)
    {
        $packages = CheckpointPackage::where('status', 'published')->whereHas('program', fn ($query) => $access->scopePrograms($query, $request->user()))->with('program')->orderBy('id')->get();

        return response()->json(['data' => $packages->map(fn ($package) => $content->payload($package) + ['can_access' => $attempts->canAccess($request->user(), $package)])]);
    }

    public function show(Request $request, CheckpointPackage $package, CheckpointAttemptService $attempts, CheckpointPackageService $content)
    {
        $attempts->authorize($request->user(), $package);

        return response()->json(['data' => $content->payload($package)]);
    }

    public function start(Request $request, CheckpointPackage $package, CheckpointAttemptService $attempts, TryOutService $validation)
    {
        $validation->validateInput($request->all(), []);

        return response()->json(['data' => $attempts->payload($attempts->start($request->user(), $package))], 201);
    }

    public function attempt(Request $request, CheckpointPackage $package, CheckpointAttempt $attempt, CheckpointAttemptService $attempts)
    {
        return response()->json(['data' => $attempts->payload($attempts->mutate($request->user(), $package, $attempt, 'read'))]);
    }

    public function save(Request $request, CheckpointPackage $package, CheckpointAttempt $attempt, CheckpointAttemptService $attempts, TryOutService $validation)
    {
        $data = $validation->validateInput($request->all(), ['revision' => ['required', 'integer', 'min:0'], 'answers' => ['present', 'array']]);

        return response()->json(['data' => $attempts->payload($attempts->mutate($request->user(), $package, $attempt, 'save', $data['revision'], $data['answers']))]);
    }

    public function submit(Request $request, CheckpointPackage $package, CheckpointAttempt $attempt, CheckpointAttemptService $attempts, TryOutService $validation)
    {
        $data = $validation->validateInput($request->all(), ['revision' => ['required', 'integer', 'min:0']]);

        return response()->json(['data' => $attempts->payload($attempts->mutate($request->user(), $package, $attempt, 'submit', $data['revision']))]);
    }

    public function result(Request $request, CheckpointPackage $package, CheckpointAttempt $attempt, CheckpointAttemptService $attempts)
    {
        $attempt = $attempts->mutate($request->user(), $package, $attempt, 'read');
        abort_unless($attempt->status === 'completed', 403);

        return response()->json(['data' => $attempts->payload($attempt)]);
    }

    public function review(Request $request, CheckpointPackage $package, CheckpointAttempt $attempt, CheckpointAttemptService $attempts)
    {
        return response()->json(['data' => $attempts->payload($attempts->mutate($request->user(), $package, $attempt, 'read'), true)]);
    }
}
