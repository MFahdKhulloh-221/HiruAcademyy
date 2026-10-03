<?php

namespace App\Http\Controllers;

use App\Models\TryOut;
use App\Models\TryOutQuestion;
use App\Services\TryOutService;
use Illuminate\Http\Request;

class AdminTryOutController extends Controller
{
    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()?->role === 'admin' && $request->user()?->account_status === 'active', 403);
    }

    public function index(Request $request, TryOutService $content)
    {
        $this->authorizeAdmin($request);

        return response()->json(['data' => TryOut::orderBy('id')->get()->map(fn ($tryOut) => $content->payload($tryOut))]);
    }

    public function store(Request $request, TryOutService $content)
    {
        $this->authorizeAdmin($request);

        return response()->json(['data' => $content->payload($content->save($request->all()))], 201);
    }

    public function show(Request $request, TryOut $tryOut, TryOutService $content)
    {
        $this->authorizeAdmin($request);

        return response()->json(['data' => $content->payload($tryOut) + ['questions' => $tryOut->questions()->orderBy('sort_order')->orderBy('id')->get()->map(fn ($question) => $content->adminQuestion($question))]]);
    }

    public function update(Request $request, TryOut $tryOut, TryOutService $content)
    {
        $this->authorizeAdmin($request);

        return response()->json(['data' => $content->payload($content->save($request->all(), $tryOut))]);
    }

    public function destroy(Request $request, TryOut $tryOut, TryOutService $content)
    {
        $this->authorizeAdmin($request);
        $content->delete($tryOut);

        return response()->noContent();
    }

    public function storeQuestion(Request $request, TryOut $tryOut, TryOutService $content)
    {
        $this->authorizeAdmin($request);

        return response()->json(['data' => $content->adminQuestion($content->saveQuestion($tryOut, $request->all()))], 201);
    }

    public function updateQuestion(Request $request, TryOut $tryOut, TryOutQuestion $question, TryOutService $content)
    {
        $this->authorizeAdmin($request);

        return response()->json(['data' => $content->adminQuestion($content->saveQuestion($tryOut, $request->all(), $question))]);
    }

    public function destroyQuestion(Request $request, TryOut $tryOut, TryOutQuestion $question, TryOutService $content)
    {
        $this->authorizeAdmin($request);
        $content->delete($tryOut, $question);

        return response()->noContent();
    }
}
