<?php

namespace App\Http\Controllers;

use App\Models\NotificationContent;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminNotificationController extends Controller
{
    public function __construct(private NotificationService $notifications) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => NotificationContent::orderByDesc('id')->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->notifications->save($this->input($request))], 201);
    }

    public function show(Request $request): JsonResponse
    {
        return response()->json(['data' => NotificationContent::findOrFail($this->notifications->id($request->route('notification')))]);
    }

    public function update(Request $request): JsonResponse
    {
        $content = NotificationContent::findOrFail($this->notifications->id($request->route('notification')));

        return response()->json(['data' => $this->notifications->save($this->input($request), $content)]);
    }

    private function input(Request $request): array
    {
        $input = $request->all();
        if ($request->isJson()) {
            $raw = json_decode($request->getContent(), true);
            if (is_array($raw) && array_key_exists('path', $raw)) {
                $input['path'] = $raw['path'];
            }
        }

        return $input;
    }

    public function destroy(Request $request): JsonResponse
    {
        NotificationContent::findOrFail($this->notifications->id($request->route('notification')))->delete();

        return response()->json(null, 204);
    }
}
