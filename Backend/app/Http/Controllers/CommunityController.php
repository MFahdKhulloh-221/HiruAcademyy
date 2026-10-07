<?php

namespace App\Http\Controllers;

use App\Models\CommunityReply;
use App\Models\CommunityThread;
use App\Models\CommunityTopic;
use App\Services\EntitlementService;
use Illuminate\Http\Request;

class CommunityController extends Controller
{
    public function __construct(private EntitlementService $entitlements) {}

    public function topics()
    {
        $topics = CommunityTopic::where('status', 'published')
            ->orderBy('sort_order')
            ->orderBy('id')
            ->withCount(['threads' => fn ($q) => $q->where('status', 'published')])
            ->get();

        return response()->json(['data' => $topics]);
    }

    public function threads(Request $request)
    {
        $user = $request->user();
        $query = CommunityThread::with(['user:id,name', 'topic'])
            ->withCount(['replies' => fn ($q) => $q->where('status', 'published')]);

        if ($request->filled('is_ask_sensei')) {
            $isAskSensei = filter_var($request->query('is_ask_sensei'), FILTER_VALIDATE_BOOLEAN);
            $query->where('is_ask_sensei', $isAskSensei);

            if ($isAskSensei) {
                $hasSensei = $this->hasSenseiPlan($user);
                $isInstructor = $user->isSenseiInstructor();
                abort_unless($hasSensei || $isInstructor, 403);
            }
        }

        if ($request->filled('topic_slug')) {
            $query->whereHas('topic', fn ($q) => $q->where('slug', $request->query('topic_slug')));
        } elseif ($request->filled('topic_id')) {
            $query->where('topic_id', $request->query('topic_id'));
        }

        if ($request->filled('search')) {
            $term = '%'.trim($request->query('search')).'%';
            $query->where(function ($q) use ($term) {
                $q->where('title', 'ilike', $term)
                    ->orWhere('content', 'ilike', $term);
            });
        }

        if ($user->role !== 'admin') {
            $query->where(function ($q) use ($user) {
                $q->where('status', 'published')
                    ->orWhere('user_id', $user->id);
            });
        }

        $threads = $query->orderByDesc('id')->get()->map(function ($t) {
            return [
                'id' => $t->id,
                'topic_id' => $t->topic_id,
                'topic_title' => $t->topic->title,
                'topic_slug' => $t->topic->slug,
                'title' => $t->title,
                'content' => $t->content,
                'is_ask_sensei' => $t->is_ask_sensei,
                'status' => $t->status,
                'replies_count' => $t->replies_count,
                'author' => [
                    'id' => $t->user->id,
                    'name' => $t->user->name,
                    'is_sensei' => $t->user->isSenseiInstructor(),
                ],
                'created_at' => $t->created_at->toISOString(),
            ];
        });

        return response()->json(['data' => $threads]);
    }

    public function show(Request $request, CommunityThread $thread)
    {
        $user = $request->user();
        if ($thread->is_ask_sensei) {
            $hasSensei = $this->hasSenseiPlan($user);
            $isInstructor = $user->isSenseiInstructor();
            abort_unless($hasSensei || $isInstructor || $thread->user_id === $user->id, 403);
        }

        if ($user->role !== 'admin' && $thread->status !== 'published' && $thread->user_id !== $user->id) {
            abort(404);
        }

        $thread->load(['user:id,name', 'topic', 'replies' => function ($q) use ($user) {
            if ($user->role !== 'admin') {
                $q->where(function ($sq) use ($user) {
                    $sq->where('status', 'published')->orWhere('user_id', $user->id);
                });
            }
            $q->with('user:id,name')->orderBy('id');
        }]);

        $replies = $thread->replies->map(function ($r) {
            return [
                'id' => $r->id,
                'content' => $r->content,
                'status' => $r->status,
                'author' => [
                    'id' => $r->user->id,
                    'name' => $r->user->name,
                    'is_sensei' => $r->user->isSenseiInstructor(),
                ],
                'created_at' => $r->created_at->toISOString(),
            ];
        });

        return response()->json([
            'data' => [
                'id' => $thread->id,
                'topic_id' => $thread->topic_id,
                'topic_title' => $thread->topic->title,
                'topic_slug' => $thread->topic->slug,
                'title' => $thread->title,
                'content' => $thread->content,
                'is_ask_sensei' => $thread->is_ask_sensei,
                'status' => $thread->status,
                'author' => [
                    'id' => $thread->user->id,
                    'name' => $thread->user->name,
                    'is_sensei' => $thread->user->isSenseiInstructor(),
                ],
                'replies' => $replies,
                'created_at' => $thread->created_at->toISOString(),
            ],
        ]);
    }

