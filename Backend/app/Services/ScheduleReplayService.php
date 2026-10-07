<?php

namespace App\Services;

use App\Models\ClassSchedule;
use App\Models\Program;
use App\Models\ReplayPlaylist;
use App\Models\ReplayVideo;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ScheduleReplayService
{
    public const RESOURCES = [
        'class-schedules' => ClassSchedule::class,
        'replay-playlists' => ReplayPlaylist::class,
        'replay-videos' => ReplayVideo::class,
    ];

    public const LEVELS = ['n5', 'n4', 'n3', 'n2', 'n1'];

    public function model(string $resource): string
    {
        abort_unless(isset(self::RESOURCES[$resource]), 404);

        return self::RESOURCES[$resource];
    }

    public function save(string $resource, array $input, ?Model $model = null): Model
    {
        return app(MediaService::class)->locked(fn () => $this->saveContent($resource, $input, $model));
    }

    private function saveContent(string $resource, array $input, ?Model $model): Model
    {
        $class = $this->model($resource);
        $model ??= new $class;
        $required = $model->exists ? 'sometimes' : 'required';
        $rules = [
            'title' => [$required, 'required', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string'],
            'sort_order' => ['sometimes', 'required', 'integer', 'min:0', 'max:2147483647'],
            'status' => ['sometimes', 'required', Rule::in($resource === 'class-schedules' ? ['draft', 'published', 'cancelled'] : ['draft', 'published'])],
        ];
        $url = function ($attribute, $value, $fail) {
            $parts = is_string($value) ? parse_url($value) : false;
            if ($parts === false || isset($parts['user']) || isset($parts['pass'])) {
                $fail('URL must not contain credentials.');
            }
        };
        if ($resource !== 'replay-playlists') {
            foreach (['chapter', 'session', 'sensei_name'] as $field) {
                $rules[$field] = ['sometimes', 'nullable', 'string', 'max:255'];
            }
        }
        $rules += match ($resource) {
            'class-schedules' => [
                'program_id' => [$required, 'required', 'integer', 'exists:programs,id'],
                'scheduled_at' => [$required, 'required', 'string', 'date', 'regex:/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})?$/D'],
                'duration_minutes' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:2147483647'],
                'meeting_url' => ['sometimes', 'nullable', 'url:http,https', $url],
            ],
            'replay-playlists' => ['program_id' => [$required, 'required', 'integer', 'exists:programs,id']],
            'replay-videos' => [
                'replay_playlist_id' => [$required, 'required', 'integer', 'exists:replay_playlists,id'],
                'video_url' => ['sometimes', 'nullable', 'string', app(MediaService::class)->rule('video')],
                'recorded_at' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            ],
        };
        $unknown = array_diff(array_keys($input), array_keys($rules));
        if ($unknown !== []) {
            throw ValidationException::withMessages(array_fill_keys($unknown, 'Field is prohibited.'));
        }
        $data = Validator::make($input, $rules)->validate();
        $model->fill($data);
        if ($resource !== 'replay-videos') {
            $program = Program::query()->whereKey($model->program_id)->where('family', 'jlpt')->whereIn('code', self::LEVELS)
                ->whereExists(fn ($query) => $query->selectRaw('1')->from('program_offers')->whereColumn('program_offers.program_id', 'programs.id')->where('plan_code', 'sensei'))
                ->exists();
            if (! $program) {
                throw ValidationException::withMessages(['program_id' => 'Requires a JLPT program with a Sensei offer identity.']);
            }
        }
        if (isset($data['scheduled_at'])) {
            $model->scheduled_at = CarbonImmutable::parse($data['scheduled_at'], config('app.timezone'))->utc();
        }

        return DB::transaction(function () use ($model) {
            if ($model instanceof ClassSchedule && $model->status === 'published' && $model->sensei_name && $model->duration_minutes) {
                DB::select('SELECT pg_advisory_xact_lock(hashtext(?))', ['schedule:'.mb_strtolower(trim($model->sensei_name))]);
                $start = $model->scheduled_at;
                $end = $start->addMinutes($model->duration_minutes);
                $conflict = ClassSchedule::where('status', 'published')->whereRaw('lower(trim(sensei_name)) = ?', [mb_strtolower(trim($model->sensei_name))])
                    ->when($model->exists, fn ($query) => $query->where('id', '!=', $model->id))
                    ->where('scheduled_at', '<', $end->toIso8601String())->whereNotNull('duration_minutes')
                    ->whereRaw("scheduled_at + duration_minutes * interval '1 minute' > CAST(? AS timestamptz)", [$start->toIso8601String()])->exists();
                if ($conflict) {
                    throw ValidationException::withMessages(['scheduled_at' => 'Konflik jadwal: Sensei sudah memiliki sesi pada waktu ini.']);
                }
            }
            $model->save();

            return $model->fresh();
        });
    }

    public function payload(Model $model): array
    {
        $data = $model->toArray();
        if ($model instanceof ClassSchedule) {
            $data['meeting_url'] = $model->meeting_url;
        } elseif ($model instanceof ReplayVideo) {
            $data['video_url'] = $model->video_url;
        }

        return app(MediaService::class)->payload($data);
    }
}
