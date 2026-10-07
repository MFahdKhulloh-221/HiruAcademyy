<?php

namespace App\Services;

use App\Models\Chapter;
use App\Models\LearningModule;
use App\Models\ReadingPassage;
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
                ->whereHas('program', fn ($program) => $program->where('status', 'active')))
            ->with('chapter.program')->orderBy('sort_order')->orderBy('id')->get();

        foreach ($modules as $module) {
            $canAccess = $this->policy->canAccessChapter($user, $module->chapter->program->code, $module->chapter->chapter_number);
            $type = $module->module_type === 'kanji' ? 'Kanji' : 'Tata Bahasa';
            $levelName = strtoupper($module->chapter->program->code === 'dasar' ? 'Dasar' : ($module->chapter->program->code === 'ssw-food' ? 'SSW' : $module->chapter->program->code));
            $items[] = [
                'id' => 'module-'.$module->id,
                'resource_id' => $module->id,
                'category' => $type,
                'type' => $type,
                'title' => $module->title,
                'description' => $module->description ?: "Modul {$type} untuk Chapter {$module->chapter->chapter_number}.",
                'level' => $levelName,
                'program' => $module->chapter->program->only(['id', 'code', 'name', 'family']),
                'chapter' => $module->chapter->only(['id', 'chapter_number', 'title']),
                'file_url' => $module->file_url,
                'file_url_resolved_url' => $media->url($module->file_url),
                'href' => '/learn/'.($module->chapter->program->code === 'ssw-food' ? 'ssw-pengolahan-makanan' : $module->chapter->program->code)."/chapter-{$module->chapter->chapter_number}/".($module->module_type === 'kanji' ? 'kanji' : 'grammar'),
                'locked' => ! $canAccess,
            ];
        }

        $flashcardChapters = Chapter::query()->where('status', 'published')
            ->whereHas('program', fn ($q) => $q->where('status', 'active'))
            ->whereHas('flashcards', fn ($q) => $q->where('status', 'published'))
            ->with(['program', 'flashcards' => fn ($q) => $q->where('status', 'published')])
            ->orderBy('sort_order')->orderBy('chapter_number')->get();

        foreach ($flashcardChapters as $chapter) {
            $canAccess = $this->policy->canAccessChapter($user, $chapter->program->code, $chapter->chapter_number);
            $levelName = strtoupper($chapter->program->code === 'dasar' ? 'Dasar' : ($chapter->program->code === 'ssw-food' ? 'SSW' : $chapter->program->code));
            $items[] = [
                'id' => 'flashcards-'.$chapter->id,
                'resource_id' => $chapter->id,
                'category' => 'Kosakata',
                'type' => 'Kosakata',
                'title' => "Kosakata Chapter {$chapter->chapter_number}",
                'description' => "Kumpulan {$chapter->flashcards->count()} kartu kosakata penting {$chapter->title}.",
                'level' => $levelName,
                'program' => $chapter->program->only(['id', 'code', 'name', 'family']),
                'chapter' => $chapter->only(['id', 'chapter_number', 'title']),
                'href' => '/learn/'.($chapter->program->code === 'ssw-food' ? 'ssw-pengolahan-makanan' : $chapter->program->code)."/chapter-{$chapter->chapter_number}/flashcards",
                'locked' => ! $canAccess,
            ];
        }

        $audioChapters = Chapter::query()->where('status', 'published')
            ->whereHas('program', fn ($q) => $q->where('status', 'active'))
            ->whereHas('audioQuestions', fn ($q) => $q->where('status', 'published'))
            ->with('program')
            ->orderBy('sort_order')->orderBy('chapter_number')->get();

        foreach ($audioChapters as $chapter) {
            $canAccess = $this->policy->canAccessChapter($user, $chapter->program->code, $chapter->chapter_number);
            $levelName = strtoupper($chapter->program->code === 'dasar' ? 'Dasar' : $chapter->program->code);
            $items[] = [
                'id' => 'audio-'.$chapter->id,
                'resource_id' => $chapter->id,
                'category' => 'Audio',
                'type' => 'Audio',
                'title' => "Audio Choukai Chapter {$chapter->chapter_number}",
                'description' => "Latihan mendengarkan (choukai) {$chapter->title}.",
                'level' => $levelName,
                'program' => $chapter->program->only(['id', 'code', 'name', 'family']),
                'chapter' => $chapter->only(['id', 'chapter_number', 'title']),
                'href' => '/learn/'.$chapter->program->code."/chapter-{$chapter->chapter_number}/audio",
                'locked' => ! $canAccess,
            ];
        }

        $passages = ReadingPassage::query()->where('status', 'published')
            ->whereHas('chapter', fn ($query) => $query->where('status', 'published')
                ->whereHas('program', fn ($program) => $program->where('status', 'active')))
            ->with('chapter.program')->orderBy('id')->get();

        foreach ($passages as $passage) {
            $canAccess = $this->policy->canAccessChapter($user, $passage->chapter->program->code, $passage->chapter->chapter_number);
            $levelName = strtoupper($passage->chapter->program->code === 'dasar' ? 'Dasar' : $passage->chapter->program->code);
            $items[] = [
                'id' => 'reading-'.$passage->id,
                'resource_id' => $passage->id,
                'category' => 'Reading',
                'type' => 'Reading',
                'title' => $passage->title,
                'description' => "Latihan membaca (dokkai) Chapter {$passage->chapter->chapter_number}.",
                'level' => $levelName,
                'program' => $passage->chapter->program->only(['id', 'code', 'name', 'family']),
                'chapter' => $passage->chapter->only(['id', 'chapter_number', 'title']),
                'href' => '/learn/'.$passage->chapter->program->code."/chapter-{$passage->chapter->chapter_number}/reading",
                'locked' => ! $canAccess,
            ];
        }

        return $items;
    }
}
