<?php

namespace App\Services;

use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

class LandingHeroService
{
    private const SECTION = 'landing_hero';

    private const TEXT_LIMITS = [
        'eyebrow' => 160,
        'heading' => 300,
        'support' => 1000,
        'primaryCtaLabel' => 80,
        'secondaryCtaLabel' => 80,
    ];

    public function snapshot(): array
    {
        return $this->decode($this->query()->value('value'));
    }

    public function published(): ?array
    {
        return $this->snapshot()['published'];
    }

    public function saveDraft(array $input): array
    {
        $data = Validator::make($input, [
            'revision' => ['required', 'integer', 'min:0', 'max:2147483646'],
            'hero' => ['required', 'array:eyebrow,heading,support,primaryCtaLabel,primaryCtaPath,secondaryCtaLabel,secondaryCtaPath,slider'],
            'hero.slider' => ['sometimes', 'required', 'array:autoplay,intervalMs,slides'],
        ])->validate();
        $hero = $this->validateHero($data['hero']);

        if (array_key_exists('slider', $data['hero'])) {
            return app(MediaService::class)->locked(function () use ($data, $hero) {
                $hero['slider'] = app(HeroSliderConfiguration::class)->validate($data['hero']['slider']);
                return $this->mutate((int) $data['revision'], $hero);
            });
        }

        return $this->mutate((int) $data['revision'], $hero);
    }

    public function publish(array $input): array
    {
        $data = Validator::make($input, [
            'revision' => ['required', 'integer', 'min:0', 'max:2147483646'],
        ])->validate();

        return app(MediaService::class)->locked(fn () => $this->mutate((int) $data['revision']));
    }

    private function validateHero(array $hero): array
    {
        $plain = static function ($attribute, $value, $fail): void {
            if (is_string($value) && (trim($value) === '' || preg_match('/[<>\p{C}]|&(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]+);/iu', $value))) {
                $fail('The '.$attribute.' must contain plain text only.');
            }
        };
        $rules = [];
        foreach (self::TEXT_LIMITS as $field => $limit) {
            $rules[$field] = ['required', 'string', 'max:'.$limit, $plain];
        }
        foreach (['primaryCtaPath', 'secondaryCtaPath'] as $field) {
            // ponytail: canonical paths/anchors only; add query support only with an explicit product need.
            $rules[$field] = ['required', 'string', 'max:255', 'regex:~\A(?:/(?:[a-zA-Z0-9_-]+(?:/[a-zA-Z0-9_-]+)*/?)?(?:\#[a-zA-Z][a-zA-Z0-9_-]*)?|\#[a-zA-Z][a-zA-Z0-9_-]*)\z~'];
        }

        return Validator::make($hero, $rules)->validate();
    }

    private function mutate(int $revision, ?array $hero = null): array
    {
        $previous = $this->query()->value('value');
        $state = $this->decode($previous);
        if ($state['revision'] !== $revision) {
            throw new ConflictHttpException('Hero revision is stale. Reload before saving.');
        }
        if ($hero === null) {
            if ($state['draft'] === null) {
                throw ValidationException::withMessages(['hero' => 'Save a draft before publishing.']);
            }
            $state['published'] = $this->validateHero($state['draft']);
            if (isset($state['draft']['slider'])) {
                $state['published']['slider'] = app(HeroSliderConfiguration::class)->validate($state['draft']['slider'], true);
            }
        } else {
            $state['draft'] = $hero;
        }
        $state['revision']++;
        $values = ['value' => json_encode($state, JSON_THROW_ON_ERROR), 'updated_at' => now()];
        if ($previous === null) {
            // The section primary key makes concurrent first saves conflict, never overwrite.
            $changed = DB::table('admin_settings')->insertOrIgnore([
                'section' => self::SECTION, ...$values, 'created_at' => now(),
            ]);
        } else {
            // PostgreSQL JSONB equality compares the entire previous snapshot atomically.
            $changed = $this->query()->where('value', $previous)->update($values);
        }
        if ($changed !== 1) {
            throw new ConflictHttpException('Hero changed while saving. Reload before saving.');
        }

        return $state;
    }

    private function query(): Builder
    {
        return DB::table('admin_settings')->where('section', self::SECTION);
    }

    private function decode(?string $value): array
    {
        return $value === null
            ? ['draft' => null, 'published' => null, 'revision' => 0]
            : json_decode($value, true, 512, JSON_THROW_ON_ERROR);
    }
}
