<?php

namespace App\Http\Controllers;

use App\Services\CertificateIssuerSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AdminCertificateIssuerController extends Controller
{
    public function __construct(private CertificateIssuerSettings $settings) {}

    public function show(): JsonResponse
    {
        return response()->json(['data' => $this->settings->resolve()])->header('Cache-Control', 'private, no-store');
    }

    public function update(Request $request): JsonResponse
    {
        $unknown = array_diff(array_keys($request->all()), ['signature', 'signature_position', 'remove_signature']);
        if ($unknown !== []) {
            throw ValidationException::withMessages(array_fill_keys($unknown, 'Pengaturan penerbit tidak didukung.'));
        }
        $input = $request->validate([
            'signature' => ['sometimes', 'required', 'file', 'max:2048'],
            'signature_position' => ['sometimes', 'required', Rule::in(['bottom-left', 'bottom-right'])],
            'remove_signature' => ['sometimes', 'required', 'boolean'],
        ], [
            'signature.required' => 'Pilih berkas tanda tangan.',
            'signature.file' => 'Unggahan tanda tangan harus berupa berkas.',
            'signature.max' => 'Ukuran tanda tangan maksimal 2 MB.',
            'signature.uploaded' => 'Unggahan tanda tangan gagal. Ukuran maksimal 2 MB.',
            'signature_position.required' => 'Pilih posisi tanda tangan.',
            'signature_position.in' => 'Posisi tanda tangan harus kiri bawah atau kanan bawah.',
            'remove_signature.required' => 'Status penghapusan tanda tangan wajib diisi.',
            'remove_signature.boolean' => 'Status penghapusan tanda tangan tidak valid.',
        ]);
        $changes = array_intersect_key($input, ['signature_position' => true]);
        if ($request->boolean('remove_signature')) {
            if (isset($input['signature'])) {
                throw ValidationException::withMessages(['signature' => 'Unggah dan hapus tanda tangan tidak dapat dilakukan bersamaan.']);
            }
            $changes['signature_data_url'] = null;
        } elseif (isset($input['signature'])) {
            $changes['signature_data_url'] = $this->settings->sanitize($input['signature']);
        }

        return response()->json(['data' => $this->settings->update($changes)])->header('Cache-Control', 'private, no-store');
    }
}
