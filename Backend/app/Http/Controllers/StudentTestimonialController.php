<?php

namespace App\Http\Controllers;

use App\Models\Testimonial;
use App\Models\User;
use App\Services\MediaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class StudentTestimonialController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->payload($request->user()->testimonial, $request->user())]);
    }

    public function update(Request $request): JsonResponse
    {
        $unknown = array_diff(array_keys($request->all()), ['context', 'quote', 'consent_public']);
        if ($unknown !== []) {
            throw ValidationException::withMessages(array_fill_keys($unknown, 'Field is prohibited.'));
        }
        $data = $request->validate([
            'context' => ['required', 'string', 'max:255'],
            'quote' => ['required', 'string', 'min:20', 'max:500'],
            'consent_public' => ['required', 'accepted'],
        ]);
        $payload = app(MediaService::class)->locked(function () use ($request, $data) {
            $user = User::query()->lockForUpdate()->findOrFail($request->user()->id);
            $testimonial = $user->testimonial()->lockForUpdate()->first() ?? new Testimonial;
            abort_if($testimonial->exists && $testimonial->moderation_status === 'approved', 409, 'Testimoni yang sudah disetujui tidak dapat diedit. Hubungi admin jika ingin melakukan perubahan.');
            $testimonial->forceFill([
                'user_id' => $user->id,
                'source' => 'student',
                'name' => $user->name,
                'context' => $data['context'],
                'quote' => $data['quote'],
                'moderation_status' => 'pending',
                'moderation_note' => null,
                'published' => false,
                'landing' => false,
                'consent_public' => true,
                'image' => null,
                'video_url' => null,
                'video_title' => null,
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

        return [
            'id' => $testimonial->id,
            'name' => $user->name,
            'context' => $testimonial->context,
            'quote' => $testimonial->quote,
            'moderation_status' => $testimonial->moderation_status,
            'moderation_note' => $testimonial->moderation_note,
            'consent_public' => $testimonial->consent_public,
            'published' => $testimonial->published,
            'created_at' => $testimonial->created_at?->toISOString(),
            'updated_at' => $testimonial->updated_at?->toISOString(),
        ];
    }
}
