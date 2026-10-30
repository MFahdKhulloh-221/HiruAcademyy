<?php

namespace App\Http\Controllers;

use App\Models\CommunityMessage;
use App\Models\CommunityRoom;
use App\Models\CommunityTopic;
use App\Services\EntitlementService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CommunityChatController extends Controller
{
    public function __construct(private EntitlementService $entitlements) {}

    public function room(CommunityTopic $topic)
    {
        $room = DB::transaction(function () use ($topic) {
            $topic = CommunityTopic::whereKey($topic->id)->lockForUpdate()->firstOrFail();
            $this->assertTopic($topic);

            return $topic->room()->firstOrCreate([]);
        });

        return response()->json(['data' => ['id' => $room->id, 'topic_id' => $topic->id, 'topic_slug' => $topic->slug]]);
    }

    public function messages(Request $request, CommunityRoom $room)
    {
        $this->assertTopic($room->topic);
        $data = $request->validate([
            'before' => ['sometimes', 'integer', 'min:1', 'prohibits:after'],
            'after' => ['sometimes', 'integer', 'min:0', 'prohibits:before'],
            'limit' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);
        $limit = $data['limit'] ?? 50;
        $forward = array_key_exists('after', $data);
        $query = $room->messages()->with('user:id,name,role');
        if ($request->user()->role !== 'admin') {
            $query->where('status', 'published');
        }
        if (isset($data['before'])) {
            $query->where('id', '<', $data['before']);
        }
        if ($forward) {
            $query->where('id', '>', $data['after']);
        }
        $rows = $query->orderBy('id', $forward ? 'asc' : 'desc')->limit($limit + 1)->get();
        $hasMore = $rows->count() > $limit;
        $rows = $rows->take($limit);
        if (! $forward) {
            $rows = $rows->reverse();
        }

        return response()->json([
            'data' => $rows->values()->map(fn ($message) => $this->serialize($message)),
            'meta' => [
                // ID cursors discover new messages only; clients must refresh loaded history for moderation changes.
                'requires_history_refresh' => true,
                'has_more' => $hasMore,
                'before' => $rows->first()?->id,
                'after' => $rows->last()?->id ?? ($data['after'] ?? 0),
            ],
        ]);
    }

    public function store(Request $request, CommunityRoom $room)
    {
        $data = $request->validate([
            'client_message_id' => ['required', 'uuid'],
            'content' => ['required', 'string', 'max:5000', 'regex:/\S/u'],
        ]);
        $user = $request->user();
        if ($user->role !== 'admin' && ! $user->isSenseiInstructor()) {
            $sources = $this->entitlements->effectiveAccess($user)['source_grants'] ?? [];
            abort_unless(count($sources) > 0, 403, 'Free Member hanya dapat membaca diskusi.');
        }
        [$message, $created] = DB::transaction(function () use ($room, $user, $data) {
            $topic = CommunityTopic::whereKey($room->topic_id)->lockForUpdate()->firstOrFail();
            $this->assertTopic($topic);
            CommunityRoom::whereKey($room->id)->lockForUpdate()->firstOrFail();
            $existing = $room->messages()->withTrashed()->where('user_id', $user->id)
                ->where('client_message_id', $data['client_message_id'])->first();
            if ($existing) {
                abort_if($existing->trashed(), 404);
                abort_if($existing->status !== 'published' && $user->role !== 'admin', 404);
                abort_if($existing->content !== $data['content'], 409, 'client_message_id sudah digunakan untuk isi pesan berbeda.');

                return [$existing, false];
            }

            return [$room->messages()->create([
                'user_id' => $user->id,
                'client_message_id' => $data['client_message_id'],
                'content' => $data['content'],
                'status' => 'published',
            ]), true];
        });

        return response()->json(['data' => $this->serialize($message->load('user:id,name,role'))], $created ? 201 : 200);
    }

    public function moderate(Request $request, CommunityMessage $message)
    {
        abort_unless($request->user()->role === 'admin', 403);
        $data = $request->validate(['status' => ['required', 'in:published,hidden']]);
        $message->update($data);

        return response()->json(['data' => $this->serialize($message->load('user:id,name,role'))]);
    }

    public function destroy(Request $request, CommunityMessage $message)
    {
        abort_unless($request->user()->role === 'admin', 403);
        DB::transaction(function () use ($request, $message) {
            $message = CommunityMessage::whereKey($message->id)->lockForUpdate()->firstOrFail();
            $message->deleted_by = $request->user()->id;
            $message->save();
            $message->delete();
        });

        return response()->noContent();
    }

    public function report(Request $request, CommunityMessage $message)
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:2000', 'regex:/\S/u'], 'reporter_id' => ['prohibited']]);
        [$report, $created] = DB::transaction(function () use ($request, $message, $data) {
            $message = CommunityMessage::whereKey($message->id)->lockForUpdate()->firstOrFail();
            $this->assertTopic($message->room->topic);
            abort_unless($message->status === 'published', 404);
            $report = \App\Models\CommunityMessageReport::firstOrCreate(
                ['message_id' => $message->id, 'reporter_id' => $request->user()->id],
                ['reason' => $data['reason'], 'status' => 'pending']
            );

            return [$report, $report->wasRecentlyCreated];
        });

        return response()->json(['data' => ['id' => $report->id, 'status' => $report->status]], $created ? 201 : 200);
    }

    public function moderationIndex(Request $request)
    {
        abort_unless($request->user()->role === 'admin', 403);
        $data = $request->validate([
            'topic_id' => ['sometimes', 'integer', 'min:1'],
            'status' => ['sometimes', 'in:published,hidden'],
            'report_status' => ['sometimes', 'in:pending,handled'],
            'page' => ['sometimes', 'integer', 'min:1'],
            'view' => ['sometimes', 'in:messages,reports'],
        ]);
        $messages = CommunityMessage::withTrashed()->with(['user:id,name,role', 'room.topic']);
        if (isset($data['topic_id'])) {
            $messages->whereHas('room', fn ($query) => $query->where('topic_id', $data['topic_id']));
        }
        if (isset($data['status'])) {
            $messages->where('status', $data['status']);
        }
        if (($data['view'] ?? 'messages') === 'reports') {
            $query = \App\Models\CommunityMessageReport::with(['reporter:id,name', 'message.user:id,name,role', 'message.room.topic'])
                ->whereIn('message_id', $messages->select('id'));
            if (isset($data['report_status'])) {
                $query->where('status', $data['report_status']);
            }
            return response()->json($query->orderByDesc('id')->paginate(25));
        }

        return response()->json($messages->orderByDesc('id')->paginate(25));
    }

    public function handleReport(Request $request, \App\Models\CommunityMessageReport $report)
    {
        abort_unless($request->user()->role === 'admin', 403);
        $request->validate(['status' => ['required', 'in:handled']]);
        // Report review and message visibility are separate decisions; handled need not mean hidden.
        DB::transaction(function () use ($request, $report) {
            $report = \App\Models\CommunityMessageReport::whereKey($report->id)->lockForUpdate()->firstOrFail();
            if ($report->status !== 'handled') {
                $report->update(['status' => 'handled', 'handled_by' => $request->user()->id, 'handled_at' => now()]);
            }
        });

        return response()->json(['data' => $report->fresh()]);
    }

    private function assertTopic(CommunityTopic $topic): void
    {
        abort_unless($topic->status === 'published', 404);
        if ($topic->slug === 'tanya-sensei') {
            $user = request()->user();
            if ($user->role !== 'admin' && ! $user->isSenseiInstructor()) {
                $sources = $this->entitlements->effectiveAccess($user)['source_grants'] ?? [];
                abort_unless(collect($sources)->contains(fn ($grant) => $grant['plan_code'] === 'sensei'), 403);
            }
        }
    }

    private function serialize(CommunityMessage $message): array
    {
        return [
            'id' => $message->id,
            'room_id' => $message->room_id,
            'client_message_id' => $message->client_message_id,
            'content' => $message->content,
            'status' => $message->status,
            'author' => ['id' => $message->user->id, 'name' => $message->user->name, 'is_sensei' => $message->user->isSenseiInstructor()],
            'created_at' => $message->created_at->toISOString(),
        ];
    }
}
