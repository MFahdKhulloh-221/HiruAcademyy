<?php

namespace App\Http\Controllers;

use App\Models\CheckpointPackage;
use App\Models\CheckpointStudioQuestion;
use App\Services\CheckpointPackageService;
use Illuminate\Http\Request;

class AdminCheckpointController extends Controller
{
    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()?->role === 'admin' && $request->user()?->account_status === 'active', 403);
    }

    public function index(Request $request, CheckpointPackageService $content)
    {
        $this->authorizeAdmin($request);

        return response()->json(['data' => CheckpointPackage::orderBy('sort_order')->orderBy('id')->get()->map(fn ($package) => $content->payload($package))]);
    }

    public function store(Request $request, CheckpointPackageService $content)
    {
        $this->authorizeAdmin($request);

        return response()->json(['data' => $content->payload($content->save($request->all()))], 201);
    }

    public function show(Request $request, CheckpointPackage $package, CheckpointPackageService $content)
    {
        $this->authorizeAdmin($request);

        return response()->json(['data' => $content->payload($package) + ['studio_revision' => $content->studioRevision($package), 'passages' => \App\Models\CheckpointPassage::where('checkpoint_package_id', $package->id)->get(['id', 'title', 'body']), 'questions' => $package->questions()->orderBy('sort_order')->orderBy('id')->get()->map(fn ($question) => $content->adminQuestion($question))]]);
    }

    public function update(Request $request, CheckpointPackage $package, CheckpointPackageService $content)
    {
        $this->authorizeAdmin($request);

        return response()->json(['data' => $content->payload($content->save($request->all(), $package))]);
    }

    public function studio(Request $request, CheckpointPackage $package, CheckpointPackageService $content)
    {
        $this->authorizeAdmin($request);
        $content->saveStudio($package, $request->all());

        return $this->show($request, $package->fresh(), $content);
    }

    public function destroy(Request $request, CheckpointPackage $package, CheckpointPackageService $content)
    {
        $this->authorizeAdmin($request);
        $content->delete($package);

        return response()->noContent();
    }

    public function storeQuestion(Request $request, CheckpointPackage $package, CheckpointPackageService $content)
    {
        $this->authorizeAdmin($request);

        return response()->json(['data' => $content->adminQuestion($content->saveQuestion($package, $request->all()))], 201);
    }

    public function publishQuestions(Request $request, CheckpointPackage $package, CheckpointPackageService $content)
    {
        $this->authorizeAdmin($request);

        return response()->json(['data' => $content->publishQuestions($package, $request->all())]);
    }

    public function updateQuestion(Request $request, CheckpointPackage $package, CheckpointStudioQuestion $question, CheckpointPackageService $content)
    {
        $this->authorizeAdmin($request);

        return response()->json(['data' => $content->adminQuestion($content->saveQuestion($package, $request->all(), $question))]);
    }

    public function destroyQuestion(Request $request, CheckpointPackage $package, CheckpointStudioQuestion $question, CheckpointPackageService $content)
    {
        $this->authorizeAdmin($request);
        $content->delete($package, $question);

        return response()->noContent();
    }
}