    public function storeThread(Request $request)
    {
        $user = $request->user();
        $data = $request->validate([
            'topic_id' => ['required', 'integer', 'exists:community_topics,id'],
            'title' => ['required', 'string', 'max:255'],
            'content' => ['required', 'string'],
            'is_ask_sensei' => ['sometimes', 'boolean'],
        ]);

        $isAskSensei = $data['is_ask_sensei'] ?? false;
        $topic = CommunityTopic::findOrFail($data['topic_id']);
        if ($topic->slug === 'tanya-sensei') {
            $isAskSensei = true;
        }

        if ($isAskSensei) {
            abort_unless($this->hasSenseiPlan($user) || $user->isSenseiInstructor(), 403, 'Akses Tanya Sensei memerlukan paket Belajar dengan Sensei.');
        } else {
            // Free members cannot write posts
            abort_unless($this->canWriteInCommunity($user), 403, 'Free Member hanya dapat membaca diskusi. Upgrade untuk membuat postingan.');
        }

        $thread = CommunityThread::create([
            'topic_id' => $topic->id,
            'user_id' => $user->id,
            'title' => $data['title'],
            'content' => $data['content'],
            'is_ask_sensei' => $isAskSensei,
            'status' => 'published',
        ]);

        return response()->json(['data' => ['id' => $thread->id, 'title' => $thread->title]], 201);
    }

    public function storeReply(Request $request, CommunityThread $thread)
    {
        $user = $request->user();
        $data = $request->validate([
            'content' => ['required', 'string'],
        ]);

        if ($thread->is_ask_sensei) {
            // Only linked SenseiProfile, admin, or the thread author (follow-up) can reply!
            $isAuthor = $thread->user_id === $user->id;
            $isInstructor = $user->isSenseiInstructor();
            abort_unless($isInstructor || $isAuthor, 403, 'Hanya Sensei pengajar yang dapat menjawab pertanyaan Tanya Sensei.');
        } else {
            abort_unless($this->canWriteInCommunity($user), 403, 'Upgrade untuk membalas diskusi.');
        }

        $reply = CommunityReply::create([
            'thread_id' => $thread->id,
            'user_id' => $user->id,
            'content' => $data['content'],
            'status' => 'published',
        ]);

        return response()->json([
            'data' => [
                'id' => $reply->id,
                'content' => $reply->content,
                'author' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'is_sensei' => $user->isSenseiInstructor(),
                ],
                'created_at' => $reply->created_at->toISOString(),
            ],
        ], 201);
    }

    // Admin endpoints
    public function adminUpdateThread(Request $request, CommunityThread $thread)
    {
        abort_unless($request->user()->role === 'admin', 403);
        $data = $request->validate([
            'status' => ['required', 'in:published,hidden'],
        ]);
        $thread->update($data);

        return response()->json(['data' => $thread]);
    }

    public function adminUpdateReply(Request $request, CommunityReply $reply)
    {
        abort_unless($request->user()->role === 'admin', 403);
        $data = $request->validate([
            'status' => ['required', 'in:published,hidden'],
        ]);
        $reply->update($data);

        return response()->json(['data' => $reply]);
    }

    private function hasSenseiPlan($user): bool
    {
        if ($user->role === 'admin') {
            return true;
        }
        $sources = $this->entitlements->effectiveAccess($user)['source_grants'] ?? [];

        return collect($sources)->contains(fn ($g) => $g['plan_code'] === 'sensei');
    }

    private function canWriteInCommunity($user): bool
    {
        if ($user->role === 'admin' || $user->isSenseiInstructor()) {
            return true;
        }
        $sources = $this->entitlements->effectiveAccess($user)['source_grants'] ?? [];

        return count($sources) > 0;
    }
}
