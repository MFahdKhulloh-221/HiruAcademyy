<?php

namespace App\Services;

use App\Models\LearningModule;
use App\Models\User;

class LearningLibraryService
{
    public function __construct(private ChapterAccessPolicy $policy) {}

    public function modules(User $user): array
    {
        return LearningModule::query()->where('status', 'published')
            ->whereHas('chapter', fn ($query) => $query->where('status', 'published')
                ->whereHas('program', fn ($program) => $program->where('status', 'active')))
            ->with('chapter.program')->orderBy('sort_order')->orderBy('id')->get()
            ->filter(fn ($module) => $this->policy->canAccessChapter($user, $module->chapter->program->code, $module->chapter->chapter_number))
            ->map(fn ($module) => $module->only(['id', 'title', 'description', 'module_type', 'file_url', 'sort_order']) + [
                'program' => $module->chapter->program->only(['id', 'code', 'name', 'family']),
                'chapter' => $module->chapter->only(['id', 'chapter_number', 'title']),
            ])->values()->all();
    }
}
