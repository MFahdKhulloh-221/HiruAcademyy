<?php

namespace App\Http\Controllers;

use App\Models\Testimonial;
use App\Models\User;
use App\Services\MediaService;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class StudentTestimonialController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $data = $request->validate(['type' => ['sometimes', 'required', Rule::in(['text', 'video'])]]);
        $testimonial = $request->user()->testimonials()->where('type', $data['type'] ?? 'text')->first();

        return response()->json(['data' => $this->payload($testimonial, $request->user())]);
    }

    public function update(Request $request): JsonResponse
    {
        $unknown = array_diff(array_keys($request->all()), ['type', 'context', 'quote', 'consent_public', 'title', 'video_title', 'video_url', 'video_thumbnail']);
        if ($unknown !== []) {
            throw ValidationException::withMessages(array_fill_keys($unknown, 'Field is prohibited.'));
        }
        if ($request->has('video_title')) {
            if ($request->has('title') && $request->input('title') !== $request->input('video_title')) {
                throw ValidationException::withMessages(['title' => 'Title aliases must match.']);
            }
            $request->merge(['title' => $request->input('video_title')]);
        }
        $video = $request->input('type', 'text') === 'video';
        $data = $request->validate([
            'type' => ['sometimes', 'required', Rule::in(['text', 'video'])],
            'context' => ['required', 'string', 'max:255'],
            'quote' => $video ? ['sometimes', 'nullable', 'string', 'max:500'] : ['required', 'string', 'min:20', 'max:500'],
            'title' => $video ? ['required', 'string', 'max:255'] : ['prohibited'],
            'video_title' => $video ? ['sometimes', 'string', 'max:255'] : ['prohibited'],
            'video_url' => $video ? ['required', 'string', 'max:2048', app(MediaService::class)->rule('student_video')] : ['prohibited'],
            'video_thumbnail' => $video ? ['required', 'string', 'max:2048', app(MediaService::class)->rule('https_image')] : ['prohibited'],
            'consent_public' => ['required', 'accepted'],
        ]);
        $payload = app(MediaService::class)->locked(function () use ($request, $data, $video) {
            $user = User::query()->lockForUpdate()->findOrFail($request->user()->id);
            $testimonial = $user->testimonials()->where('type', $video ? 'video' : 'text')->lockForUpdate()->first() ?? new Testimonial;
            if ($testimonial->exists && $testimonial->moderation_status === 'approved') {
                throw new HttpResponseException(response()->json(['message' => 'Testimoni yang sudah disetujui tidak dapat diedit. Hubungi admin jika ingin melakukan perubahan.'], 409));
            }
            $testimonial->forceFill([
                'user_id' => $user->id,
                'type' => $video ? 'video' : 'text',
                'source' => 'student',
                'name' => $user->name,
                'context' => $data['context'],
                'quote' => $video ? (array_key_exists('quote', $data) ? ($data['quote'] ?? '') : ($testimonial->quote ?? '')) : $data['quote'],
                'moderation_status' => 'pending',
                'moderation_note' => null,
                'published' => false,
                'landing' => false,
                'show_on_testimonials' => false,
                'consent_public' => true,
                'image' => null,
                'video_url' => $video ? $data['video_url'] : null,
                'title' => $video ? $data['title'] : null,
                'video_title' => $video ? $data['title'] : null,
                'video_thumbnail' => $video ? $data['video_thumbnail'] : null,
            ])->save();

            return $this->payload($testimonial, $user);
        });

        return response()->json(['data' => $payload]);
    }

    private function payload(?Testimonial $testimonial, User $user): ?array
    {
        if ($testimonial === null) {
            return null;
        }

        return app(MediaService::class)->payload([
            'id' => $testimonial->id,
            'name' => $user->name,
            'image' => $user->avatar,
            'type' => $testimonial->type,
            'context' => $testimonial->context,
            'quote' => $testimonial->quote,
            'title' => $testimonial->title,
            'video_title' => $testimonial->title,
            'video_url' => $testimonial->video_url,
            'video_thumbnail' => $testimonial->video_thumbnail,
            'moderation_status' => $testimonial->moderation_status,
            'moderation_note' => $testimonial->moderation_note,
            'consent_public' => $testimonial->consent_public,
            'published' => $testimonial->published,
            'landing' => $testimonial->landing,
            'show_on_testimonials' => $testimonial->show_on_testimonials,
            'created_at' => $testimonial->created_at?->toISOString(),
            'updated_at' => $testimonial->updated_at?->toISOString(),
        ]);
    }
}
