<?php

namespace App\Http\Controllers;

use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StudentNotificationController extends Controller
{
    public function __construct(private NotificationService $notifications) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->notifications->listing($request->user())]);
    }

    public function read(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->notifications->mark($request->user(),
            $this->notifications->id($request->route('notification')), $request->all())]);
    }

    public function readAll(Request $request): JsonResponse
    {
        $this->notifications->readAll($request->user(), $request->all());

        return response()->json(null, 204);
    }
}
