<?php

namespace App\Services;

class CheckpointPackageService extends TryOutService
{
    protected string $assessmentModel = \App\Models\CheckpointPackage::class;
    protected string $questionModel = \App\Models\CheckpointStudioQuestion::class;
    protected string $passageModel = \App\Models\CheckpointPassage::class;
    protected string $attemptTable = 'checkpoint_attempts';
    protected string $parentKey = 'checkpoint_package_id';

    public function payload(\Illuminate\Database\Eloquent\Model $tryOut): array
    {
        $payload = parent::payload($tryOut);
        if (! $tryOut->questions()->where('status', 'published')->where('session', 'audio')->exists()) {
            unset($payload['sessions']['audio']);
        }

        return $payload;
    }

    protected function requiredSessions(): array
    {
        return ['vocabulary_kanji', 'grammar', 'reading'];
    }
}
