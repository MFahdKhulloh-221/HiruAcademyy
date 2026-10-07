<?php

namespace App\Http\Controllers;

use App\Http\Resources\StudentChapterResource;
use App\Models\ActivityCompletion;
use App\Models\Chapter;
use App\Models\LearningAttempt;
use App\Models\LearningModule;
use App\Models\Program;
use App\Services\ChapterAccessPolicy;
use App\Services\EntitlementService;
use App\Services\LearningLibraryService;
use App\Services\MediaService;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;

class StudentLearningController extends Controller
{
    public function library(Request $request, LearningLibraryService $library)
    {
        return response()->json(['data' => $library->modules($request->user())]);
    }

    public function flashcards(Request $request, ChapterAccessPolicy $policy)
    {
        $user = $request->user();
        $chapters = Chapter::query()->where('status', 'published')
            ->whereHas('program', fn ($q) => $q->where('status', 'active'))
            ->whereHas('flashcards', fn ($q) => $q->where('status', 'published'))
            ->with(['program', 'flashcards' => fn ($q) => $q->where('status', 'published')->orderBy('sort_order')->orderBy('id')])
            ->orderBy('sort_order')->orderBy('chapter_number')->orderBy('id')->get();

        $completedChapterIds = ActivityCompletion::where('user_id', $user->id)
            ->where('type', 'flashcard')
            ->pluck('chapter_id')
            ->all();

        $decks = [];
        $totalCardsAvailable = 0;
        $totalCardsStudied = 0;
        $completedDecksCount = 0;

        foreach ($chapters as $chapter) {
            $canAccess = $policy->canAccessChapter($user, $chapter->program->code, $chapter->chapter_number);
            $cardCount = $chapter->flashcards->count();
            if ($cardCount === 0) {
                continue;
            }

            $isCompleted = in_array($chapter->id, $completedChapterIds, true);
            if ($canAccess) {
                $totalCardsAvailable += $cardCount;
                if ($isCompleted) {
                    $totalCardsStudied += $cardCount;
                    $completedDecksCount++;
                }
            }

            $firstCard = $chapter->flashcards->first();
            $levelCode = strtoupper($chapter->program->code === 'dasar' ? 'Dasar' : ($chapter->program->code === 'ssw-food' ? 'SSW' : $chapter->program->code));
            $decks[] = [
                'id' => $chapter->id,
                'program_code' => $chapter->program->code,
                'program_name' => $chapter->program->name,
                'level' => $levelCode,
                'chapter_number' => $chapter->chapter_number,
                'chapter_title' => $chapter->title,
                'title' => 'Kosakata Chapter '.$chapter->chapter_number,
                'category' => 'Bahasa Jepang',
                'card_count' => $cardCount,
                'progress' => $isCompleted ? 100 : 0,
                'glyph' => $firstCard ? mb_substr($firstCard->japanese, 0, 1) : '語',
                'description' => $chapter->description ?: 'Kosakata dan pola penting dari chapter ini.',
                'action' => $isCompleted ? 'Review' : 'Mulai',
                'cta_label' => $isCompleted ? 'Review Flashcards' : 'Mulai Belajar',
                'locked' => ! $canAccess,
                'href' => '/learn/'.($chapter->program->code === 'ssw-food' ? 'ssw-pengolahan-makanan' : $chapter->program->code).'/chapter-'.$chapter->chapter_number.'/flashcards',
            ];
        }

        $streakDays = 0;
        $dates = ActivityCompletion::where('user_id', $user->id)
            ->selectRaw('DATE(completed_at) as comp_date')
            ->distinct()
            ->orderByDesc('comp_date')
            ->pluck('comp_date')
            ->all();
        if ($dates !== []) {
            $currentDate = now()->toDateString();
            $yesterday = now()->subDay()->toDateString();
            if ($dates[0] === $currentDate || $dates[0] === $yesterday) {
                $check = CarbonImmutable::parse($dates[0]);
                $streakDays = 1;
                for ($i = 1; $i < count($dates); $i++) {
                    $prev = CarbonImmutable::parse($dates[$i]);
                    if ($check->subDays(1)->toDateString() === $prev->toDateString()) {
                        $streakDays++;
                        $check = $prev;
                    } else {
                        break;
                    }
                }
            }
        }

        return response()->json([
            'data' => [
                'metrics' => [
                    'cards_studied' => $totalCardsStudied,
                    'cards_available' => $totalCardsAvailable,
                    'decks_completed' => $completedDecksCount,
                    'streak_days' => $streakDays,
                ],
                'decks' => $decks,
            ],
        ]);
    }

