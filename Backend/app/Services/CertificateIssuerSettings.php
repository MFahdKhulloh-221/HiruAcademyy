<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CertificateIssuerSettings
{
    public const MAX_BYTES = 2 * 1024 * 1024;

    public function resolve(): array
    {
        $settings = DB::table('certificate_issuer_settings')->where('id', 1)->first();

        return [
            'signature_data_url' => self::safeDataUrl($settings?->signature_data_url),
            'signature_position' => ($settings?->signature_position === 'bottom-left') ? 'bottom-left' : 'bottom-right',
        ];
    }

    public function update(array $changes): array
    {
        // Update only supplied columns; concurrent position-only edits must not restore old images.
        if ($changes !== []) {
            DB::table('certificate_issuer_settings')->where('id', 1)->update($changes);
        }

        return $this->resolve();
    }

    public function sanitize(UploadedFile $file): string
    {
        $invalid = static fn (string $message = 'Berkas tanda tangan harus berupa PNG yang valid.') => ValidationException::withMessages([
            'signature' => $message,
        ]);
        if (! $file->isValid()) {
            throw $invalid('Unggahan tanda tangan gagal. Silakan coba lagi.');
        }
        if ($file->getSize() > self::MAX_BYTES) {
            throw $invalid('Ukuran tanda tangan maksimal 2 MB.');
        }
        $bytes = file_get_contents($file->getRealPath());
        if (! is_string($bytes) || strlen($bytes) > self::MAX_BYTES || ! self::validPng($bytes)) {
            throw $invalid();
        }
        // Check dimensions before decoding to bound pixel allocation independently of compression.
        $size = @getimagesizefromstring($bytes);
        if ($size === false || $size[2] !== IMAGETYPE_PNG) {
            throw $invalid();
        }
        if ($size[0] !== 600 || $size[1] !== 200) {
            throw $invalid('Dimensi tanda tangan harus tepat 600 × 200 piksel.');
        }
        if (! function_exists('imagecreatefromstring')) {
            abort(503, 'Pemrosesan PNG tidak tersedia. Silakan coba lagi nanti.');
        }
        $image = @imagecreatefromstring($bytes);
        if ($image === false) {
            throw $invalid();
        }
        try {
            // Inspect actual decoded alpha, including palette PNG transparency, not MIME or alpha flags.
            for ($y = 0; $y < 200; $y++) {
                for ($x = 0; $x < 600; $x++) {
                    if ($x !== 0 && $x !== 599 && $y !== 0 && $y !== 199) {
                        continue;
                    }
                    if (imagecolorsforindex($image, imagecolorat($image, $x, $y))['alpha'] !== 127) {
                        throw $invalid('Latar tanda tangan harus transparan, termasuk seluruh piksel di tepi gambar.');
                    }
                }
            }
            imagepalettetotruecolor($image);
            imagealphablending($image, false);
            imagesavealpha($image, true);
            ob_start();
            try {
                $encoded = imagepng($image, null, 9);
                $clean = ob_get_contents();
            } finally {
                ob_end_clean();
            }
            if (! $encoded || ! is_string($clean) || strlen($clean) > self::MAX_BYTES) {
                throw $invalid();
            }

            return 'data:image/png;base64,'.base64_encode($clean);
        } finally {
            imagedestroy($image);
        }
    }

    public static function safeDataUrl(mixed $value): ?string
    {
        $prefix = 'data:image/png;base64,';
        if (! is_string($value) || ! str_starts_with($value, $prefix)
            || strlen($value) > strlen($prefix) + 4 * (int) ceil(self::MAX_BYTES / 3)) {
            return null;
        }
        $bytes = base64_decode(substr($value, strlen($prefix)), true);
        if ($bytes === false || strlen($bytes) > self::MAX_BYTES || ! self::validPng($bytes)) {
            return null;
        }
        $size = @getimagesizefromstring($bytes);

        return $size !== false && $size[0] === 600 && $size[1] === 200 && $size[2] === IMAGETYPE_PNG ? $value : null;
    }

    private static function validPng(string $bytes): bool
    {
        if (! str_starts_with($bytes, "\x89PNG\r\n\x1a\n")) {
            return false;
        }
        $offset = 8;
        $hasData = false;
        $length = strlen($bytes);
        while ($offset + 12 <= $length) {
            $size = unpack('N', substr($bytes, $offset, 4))[1];
            if ($size > $length - $offset - 12) {
                return false;
            }
            $type = substr($bytes, $offset + 4, 4);
            if (($offset === 8 && ($type !== 'IHDR' || $size !== 13)) || $type === 'acTL'
                || hash('crc32b', substr($bytes, $offset + 4, $size + 4), true) !== substr($bytes, $offset + 8 + $size, 4)) {
                return false;
            }
            $hasData = $hasData || $type === 'IDAT';
            $offset += $size + 12;
            if ($type === 'IEND') {
                return $size === 0 && $hasData && $offset === $length;
            }
        }

        return false;
    }
}
