<?php

namespace Tests\Unit;

use App\Http\Resources\ProgramAchievementResource;
use App\Models\ProgramAchievement;
use App\Services\CertificateIssuerSettings;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\ValidationException;
use PHPUnit\Framework\TestCase;

class CertificateIssuerSettingsTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $container = new \Illuminate\Container\Container;
        $container->instance('validator', new \Illuminate\Validation\Factory(
            new \Illuminate\Translation\Translator(new \Illuminate\Translation\ArrayLoader, 'id'), $container,
        ));
        \Illuminate\Support\Facades\Facade::setFacadeApplication($container);
    }

    protected function tearDown(): void
    {
        \Illuminate\Support\Facades\Facade::clearResolvedInstances();
        \Illuminate\Support\Facades\Facade::setFacadeApplication(null);
        parent::tearDown();
    }

    private function png(int $width = 600, int $height = 200, bool $transparent = true): string
    {
        $image = imagecreatetruecolor($width, $height);
        imagealphablending($image, false);
        imagesavealpha($image, true);
        imagefill($image, 0, 0, imagecolorallocatealpha($image, 255, 255, 255, $transparent ? 127 : 0));
        imageline($image, 30, 100, 570, 110, imagecolorallocatealpha($image, 0, 0, 0, 0));
        ob_start();
        imagepng($image);
        $bytes = ob_get_clean();
        imagedestroy($image);

        return $bytes;
    }

    private function sanitize(string $bytes): string
    {
        $path = tempnam(sys_get_temp_dir(), 'issuer-test-');
        try {
            file_put_contents($path, $bytes);

            // Filename and declared MIME deliberately lie; decoded content is authoritative.
            return (new CertificateIssuerSettings)->sanitize(new UploadedFile($path, 'signature.jpg', 'image/jpeg', null, true));
        } finally {
            unlink($path);
        }
    }

    public function test_sanitizes_actual_png_and_keeps_transparent_pixels(): void
    {
        $uri = $this->sanitize($this->png());
        $this->assertSame($uri, CertificateIssuerSettings::safeDataUrl($uri));
        $image = imagecreatefromstring(base64_decode(explode(',', $uri, 2)[1]));
        $this->assertSame(127, imagecolorsforindex($image, imagecolorat($image, 0, 0))['alpha']);
        $this->assertSame(0, imagecolorsforindex($image, imagecolorat($image, 30, 100))['alpha']);
        imagedestroy($image);
    }

    public function test_rejects_wrong_dimensions_opaque_background_truncation_and_oversize(): void
    {
        $png = $this->png();
        foreach ([$this->png(599), $this->png(600, 201), $this->png(600, 200, false), substr($png, 0, -8), $png.'trailing script', str_repeat('x', CertificateIssuerSettings::MAX_BYTES + 1), '<svg></svg>'] as $bytes) {
            try {
                $this->sanitize($bytes);
                $this->fail('Invalid signature accepted.');
            } catch (ValidationException $exception) {
                $this->assertArrayHasKey('signature', $exception->errors());
            }
        }
    }

    public function test_resource_uses_only_snapshot_and_safe_legacy_defaults(): void
    {
        $uri = $this->sanitize($this->png());
        $award = (new ProgramAchievement)->forceFill(['presentation_snapshot' => [
            'signature_data_url' => $uri, 'signature_position' => 'bottom-left',
        ]]);
        $resource = (new ProgramAchievementResource($award))->toArray(Request::create('/'));
        $this->assertSame($uri, $resource['presentation_snapshot']['signature_data_url']);
        $this->assertSame('bottom-left', $resource['presentation_snapshot']['signature_position']);
        foreach ([[], ['signature_data_url' => 'javascript:alert(1)', 'signature_position' => 'bad']] as $snapshot) {
            $award->presentation_snapshot = $snapshot;
            $resource = (new ProgramAchievementResource($award))->toArray(Request::create('/'));
            $this->assertNull($resource['presentation_snapshot']['signature_data_url']);
            $this->assertSame('bottom-right', $resource['presentation_snapshot']['signature_position']);
        }
    }
}
