<?php

namespace App\Services;

use App\Models\ActivityCompletion;
use App\Models\Chapter;
use App\Models\LearningAttempt;
use App\Models\TryOutAttempt;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

class GamificationService
{
    public function lock(User $user): void
    {
        User::whereKey($user->id)->lockForUpdate()->firstOrFail();
    }

    public function award(User $user, string $key, int $points): void
    {
        if (DB::transactionLevel() === 0) {
            throw new \LogicException('Rewards require the completion transaction.');
        }
        $this->lock($user);
        $day = now('Asia/Jakarta')->toDateString();
        DB::table('gamification_days')->insertOrIgnore(['user_id' => $user->id, 'activity_on' => $day, 'xp' => 0]);
        $daily = DB::table('gamification_days')->where('user_id', $user->id)->where('activity_on', $day)->lockForUpdate()->first();
        $xp = min($points, max(0, 50 - $daily->xp));
        $inserted = DB::table('gamification_rewards')->insertOrIgnore(['user_id' => $user->id, 'reward_key' => $key, 'activity_on' => $day, 'xp' => $xp, 'created_at' => now()->utc()]);
        if ($inserted) {
            DB::table('gamification_days')->where('id', $daily->id)->increment('xp', $xp);
        }
    }

    public function chapterBonus(User $user, Chapter $chapter): void
    {
        $progress = app(LearningProgressService::class)->progress($user, $chapter->program, $chapter);
        $required = array_filter($progress['activities'], fn ($activity) => $activity['total'] > 0);
        if ($required !== [] && ! in_array(false, array_column($required, 'complete'), true)) {
            $this->award($user, 'chapter:'.$chapter->id, 30);
        }
    }

    public function activityDays(array $userIds): array
    {
        $days = [];
        $add = function ($userId, $timestamp) use (&$days) {
            if ($timestamp !== null) {
                $day = CarbonImmutable::parse($timestamp, 'UTC')->setTimezone('Asia/Jakarta')->toDateString();
                if ($day <= now('Asia/Jakarta')->toDateString()) {
                    $days[$userId][$day] = true;
                }
            }
        };
        foreach (ActivityCompletion::whereIn('user_id', $userIds)->get(['user_id', 'completed_at']) as $completion) {
            $add($completion->user_id, $completion->completed_at);
        }
        foreach (LearningAttempt::whereIn('user_id', $userIds)->where('status', 'completed')->get(['user_id', 'answers', 'submitted_at']) as $attempt) {
            if (count($attempt->answers ?? []) > 0) {
                $add($attempt->user_id, $attempt->submitted_at);
            }
        }
        foreach (TryOutAttempt::whereIn('user_id', $userIds)->where('status', 'completed')->get(['user_id', 'answers', 'completed_at']) as $attempt) {
            if (count($attempt->answers ?? []) > 0) {
                $add($attempt->user_id, $attempt->completed_at);
            }
        }

        return $days;
    }

    public function streak(User $user): int
    {
        return $this->streakFromDays($this->activityDays([$user->id])[$user->id] ?? []);
    }

    private function streakFromDays(array $days): int
    {
        $date = CarbonImmutable::now('Asia/Jakarta')->startOfDay();
        if (! isset($days[$date->toDateString()])) {
            $date = $date->subDay();
        }
        $count = 0;
        while (isset($days[$date->toDateString()])) {
            $count++;
            $date = $date->subDay();
        }

        return $count;
    }

    private function week(): array
    {
        $start = CarbonImmutable::now('Asia/Jakarta')->startOfWeek(CarbonImmutable::MONDAY)->startOfDay();

        return [$start, $start->addWeek()];
    }

    private function weeklyXp(): array
    {
        [$start, $end] = $this->week();

        return DB::table('gamification_rewards')->where('activity_on', '>=', $start->toDateString())->where('activity_on', '<', $end->toDateString())
            ->groupBy('user_id')->selectRaw('user_id, SUM(xp) AS xp')->pluck('xp', 'user_id')->all();
    }

    public function summary(User $user): array
    {
        $days = $this->activityDays([$user->id])[$user->id] ?? [];
        $start = CarbonImmutable::instance($user->created_at)->setTimezone('Asia/Jakarta')->startOfDay();
        $end = $start->addDays(6);
        $active = count(array_filter(array_keys($days), fn ($day) => $day >= $start->toDateString() && $day <= $end->toDateString()));
        $achieved = $active >= 5;

        return ['streak_days' => $this->streakFromDays($days), 'weekly_xp' => (int) ($this->weeklyXp()[$user->id] ?? 0), 'challenge' => [
            'active_days' => $active, 'target_days' => 5, 'total_days' => 7,
            'starts_on' => $start->toDateString(), 'ends_on' => $end->toDateString(),
            'status' => $achieved ? 'achieved' : (now('Asia/Jakarta')->toDateString() > $end->toDateString() ? 'expired' : 'active'),
            'badge' => $achieved ? 'Pemula Konsisten' : null,
        ]];
    }

    public function leaderboard(User $current, string $scope): array
    {
        $today = now('Asia/Jakarta')->toDateString();
        $grants = DB::table('access_grants')->where('status', 'active')->where('starts_at', '<=', $today)->where('ends_at', '>=', $today)->get(['user_id', 'plan_code']);
        $categories = [];
        foreach ($grants as $grant) {
            if ($grant->plan_code === 'sensei' || ($grant->plan_code === 'lms' && ($categories[$grant->user_id] ?? null) !== 'sensei')) {
                $categories[$grant->user_id] = $grant->plan_code;
            }
        }
        $xp = $this->weeklyXp();
        $users = User::where('role', 'student')->where('account_status', 'active')->get(['id', 'name', 'avatar'])->filter(fn ($user) => $scope === 'all' || ($categories[$user->id] ?? 'free') === $scope)
            ->sort(function ($a, $b) use ($xp) {
                return ((int) ($xp[$b->id] ?? 0) <=> (int) ($xp[$a->id] ?? 0)) ?: ($a->id <=> $b->id);
            })->values();
        $selected = $users->take(20);
        $selfIndex = $users->search(fn ($user) => $user->id === $current->id);
        if ($selfIndex !== false && $selfIndex >= 20) {
            $selected->push($users[$selfIndex]);
        }
        $days = $this->activityDays($selected->pluck('id')->all());
        $rows = [];
        $self = null;
        foreach ($selected as $index => $user) {
            $rank = $index < 20 ? $index + 1 : $selfIndex + 1;
            $name = preg_replace('/[\x00-\x1f\x7f<>]/u', '', $user->name);
            if (preg_match('/@|\+?\d[\d\s().-]{6,}\d/u', $name)) {
                $name = 'Student '.$user->id;
            }
            $row = ['user_id' => $user->id, 'rank' => $rank, 'name' => $name, 'avatar_url' => app(MediaService::class)->url($user->avatar),
                'category' => $categories[$user->id] ?? 'free', 'weekly_xp' => (int) ($xp[$user->id] ?? 0),
                'streak_days' => $this->streakFromDays($days[$user->id] ?? []), 'is_current_user' => $user->id === $current->id];
            if ($row['is_current_user']) {
                $self = $row;
            }
            $rows[] = $row;
        }
        [$start, $end] = $this->week();

        return ['scope' => $scope, 'week_start' => $start->toIso8601String(), 'week_end' => $end->toIso8601String(), 'entries' => $rows, 'self' => $self];
    }
}