    public function overallProgress(Request $request, EntitlementService $entitlements, ChapterAccessPolicy $policy)
    {
        $user = $request->user();
        $access = $entitlements->effectiveAccess($user)['learning'];
        $programs = Program::where('status', 'active')->orderBy('sort_order')->orderBy('id')->get();

        $totalReq = 0;
        $totalComp = 0;
        $programStats = [];
        $chapterStats = [];

        foreach ($programs as $prog) {
            $progAccess = $access[$prog->code] ?? 'none';
            if ($progAccess === 'none') {
                continue;
            }
            $chapters = Chapter::where('program_id', $prog->id)->where('status', 'published')
                ->orderBy('sort_order')->orderBy('chapter_number')->get();

            $progReq = 0;
            $progComp = 0;

            foreach ($chapters as $ch) {
                if (! $policy->canAccessChapter($user, $prog->code, $ch->chapter_number)) {
                    continue;
                }
                $reqVideo = $ch->videoLessons()->where('status', 'published')->count();
                $reqMod = $ch->modules()->where('status', 'published')->count();
                $reqFc = $ch->flashcards()->where('status', 'published')->exists() ? 1 : 0;
                $reqAud = in_array($prog->family, ['foundation', 'jlpt'], true) ? $ch->audioQuestions()->where('status', 'published')->count() : 0;
                $reqRd = in_array($prog->family, ['foundation', 'jlpt'], true) ? $ch->readingPassages()->where('status', 'published')->count() : 0;
                $chReq = $reqVideo + $reqMod + $reqFc + $reqAud + $reqRd;

                $compCount = ActivityCompletion::where('user_id', $user->id)->where('chapter_id', $ch->id)->count();

                $progReq += $chReq;
                $progComp += min($chReq, $compCount);

                $chapterStats[] = [
                    'chapter_id' => $ch->id,
                    'program_code' => $prog->code,
                    'chapter_number' => $ch->chapter_number,
                    'title' => $ch->title,
                    'required' => $chReq,
                    'completed' => min($chReq, $compCount),
                    'percentage' => $chReq > 0 ? (int) round(min($chReq, $compCount) * 100 / $chReq) : 0,
                    'is_complete' => $chReq > 0 && $compCount >= $chReq,
                ];
            }

            $totalReq += $progReq;
            $totalComp += $progComp;

            $programStats[] = [
                'code' => $prog->code,
                'name' => $prog->name,
                'level' => strtoupper($prog->code === 'dasar' ? 'Dasar' : ($prog->code === 'ssw-food' ? 'SSW' : $prog->code)),
                'required' => $progReq,
                'completed' => $progComp,
                'percentage' => $progReq > 0 ? (int) round($progComp * 100 / $progReq) : 0,
            ];
        }

        $overallPct = $totalReq > 0 ? (int) round($totalComp * 100 / $totalReq) : 0;

        // Kanji mastered: completed modules of type kanji
        $kanjiCompleted = ActivityCompletion::where('user_id', $user->id)
            ->where('type', 'module')
            ->whereIn('resource_id', LearningModule::where('module_type', 'kanji')->pluck('id'))
            ->count();

        // Latihan selesai: completed audio + reading + mini attempts
        $practiceCompleted = ActivityCompletion::where('user_id', $user->id)
            ->whereIn('type', ['audio', 'reading'])
            ->count();
        $completedMiniAttempts = LearningAttempt::where('user_id', $user->id)
            ->where('kind', 'mini')
            ->where('status', 'completed')
            ->count();
        $practiceCompleted += $completedMiniAttempts;

        // Accuracy from attempts
        $attempts = LearningAttempt::where('user_id', $user->id)
            ->where('status', 'completed')
            ->get();
        $totalEarned = 0;
        $totalMax = 0;
        foreach ($attempts as $att) {
            if ($att->result_snapshot && isset($att->result_snapshot['correct'], $att->result_snapshot['total'])) {
                $totalEarned += $att->result_snapshot['correct'];
                $totalMax += $att->result_snapshot['total'];
            }
        }
        $accuracy = $totalMax > 0 ? (int) round($totalEarned * 100 / $totalMax) : 0;

        // Real streak days
        $streakDays = 0;
        $dates = ActivityCompletion::where('user_id', $user->id)
            ->selectRaw('DATE(completed_at) as comp_date')
            ->distinct()
            ->orderByDesc('comp_date')
            ->pluck('comp_date')
            ->all();
        if ($dates !== []) {
            $currentDate = now()->toDateString();
            $yesterday = now()->subDay()->toDateString();
            if ($dates[0] === $currentDate || $dates[0] === $yesterday) {
                $check = CarbonImmutable::parse($dates[0]);
                $streakDays = 1;
                for ($i = 1; $i < count($dates); $i++) {
                    $prev = CarbonImmutable::parse($dates[$i]);
                    if ($check->subDays(1)->toDateString() === $prev->toDateString()) {
                        $streakDays++;
                        $check = $prev;
                    } else {
                        break;
                    }
                }
            }
        }

        // Milestones
        $activeProg = $programStats[0] ?? ['name' => 'JLPT N5', 'level' => 'N5', 'percentage' => 0];

        return response()->json([
            'data' => [
                'overall_percentage' => $overallPct,
                'streak_days' => $streakDays,
                'kanji_mastered' => $kanjiCompleted,
                'practice_completed' => $practiceCompleted,
                'accuracy' => $accuracy,
                'active_program' => $activeProg,
                'programs' => $programStats,
                'chapters' => $chapterStats,
            ],
        ]);
    }

