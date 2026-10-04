<?php

namespace App\Http\Controllers;

use App\Models\PlacementAttempt;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AdminPlacementLeadController extends Controller
{
    public function index()
    {
        return response()->json(['data' => PlacementAttempt::orderByDesc('id')->get()->map(fn ($attempt) => [
            'id' => $attempt->id,
            'date' => $attempt->started_at->toISOString(),
            'name' => $attempt->applicant_snapshot['name'],
            'whatsapp' => $attempt->applicant_snapshot['whatsapp'],
            'target' => $attempt->applicant_snapshot['target'],
            'whatsapp_consent' => $attempt->applicant_snapshot['whatsappConsent'] ?? false,
            'score' => $attempt->result_snapshot['percentage'] ?? null,
            'recommended_level' => $attempt->result_snapshot['recommendation_level'] ?? null,
            'attempt_status' => $attempt->status,
            'status' => DB::table('placement_lead_contacts')->where('placement_attempt_id', $attempt->id)->value('status') ?? 'new',
        ])]);
    }

    public function update(Request $request, PlacementAttempt $attempt)
    {
        $data = $request->validate(['status' => ['required', 'in:new,contacted']]);
        DB::table('placement_lead_contacts')->upsert([['placement_attempt_id' => $attempt->id, 'status' => $data['status'], 'created_at' => now(), 'updated_at' => now()]], ['placement_attempt_id'], ['status', 'updated_at']);

        return response()->json(['data' => ['id' => $attempt->id, 'status' => $data['status']]]);
    }
}
