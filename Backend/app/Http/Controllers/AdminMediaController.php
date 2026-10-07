<?php

namespace App\Http\Controllers;

use App\Services\MediaService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AdminMediaController extends Controller
{
    public function store(Request $request, MediaService $media)
    {
        $request->validate(['kind' => ['required', Rule::in(array_keys(MediaService::FORMATS))]]);
        $kind = $request->input('kind');
        $request->validate(['file' => ['required', 'file', 'max:'.max(1, (int) config("media.max_kb.{$kind}"))]]);

        return response()->json(['data' => $media->upload($request->file('file'), $kind)], 201);
    }

    public function destroy(Request $request, MediaService $media)
    {
        $data = $request->validate(['path' => ['required', 'string']]);
        $media->delete($data['path']);

        return response()->json(null, 204);
    }
}
