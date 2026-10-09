<?php

namespace App\Http\Controllers;

use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\MediaService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class StudentProfileAvatarController extends Controller
{
    public function store(Request $request, MediaService $media): UserResource
    {
        if (array_diff(array_keys($request->all()), ['file'])) {
            throw ValidationException::withMessages(['file' => 'Only an image file may be submitted.']);
        }
        $request->validate(['file' => ['required', 'file', 'max:'.max(1, (int) config('media.max_kb.image'))]]);
        $uploaded = $media->upload($request->file('file'), 'image');
        try {
            [$user, $old] = $this->replace($request, $media, $uploaded['path']);
        } catch (\Throwable $exception) {
            $this->cleanup($media, $uploaded['path']);
            throw $exception;
        }
        $this->cleanup($media, $old);

        return new UserResource($user);
    }

    public function destroy(Request $request, MediaService $media): UserResource
    {
        if ($request->all() !== []) {
            throw ValidationException::withMessages(['file' => 'No additional input is allowed.']);
        }
        [$user, $old] = $this->replace($request, $media, null);
        $this->cleanup($media, $old);

        return new UserResource($user);
    }

    private function replace(Request $request, MediaService $media, ?string $path): array
    {
        return $media->locked(function () use ($request, $path) {
            $user = User::query()->lockForUpdate()->findOrFail($request->user()->id);
            $old = $user->avatar;
            $user->avatar = $path;
            $user->saveOrFail();

            return [$user->refresh(), $old];
        });
    }

    private function cleanup(MediaService $media, ?string $path): void
    {
        if ($path && $media->managed($path, 'image')) {
            try {
                $media->delete($path);
            } catch (\Throwable $exception) {
                report($exception);
            }
        }
    }
}
