<?php

namespace App\Http\Controllers;

use App\Services\PublicContentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class PublicContentController extends Controller
{
    public function __construct(private PublicContentService $content) {}

    public function analyticsConfig(): JsonResponse
    {
        $row = DB::table('admin_settings')->where('section', 'integrations')->first(['value']);
        $settings = $row ? json_decode($row->value, true) : null;
        $measurementId = $row
            ? (($settings['ga4Enabled'] ?? null) === true ? ($settings['ga4MeasurementId'] ?? null) : null)
            : config('services.ga4.measurement_id');

        return response()->json(['data' => ['measurementId' => is_string($measurementId)
            && preg_match('/^G-[A-Z0-9]+$/iD', $measurementId) ? $measurementId : null]]);
    }

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
        $query = $this->content->ordered('testimonials')->where('published', true)
            ->whereNull('archived_at')->where('moderation_status', 'approved')->where('consent_public', true);
        if (isset($filters['landing']) && $request->boolean('landing')) {
            $query->where('type', 'text')->whereNull('video_url')->where('landing', true)
                ->limit(6);
        } else {
            $query->where('show_on_testimonials', true);
            if (isset($filters['landing'])) {
                $query->where('landing', false);
            }
        }

        return response()->json(['data' => $query->get()->map(fn ($model) => $this->content->payload($model, true))]);
    }

    public function blog(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'category' => ['sometimes', 'required', 'string', 'max:255'],
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
