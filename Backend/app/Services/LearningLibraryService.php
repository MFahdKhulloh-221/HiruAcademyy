<?php

namespace App\Services;

use App\Models\LearningModule;
use App\Models\User;

class LearningLibraryService
{
    public function __construct(private ChapterAccessPolicy $policy) {}

    public function modules(User $user): array
    {
        $media = app(MediaService::class);
        $items = [];

        $modules = LearningModule::query()->where('status', 'published')
            ->whereHas('chapter', fn ($query) => $query->where('status', 'published')
                ->whereHas('program', fn ($program) => $this->policy->scopePrograms($program, $user)))
            ->with('chapter.program')->orderBy('sort_order')->orderBy('id')->get();

        foreach ($modules as $module) {
            $canAccess = $this->policy->canAccessChapter($user, $module->chapter->program->code, $module->chapter->chapter_number);
            $type = match ($module->module_type) {
                'kanji' => 'Kanji',
                'grammar' => 'Tata Bahasa',
                default => 'Umum',
            };
            $levelName = strtoupper($module->chapter->program->code === 'dasar' ? 'Dasar' : ($module->chapter->program->code === 'ssw-food' ? 'SSW' : $module->chapter->program->code));
            $items[] = [
                'id' => 'module-'.$module->id,
                'resource_id' => $module->id,
                'category' => $type,
                'type' => $type,
                'title' => $module->title,
                'description' => ($canAccess ? $module->description : null) ?: "Modul {$type} untuk Chapter {$module->chapter->chapter_number}.",
                'level' => $levelName,
                'program' => $module->chapter->program->only(['id', 'code', 'name', 'family']),
                'chapter' => $module->chapter->only(['id', 'chapter_number', 'title']),
                'file_url' => $canAccess ? $module->file_url : null,
                'file_url_resolved_url' => $canAccess ? $media->url($module->file_url) : null,
                'href' => '/learn/'.($module->chapter->program->code === 'ssw-food' ? 'ssw-pengolahan-makanan' : $module->chapter->program->code)."/chapter-{$module->chapter->chapter_number}/".($module->module_type === 'kanji' ? 'kanji' : 'grammar'),
                'locked' => ! $canAccess,
            ];
        }

        return $items;
    }
}
