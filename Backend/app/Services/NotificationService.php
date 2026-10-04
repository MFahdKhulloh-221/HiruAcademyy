<?php

namespace App\Services;

use App\Models\NotificationContent;
use App\Models\NotificationRead;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class NotificationService
{
    public const TYPES = ['Pengumuman', 'Belajar', 'Kelas', 'Achievement', 'Akun'];

    public const AUDIENCES = ['All', 'Free', 'Mandiri', 'Sensei'];

    public const LEVELS = ['n5', 'n4', 'n3', 'n2'];

    public const PRESETS = [
        'None' => null,
        'chapter' => '/learn/n4/chapter-4',
        'schedule' => '/schedule',
        'replay' => '/replay',
        'certificate' => '/certificate',
        'tryout' => '/tryout',
        'invoice' => '/invoice',
        'custom' => null,
    ];

    public function __construct(private EntitlementService $entitlements) {}

    public function save(array $input, ?NotificationContent $content = null): NotificationContent
    {
        $content ??= new NotificationContent;
        $required = $content->exists ? 'sometimes' : 'required';
        $rules = [
            'type' => [$required, 'required', Rule::in(self::TYPES)],
            'title' => [$required, 'required', 'string', 'max:255'],
            'body' => [$required, 'required', 'string'],
            'cta_label' => ['sometimes', 'nullable', 'string', 'max:255'],
            'preset' => ['sometimes', 'required', Rule::in(array_keys(self::PRESETS))],
            'path' => ['sometimes', 'nullable', 'string', 'max:2048'],
            'audience' => ['sometimes', 'required', Rule::in(self::AUDIENCES)],
            'level' => ['sometimes', 'nullable', Rule::in(self::LEVELS)],
            'status' => ['sometimes', 'required', Rule::in(['draft', 'published'])],
            'time' => ['sometimes', 'nullable', 'string', 'date', 'regex:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/D'],
        ];
        $this->only($input, array_keys($rules));
        $data = Validator::make($input, $rules)->validate();
        $preset = $data['preset'] ?? $content->preset;
        $changed = $preset !== $content->preset;
        $path = array_key_exists('path', $data) ? $data['path'] : ($changed ? null : $content->path);
        $label = array_key_exists('cta_label', $data) ? $data['cta_label'] : $content->cta_label;
        if ($preset === 'None') {
            if ((array_key_exists('path', $data) && $path !== null) || (array_key_exists('cta_label', $data) && $label !== null)) {
                throw ValidationException::withMessages(['preset' => 'None requires null path and CTA label.']);
            }
            $path = $label = null;
        } else {
            if (! is_string($label) || trim($label) === '') {
                throw ValidationException::withMessages(['cta_label' => 'CTA label is required.']);
            }
            if ($preset === 'custom') {
                if (! $this->safePath($path)) {
                    throw ValidationException::withMessages(['path' => 'Requires a safe unencoded internal path.']);
                }
            } else {
                if (array_key_exists('path', $data) && $path !== self::PRESETS[$preset]) {
                    throw ValidationException::withMessages(['path' => 'Path must match the selected preset.']);
                }
                $path = self::PRESETS[$preset];
            }
        }
        $data['path'] = $path;
        $data['cta_label'] = $label;
        if (isset($data['time'])) {
            $data['time'] = CarbonImmutable::parse($data['time'])->utc();
        }
        $content->fill($data)->save();

        return $content->fresh();
    }

    private function safePath(mixed $path): bool
    {
        if (! is_string($path) || ! preg_match('#^/(?:[A-Za-z0-9._~-]+/)*[A-Za-z0-9._~-]*$#D', $path)) {
            return false;
        }

        return ! str_contains($path, '//') && ! str_contains($path, '~')
            && ! array_intersect(explode('/', $path), ['.', '..']);
    }

    public function visible(User $user): Builder
    {
        $sources = $this->entitlements->effectiveAccess($user)['source_grants'];
        $plans = [
            'Mandiri' => array_values(array_filter($sources, fn ($grant) => $grant['plan_code'] === 'lms'
                && in_array($grant['program_code'], ['n5', 'n4', 'n3', 'n2', 'n1', 'ssw-food', 'interview'], true))),
            'Sensei' => array_values(array_filter($sources, fn ($grant) => $grant['plan_code'] === 'sensei'
                && in_array($grant['program_code'], ['n5', 'n4', 'n3', 'n2', 'n1'], true))),
        ];
        $allLevels = array_values(array_intersect(self::LEVELS, array_column(array_merge(...array_values($plans)), 'program_code')));

        return NotificationContent::query()->where('status', 'published')->where(function (Builder $query) use ($sources, $plans, $allLevels) {
            $query->where(function (Builder $query) use ($allLevels) {
                $query->where('audience', 'All')->where(fn (Builder $query) => $query->whereNull('level')->orWhereIn('level', $allLevels));
            });
            if ($sources === []) {
                $query->orWhere(fn (Builder $query) => $query->where('audience', 'Free')->whereNull('level'));
            }
            foreach ($plans as $audience => $grants) {
                if ($grants !== []) {
                    $levels = array_values(array_intersect(self::LEVELS, array_column($grants, 'program_code')));
                    $query->orWhere(fn (Builder $query) => $query->where('audience', $audience)
                        ->where(fn (Builder $query) => $query->whereNull('level')->orWhereIn('level', $levels)));
                }
            }
        });
    }

    public function listing(User $user): array
    {
        return $this->visible($user)->with(['reads' => fn ($query) => $query->where('user_id', $user->id)])
            ->orderByDesc('id')->get()->map(function (NotificationContent $content) {
                $data = $content->attributesToArray();
                $data['read_at'] = $content->reads->first()?->read_at?->toISOString();
                $data['read'] = $data['read_at'] !== null;

                return $data;
            })->all();
    }

    public function mark(User $user, string $id, array $input): array
    {
        $this->only($input, ['read']);
        $data = Validator::make($input, ['read' => ['required', 'boolean']])->validate();
        $content = $this->visible($user)->findOrFail($id);
        if ($data['read']) {
            $this->insertReads($user, [$content->id]);
        } else {
            NotificationRead::where('user_id', $user->id)->where('notification_content_id', $content->id)->delete();
        }
        $read = NotificationRead::where('user_id', $user->id)->where('notification_content_id', $content->id)->first();

        return ['id' => $content->id, 'read' => $read !== null, 'read_at' => $read?->read_at?->toISOString()];
    }

    public function readAll(User $user, array $input): void
    {
        $this->only($input, []);
        $this->visible($user)->select('notification_contents.id')->chunkById(500, function ($contents) use ($user) {
            $this->insertReads($user, $contents->pluck('id')->all());
        });
    }

    private function insertReads(User $user, array $ids): void
    {
        $now = now()->utc()->format('Y-m-d H:i:s.uP');
        NotificationRead::upsert(array_map(fn ($id) => [
            'user_id' => $user->id, 'notification_content_id' => $id,
            'read_at' => $now, 'created_at' => $now, 'updated_at' => $now,
        ], $ids), ['user_id', 'notification_content_id'], ['notification_content_id']);
    }

    private function only(array $input, array $fields): void
    {
        $unknown = array_diff(array_keys($input), $fields);
        if ($unknown !== []) {
            throw ValidationException::withMessages(array_fill_keys($unknown, 'Field is prohibited.'));
        }
    }

    public function id(mixed $value): string
    {
        $id = (string) $value;
        abort_unless(preg_match('/^[1-9][0-9]*$/D', $id)
            && (strlen($id) < 19 || (strlen($id) === 19 && strcmp($id, '9223372036854775807') <= 0)), 404);

        return $id;
    }
}
