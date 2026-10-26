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

        return response()->json(['data' => $this->payload($testimonial, $request->user()), 'context' => $this->accountContext($request->user())]);
    }

    public function update(Request $request): JsonResponse
    {
        $request->request->remove('_method');
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
        $request->merge(['context' => $this->accountContext($request->user())]);
        $video = $request->input('type', 'text') === 'video';
        $data = $request->validate([
            'type' => ['sometimes', 'required', Rule::in(['text', 'video'])],
            'context' => ['required', 'string', 'max:255'],
            'quote' => $video ? ['sometimes', 'nullable', 'string', 'max:500'] : ['required', 'string', 'min:20', 'max:500'],
            'title' => $video ? ['required', 'string', 'max:255'] : ['prohibited'],
            'video_title' => $video ? ['sometimes', 'string', 'max:255'] : ['prohibited'],
            'video_url' => $video ? ['required', 'string', 'max:2048', app(MediaService::class)->rule('student_video')] : ['prohibited'],
            'video_thumbnail' => $video ? ($request->hasFile('video_thumbnail')
                ? ['required', 'file', 'mimes:jpg,jpeg,png', 'max:'.max(1, (int) config('media.max_kb.image'))]
                : ['required', 'string', 'max:2048', app(MediaService::class)->rule('https_image')]) : ['prohibited'],
            'consent_public' => ['required', 'accepted'],
        ]);
        $uploaded = null;
        try {
            $payload = app(MediaService::class)->locked(function () use ($request, $data, $video, &$uploaded) {
                $user = User::query()->lockForUpdate()->findOrFail($request->user()->id);
                $testimonial = $user->testimonials()->where('type', $video ? 'video' : 'text')->lockForUpdate()->first() ?? new Testimonial;
                if ($testimonial->exists && ($testimonial->moderation_status === 'approved' || $testimonial->archived_at !== null)) {
                    throw new HttpResponseException(response()->json(['message' => 'Testimoni yang sudah disetujui tidak dapat diedit. Hubungi admin jika ingin melakukan perubahan.'], 409));
                }
                if ($video && $request->hasFile('video_thumbnail')) {
                    $uploaded = app(MediaService::class)->upload($request->file('video_thumbnail'), 'image');
                }
                $testimonial->forceFill([
                    'user_id' => $user->id,
                    'type' => $video ? 'video' : 'text',
                    'source' => 'student',
                    'name' => $user->name,
                    'context' => $data['context'],
                    'quote' => $video ? (array_key_exists('quote', $data) ? ($data['quote'] ?? '') : ($testimonial->quote ?? '')) : $data['quote'],
                    'moderation_status' => 'approved',
                    'moderation_note' => null,
                    'first_approved_at' => now(),
                    'published' => true,
                    'landing' => false,
                    'show_on_testimonials' => true,
                    'consent_public' => true,
                    'image' => null,
                    'video_url' => $video ? $data['video_url'] : null,
                    'title' => $video ? $data['title'] : null,
                    'video_title' => $video ? $data['title'] : null,
                    'video_thumbnail' => $video ? ($uploaded['path'] ?? $data['video_thumbnail']) : null,
                ])->save();

                return $this->payload($testimonial, $user);
            });

        } catch (\Throwable $exception) {
            if ($uploaded !== null) {
                try {
                    app(MediaService::class)->delete($uploaded['path']);
                } catch (\Throwable $cleanupException) {
                    report($cleanupException);
                }
            }
            throw $exception;
        }

        return response()->json(['data' => $payload]);
    }

    private function accountContext(User $user): string
    {
        $programs = app(\App\Services\EntitlementService::class)->qualifyingGrants()->where('user_id', $user->id)->get()
            ->map(fn ($grant) => $grant->program->name)->unique()->implode(', ');

        return $programs !== '' ? mb_substr($programs, 0, 255) : 'Siswa Hiru Academy';
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
            'archived_at' => $testimonial->archived_at?->toISOString(),
            'landing' => $testimonial->landing,
            'show_on_testimonials' => $testimonial->show_on_testimonials,
            'created_at' => $testimonial->created_at?->toISOString(),
            'updated_at' => $testimonial->updated_at?->toISOString(),
        ]);
    }
}