    public function index(Request $request, Program $program, EntitlementService $entitlements, ChapterAccessPolicy $policy)
    {
        abort_unless($program->status === 'active', 404);
        $access = $entitlements->effectiveAccess($request->user())['learning'][$program->code] ?? 'none';
        $chapters = Chapter::where('program_id', $program->id)->where('status', 'published')
            ->withExists(['miniCheckpointQuestions as mini_checkpoint_exists' => fn ($query) => $query->where('status', 'published')])
            ->orderBy('sort_order')->orderBy('chapter_number')->orderBy('id')->get();
        foreach ($chapters as $chapter) {
            $chapter->setAttribute('access', $policy->canAccessChapter($request->user(), $program->code, $chapter->chapter_number) ? $access : 'locked');
        }

        return StudentChapterResource::collection($chapters);
    }

    public function show(Request $request, Program $program, Chapter $chapter, EntitlementService $entitlements, ChapterAccessPolicy $policy)
    {
        abort_unless($program->status === 'active' && $chapter->program_id === $program->id && $chapter->status === 'published', 404);
        abort_unless($policy->canAccessChapter($request->user(), $program->code, $chapter->chapter_number), 403);
        $chapter->setAttribute('access', $entitlements->effectiveAccess($request->user())['learning'][$program->code]);
        $published = fn ($query) => $query->where('status', 'published');
        $chapter->load([
            'videoLessons' => $published,
            'modules' => $published,
            'flashcards' => $published,
            'audioQuestions' => $published,
            'readingPassages' => $published,
            'readingPassages.questions' => $published,
        ])->loadExists(['miniCheckpointQuestions as mini_checkpoint_exists' => $published]);

        return response()->json(['data' => app(MediaService::class)->payload((new StudentChapterResource($chapter))->resolve($request))]);
    }
}
