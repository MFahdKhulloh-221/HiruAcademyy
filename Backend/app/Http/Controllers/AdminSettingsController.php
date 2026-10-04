<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class AdminSettingsController extends Controller
{
    private const RULES = [
        'general' => ['siteName' => 'required|string|max:255', 'locale' => 'required|in:id-ID', 'timezone' => 'required|in:Asia/Jakarta'],
        'branding' => ['logoUrl' => 'nullable|url:http,https|max:2048', 'faviconUrl' => 'nullable|url:http,https|max:2048', 'companyLabel' => 'required|string|max:255'],
        'contact' => ['whatsappNumber' => 'nullable|regex:/^\+?\d{8,15}$/', 'supportEmail' => 'nullable|email|max:255', 'address' => 'nullable|string|max:5000', 'instagramUrl' => 'nullable|url:https|max:2048'],
        'integrations' => ['ga4Enabled' => 'required|boolean', 'ga4MeasurementId' => 'nullable|regex:/^G-[A-Z0-9]+$/i', 'metaEnabled' => 'required|boolean', 'metaPixelId' => 'nullable|regex:/^\d{5,20}$/', 'meetingProvider' => 'required|in:Manual,Zoom,Google Meet,Lainnya', 'senderName' => 'nullable|string|max:255', 'senderEmail' => 'nullable|email|max:255'],
        'privacy' => ['privacyPolicyPath' => 'required|regex:#^/(?!/)[a-zA-Z0-9/_-]*$#', 'termsPath' => 'required|regex:#^/(?!/)[a-zA-Z0-9/_-]*$#', 'analyticsConsentRequired' => 'required|boolean'],
    ];

    public function index(): JsonResponse
    {
        return response()->json(['data' => DB::table('admin_settings')->get()->mapWithKeys(fn ($row) => [$row->section => json_decode($row->value, true)])]);
    }

    public function update(Request $request): JsonResponse
    {
        $input = $request->validate(['section' => ['required', Rule::in(array_keys(self::RULES))], 'value' => ['required', 'array']]);
        $rules = self::RULES[$input['section']];
        $data = validator($input['value'], $rules)->validate();
        if ($input['section'] === 'integrations') {
            validator($data, ['ga4MeasurementId' => 'required_if:ga4Enabled,true', 'metaPixelId' => 'required_if:metaEnabled,true'])->validate();
        }
        DB::table('admin_settings')->upsert([['section' => $input['section'], 'value' => json_encode($data), 'created_at' => now(), 'updated_at' => now()]], ['section'], ['value', 'updated_at']);

        return $this->index();
    }
}
