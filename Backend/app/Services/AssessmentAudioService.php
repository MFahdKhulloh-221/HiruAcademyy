<?php

namespace App\Services;

use App\Models\Chapter;
use App\Models\CheckpointAttempt;
use App\Models\CheckpointPackage;
use App\Models\DailyPractice;
use App\Models\DailyPracticeAttempt;
use App\Models\LearningAttempt;
use App\Models\PlacementAttempt;
use App\Models\TryOut;
use App\Models\TryOutAttempt;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class AssessmentAudioService
{
    public const ATTEMPTS = [
        'learning' => LearningAttempt::class,
        'placement' => PlacementAttempt::class,
        'tryout' => TryOutAttempt::class,
        'checkpoint' => CheckpointAttempt::class,
        'daily-practice' => DailyPracticeAttempt::class,
    ];

    public function handle(Request $request, string $domain, string $id, string $questionId, string $action, ?string $token): array
    {
        abort_unless(isset(self::ATTEMPTS[$domain]), 404);

        return DB::transaction(function () use ($request, $domain, $id, $questionId, $action, $token) {
            // Serialize on existing attempt, including first claim; unique index remains final guard.
            $attempt = self::ATTEMPTS[$domain]::whereKey($id)->lockForUpdate()->firstOrFail();
            $questions = $this->authorize($request, $domain, $attempt);
            $question = collect($questions)->first(fn ($item) => (string) $item['id'] === $questionId);
            abort_unless($question && is_string($question['audio_url'] ?? null) && trim($question['audio_url']) !== '', 404);
            $key = self::audioKey($question['audio_url']);
            $identity = ['attempt_type' => $domain, 'attempt_id' => $attempt->id, 'audio_key' => $key];
            $query = DB::table('assessment_audio_plays')->where($identity);
            $play = $query->first();
            $used = $play?->used_at !== null;
            $reserved = $play !== null && ! $used && now()->lt(Carbon::parse($play->reserved_until));
            $owns = $play !== null && $token !== null && hash_equals($play->token, $token);

            if ($action === 'reserve') {
                abort_if($used || ($reserved && ! $owns), 409, 'Audio already used or reserved.');
                if (! $reserved) {
                    $query->delete();
                    DB::table('assessment_audio_plays')->insert($identity + ['token' => $token, 'reserved_until' => now()->addSeconds(30), 'used_at' => null]);
                }
            } elseif ($action === 'commit') {
                // ponytail: records playback authorization, not proof of sound; protected streaming needed beyond cooperative clients.
                abort_unless($owns && ($used || $reserved), 409, 'Audio reservation expired or unavailable.');
                if (! $used) {
                    $query->update(['used_at' => now()]);
                }
            } elseif ($action === 'release') {
                // A committed allowance is never refundable, including same-token retries.
                abort_unless($owns && ! $used, 409, 'Audio reservation unavailable.');
                $query->delete();
            }

            $play = $query->first();
            $status = $play?->used_at !== null ? 'used' : ($play !== null && now()->lt(Carbon::parse($play->reserved_until)) ? 'reserved' : 'available');

            return ['status' => $status, 'audio_key' => $key, 'expires_at' => $status === 'reserved' ? Carbon::parse($play->reserved_until)->toISOString() : null];
        }, 3);
    }

    private function authorize(Request $request, string $domain, Model $attempt): array
    {
        $payload = [];
        if ($domain === 'placement') {
            app(PlacementService::class)->authorize($request, $attempt);
            $questions = app(PlacementService::class)->attemptPayload($attempt)['questions'];
        } else {
            $user = $request->user('sanctum');
            abort_unless($user && $user->role === 'student' && $user->account_status === 'active', 403);
            if ($domain === 'learning') {
                $chapter = Chapter::findOrFail($attempt->chapter_id);
                $service = app(LearningAttemptService::class);
                $service->authorize($user, $chapter->program, $chapter, $attempt);
                $payload = $service->payload($attempt);
            } else {
                [$serviceClass, $parentClass, $parentKey] = match ($domain) {
                    'tryout' => [TryOutAttemptService::class, TryOut::class, 'try_out_id'],
                    'checkpoint' => [CheckpointAttemptService::class, CheckpointPackage::class, 'checkpoint_package_id'],
                    'daily-practice' => [DailyPracticeAttemptService::class, DailyPractice::class, 'daily_practice_id'],
                };
                $service = app($serviceClass);
                $service->authorize($user, $parentClass::findOrFail($attempt->{$parentKey}), $attempt);
                $payload = $service->payload($attempt);
            }
            $questions = $payload['questions'];
        }
        abort_unless($attempt->status === 'in_progress' && $attempt->getAttribute('abandoned_at') === null, 409, 'Attempt is not active.');
        $expires = $payload['expires_at'] ?? $attempt->expires_at;
        abort_if($expires !== null && now()->gte(Carbon::parse($expires)), 409, 'Attempt deadline reached.');
        if ($domain === 'tryout' && ($attempt->grading_snapshot['timing_mode'] ?? null) === 'per_session') {
            abort_unless($attempt->phase === 'session', 409, 'Attempt is not in an active session.');
        }

        // Match issued/visible IDs, but hash original immutable reference, never signed payload URL.
        $ids = array_map('strval', array_column($questions, 'id'));

        return array_values(array_filter($attempt->content_snapshot, fn ($question) => in_array((string) $question['id'], $ids, true)));
    }

    public static function audioKey(string $reference): string
    {
        $parts = parse_url(trim($reference));
        $path = $parts['path'] ?? trim($reference);
        if (preg_match('~(?:^|/)(media/audio/[0-9a-f-]{36}\.[a-z0-9]+)$~D', $path, $match) && app(MediaService::class)->managed($match[1], 'audio')) {
            return hash('sha256', $match[1]);
        }
        if ($parts !== false && isset($parts['host'])) {
            $identity = strtolower($parts['scheme'] ?? 'https').'://'.strtolower($parts['host']).(isset($parts['port']) ? ':'.$parts['port'] : '').($parts['path'] ?? '/');
            // Keep semantic query params; discard signatures/expiry, which are not audio identity.
            parse_str($parts['query'] ?? '', $query);
            foreach (array_keys($query) as $name) {
                if (preg_match('/^(?:x-amz-|x-goog-|signature$|expires$|awsaccesskeyid$)/i', $name)) {
                    unset($query[$name]);
                }
            }
            ksort($query);
            $identity .= $query === [] ? '' : '?'.http_build_query($query);
        } else {
            $identity = ltrim(trim($reference), '/');
        }

        return hash('sha256', $identity);
    }
}
