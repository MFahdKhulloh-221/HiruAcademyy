<?php

namespace App\Services;

class CheckpointPackageService extends TryOutService
{
    protected string $assessmentModel = \App\Models\CheckpointPackage::class;
    protected string $questionModel = \App\Models\CheckpointStudioQuestion::class;
    protected string $passageModel = \App\Models\CheckpointPassage::class;
    protected string $attemptTable = 'checkpoint_attempts';
    protected string $parentKey = 'checkpoint_package_id';
}
