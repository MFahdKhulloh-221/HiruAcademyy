<?php

namespace App\Http\Controllers;

use App\Http\Resources\LearningProgramResource;
use App\Models\Program;
use Illuminate\Http\JsonResponse;

class ProgramController extends Controller
{
    public function publicIndex(): JsonResponse
    {
        return response()->json(['data' => LearningProgramResource::collection(Program::query()
            ->where('status', 'active')
            ->orderBy('sort_order')->orderBy('id')
            ->get(['id', 'code', 'slug', 'name', 'family']))]);
    }

    public function adminIndex(): JsonResponse
    {
        return response()->json(['data' => Program::query()
            ->orderBy('sort_order')->orderBy('id')
            ->get(['id', 'code', 'slug', 'name', 'family', 'cumulative_rank', 'status', 'sort_order'])]);
    }
}
