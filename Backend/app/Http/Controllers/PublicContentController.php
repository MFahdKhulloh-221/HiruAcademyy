<?php

namespace App\Http\Controllers;

use App\Services\PublicContentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PublicContentController extends Controller
{
    public function __construct(private PublicContentService $content) {}

    public function showcase(): JsonResponse
    {
        return response()->json(['data' => $this->content->ordered('showcase-items')->where('visible', true)->get()
            ->map(fn ($model) => $this->content->payload($model, true))]);
    }

    public function sensei(): JsonResponse
    {
        return response()->json(['data' => $this->content->ordered('sensei-profiles')->where('active', true)->get()
            ->map(fn ($model) => $this->content->payload($model, true))]);
    }

    public function testimonials(Request $request): JsonResponse
    {
        $filters = $request->validate(['landing' => ['sometimes', 'required', Rule::in(['true', 'false', '1', '0'])]]);
        $query = $this->content->ordered('testimonials')->where('published', true);
        if (isset($filters['landing'])) {
            $query->where('landing', $request->boolean('landing'));
        }

        return response()->json(['data' => $query->get()->map(fn ($model) => $this->content->payload($model, true))]);
    }

    public function blog(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'category' => ['sometimes', 'required', Rule::in(PublicContentService::CATEGORIES)],
            'featured' => ['sometimes', 'required', Rule::in(['true', 'false', '1', '0'])],
        ]);
        $query = $this->content->articles();
        if (isset($filters['category'])) {
            $query->where('category', $filters['category']);
        }
        if (isset($filters['featured'])) {
            $query->where('featured', $request->boolean('featured'));
        }

        return response()->json(['data' => $query->get()->map(fn ($model) => $this->content->payload($model, true))]);
    }

    public function article(Request $request): JsonResponse
    {
        $slug = (string) $request->route('slug');
        abort_unless(strlen($slug) <= 255 && preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', $slug), 404);
        $model = $this->content->articles()->where('slug', $slug)->firstOrFail();

        return response()->json(['data' => $this->content->payload($model, true)]);
    }
}
