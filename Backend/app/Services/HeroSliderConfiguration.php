<?php

namespace App\Services;

use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class HeroSliderConfiguration
{
    public function validate(array $input, bool $publishing = false): array
    {
        foreach ($input['slides'] ?? [] as $index => $slide) {
            if (! is_array($slide)) continue;
            foreach (['desktopSrc', 'mobileSrc', 'internalTitle', 'imageAlt', 'eyebrow', 'title', 'description', 'primaryLabel', 'primaryHref', 'secondaryLabel', 'secondaryHref'] as $key) {
                if (array_key_exists($key, $slide) && $slide[$key] === null) $input['slides'][$index][$key] = '';
            }
        }
        $text = static function ($attribute, $value, $fail): void {
            if (is_string($value) && preg_match('/[<>\p{C}]/u', $value)) $fail('Gunakan teks biasa.');
        };
        $link = static function ($attribute, $value, $fail): void {
            // ponytail: internal canonical paths/anchors only; external destinations require an explicit allowlist.
            if ($value !== '' && ! preg_match('~\A(?:/(?:[a-zA-Z0-9_-]+(?:/[a-zA-Z0-9_-]+)*/?)?(?:\#[a-zA-Z][a-zA-Z0-9_-]*)?|\#[a-zA-Z][a-zA-Z0-9_-]*)\z~', $value)) $fail('Gunakan path internal atau anchor yang valid. URL eksternal tidak diizinkan.');
        };
        $image = static function ($attribute, $value, $fail): void {
            if ($value === '' || $value === '/banners/hiru-hero-desktop.png') return;
            $media = app(MediaService::class);
            if (! $media->managed($value, 'image') || ! $media->valid($value, 'image')) $fail('Gunakan gambar hasil upload yang masih tersedia.');
        };
        $rules = [
            'autoplay' => ['required', 'boolean'],
            'intervalMs' => ['required', 'integer', 'min:3000', 'max:60000'],
            'slides' => ['present', 'array', 'max:20'],
            'slides.*' => ['required', 'array:id,internalTitle,order,active,desktopSrc,mobileSrc,imageAlt,eyebrow,title,description,showOverlay,showPrimary,primaryLabel,primaryHref,showSecondary,secondaryLabel,secondaryHref,desktopPosition,mobilePosition,offsetY,titleHighlights,ctaOffsetDesktop,ctaOffsetMobile'],
            'slides.*.id' => ['required', 'string', 'max:80', 'regex:/^[a-zA-Z0-9_-]+$/D', 'distinct'],
            'slides.*.order' => ['required', 'integer', 'min:0', 'max:19', 'distinct'],
            'slides.*.desktopSrc' => ['present', 'string', 'max:255', $image],
            'slides.*.mobileSrc' => ['present', 'string', 'max:255', $image],
            'slides.*.offsetY' => ['required', 'integer', 'min:-10', 'max:10'],
            'slides.*.ctaOffsetDesktop' => ['sometimes', 'integer', 'min:-100', 'max:100'],
            'slides.*.ctaOffsetMobile' => ['sometimes', 'integer', 'min:-100', 'max:100'],
            'slides.*.titleHighlights' => ['sometimes', 'array', 'max:300'],
            'slides.*.titleHighlights.*' => ['required', 'array:start,end'],
            'slides.*.titleHighlights.*.start' => ['required', 'integer', 'min:0', 'max:299'],
            'slides.*.titleHighlights.*.end' => ['required', 'integer', 'min:1', 'max:300'],
        ];
        foreach (['active', 'showOverlay', 'showPrimary', 'showSecondary'] as $key) $rules['slides.*.'.$key] = ['required', 'boolean'];
        foreach (['internalTitle' => 160, 'imageAlt' => 300, 'eyebrow' => 160, 'title' => 300, 'description' => 1000, 'primaryLabel' => 80, 'secondaryLabel' => 80] as $key => $limit) {
            $rules['slides.*.'.$key] = ['present', 'string', 'max:'.$limit, $text];
        }
        foreach (['desktopPosition', 'mobilePosition'] as $key) $rules['slides.*.'.$key] = ['required', Rule::in(['left', 'center', 'right'])];
        foreach (['primaryHref', 'secondaryHref'] as $key) $rules['slides.*.'.$key] = ['present', 'string', 'max:255', $link];
        $data = Validator::make($input, $rules)->validate();
        foreach ($data['slides'] as $index => $slide) {
            $end = 0;
            foreach ($slide['titleHighlights'] ?? [] as $range) {
                if ($range['start'] < $end || $range['start'] >= $range['end'] || $range['end'] > mb_strlen($slide['title'])) {
                    throw ValidationException::withMessages(["slides.$index.titleHighlights" => 'Rentang warna headline tidak valid.']);
                }
                $end = $range['end'];
            }
        }
        if ($publishing) {
            $active = array_filter($data['slides'], fn ($slide) => $slide['active']);
            if (! $active) throw ValidationException::withMessages(['hero.slider.slides' => 'Minimal satu slide aktif diperlukan.']);
            foreach ($active as $slide) {
                $errors = [];
                if (! $slide['desktopSrc'] || ! trim($slide['imageAlt']) || ! trim($slide['internalTitle'])) $errors[] = 'Gambar desktop, alt text, dan judul internal wajib diisi.';
                if ($slide['showOverlay'] && ! trim($slide['title'])) $errors[] = 'Headline wajib saat teks overlay aktif.';
                foreach (['Primary' => 'primary', 'Secondary' => 'secondary'] as $flag => $prefix) {
                    if ($slide['show'.$flag] && (! trim($slide[$prefix.'Label']) || ! $slide[$prefix.'Href'])) $errors[] = 'CTA aktif wajib memiliki label dan tujuan valid.';
                }
                if ($errors) throw ValidationException::withMessages(['hero.slider.slides' => $slide['internalTitle'].': '.implode(' ', $errors)]);
            }
        }
        usort($data['slides'], fn ($a, $b) => $a['order'] <=> $b['order']);

        return $data;
    }
}
