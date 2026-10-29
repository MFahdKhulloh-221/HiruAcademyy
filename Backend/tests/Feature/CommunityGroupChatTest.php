<?php

namespace Tests\Feature;

use App\Models\CommunityMessage;
use App\Models\CommunityReply;
use App\Models\CommunityRoom;
use App\Models\CommunityThread;
use App\Models\CommunityTopic;
use App\Models\Program;
use App\Models\SenseiProfile;
use App\Models\User;
use App\Services\EntitlementService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class CommunityGroupChatTest extends TestCase
{
    private User $member;

    private CommunityTopic $topic;

    protected function setUp(): void
    {
        parent::setUp();
        if (getenv('HIRU_DISPOSABLE_TESTING') !== '1' || getenv('HIRU_TEST_SCHEMA') !== 'hiru_backend_test_community49') {
            throw new \RuntimeException('Community chat tests require isolated disposable schema.');
        }
        $this->member = $this->user();
        $code = 'chat-'.Str::random(12);
        $program = Program::create(['code' => $code, 'slug' => $code, 'name' => 'Chat test', 'family' => 'ssw', 'status' => 'active', 'sort_order' => 0]);
        foreach (['lms', 'sensei'] as $plan) {
            DB::table('program_offers')->insert(['program_id' => $program->id, 'plan_code' => $plan, 'duration_months' => 1, 'status' => 'inactive']);
        }
        DB::table('access_grants')->insert([
            'user_id' => $this->member->id, 'program_id' => $program->id, 'plan_code' => 'lms',
            'starts_at' => now()->subDay(), 'ends_at' => now()->addDay(), 'status' => 'active',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->topic = $this->topic();
        $this->actingAs($this->member);
    }

    private function user(string $role = 'student'): User
    {
        $id = Str::random(16);

        return User::forceCreate(['name' => 'Chat '.$id, 'email' => $id.'@example.test', 'whatsapp' => '628'.random_int(1000000000, 9999999999),
            'password' => 'test-password', 'role' => $role, 'account_status' => 'active']);
    }

    private function topic(): CommunityTopic
    {
        return CommunityTopic::create(['slug' => 'chat-'.Str::random(16), 'title' => 'Chat test', 'status' => 'published']);
    }

    private function room(?CommunityTopic $topic = null): int
    {
        return $this->getJson('/api/community/topics/'.($topic ?? $this->topic)->id.'/room')->assertOk()->json('data.id');
    }

    private function send(int $room, string $content = 'Pesan', ?string $key = null)
    {
        return $this->postJson("/api/community/rooms/{$room}/messages", ['content' => $content, 'client_message_id' => $key ?? (string) Str::uuid()]);
    }

    public function test_reports_are_persistent_private_and_admin_review_is_authorized(): void
    {
        $threads = CommunityThread::count();
        $replies = CommunityReply::count();
        $room = $this->room();
        $key = (string) Str::uuid();
        $id = $this->send($room, 'Reported message', $key)->assertCreated()->json('data.id');
        $free = $this->user();
        $this->actingAs($free);
        $this->postJson("/api/community/messages/{$id}/reports", ['reason' => 'Spam', 'reporter_id' => $this->member->id])->assertUnprocessable();
        $report = $this->postJson("/api/community/messages/{$id}/reports", ['reason' => 'Spam'])->assertCreated()->json('data.id');
        $this->postJson("/api/community/messages/{$id}/reports", ['reason' => 'Repeat'])->assertOk()->assertJsonPath('data.id', $report);
        $this->assertDatabaseHas('community_message_reports', ['id' => $report, 'reporter_id' => $free->id, 'reason' => 'Spam', 'status' => 'pending']);
        $this->getJson('/api/admin/community/moderation')->assertForbidden();
        $this->patchJson("/api/admin/community/reports/{$report}", ['status' => 'handled'])->assertForbidden();
        $this->patchJson("/api/community/messages/{$id}", ['status' => 'hidden'])->assertForbidden();
        $admin = $this->user('admin');
        $this->actingAs($admin);
        $this->getJson('/api/admin/community/moderation?view=reports&topic_id='.$this->topic->id)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.reporter.id', $free->id);
        $otherTopic = $this->topic();
        $this->getJson('/api/admin/community/moderation?view=reports&topic_id='.$otherTopic->id)->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/admin/community/moderation?page=0')->assertUnprocessable();
        $this->patchJson("/api/community/messages/{$id}", ['status' => 'hidden'])->assertOk();
        $this->patchJson("/api/admin/community/reports/{$report}", ['status' => 'handled'])->assertOk();
        $this->assertDatabaseHas('community_message_reports', ['id' => $report, 'status' => 'handled', 'handled_by' => $admin->id]);
        $this->actingAs($this->member);
        $this->send($room, 'Reported message', $key)->assertNotFound();
        $this->send($room, 'Changed hidden payload', $key)->assertNotFound();
        $this->postJson("/api/community/messages/{$id}/reports", ['reason' => 'Hidden'])->assertNotFound();
        $this->getJson("/api/community/rooms/{$room}/messages")->assertOk()->assertJsonCount(0, 'data');
        $this->getJson("/api/community/rooms/{$room}/messages?after=0")->assertOk()->assertJsonCount(0, 'data');
        $this->actingAs($admin);
        $this->patchJson("/api/community/messages/{$id}", ['status' => 'published'])->assertOk();
        $this->getJson('/api/admin/community/moderation?status=published&topic_id='.$this->topic->id)->assertOk()->assertJsonCount(1, 'data');
        $this->topic->update(['status' => 'hidden']);
        $this->actingAs($free);
        $this->postJson("/api/community/messages/{$id}/reports", ['reason' => 'Unavailable topic'])->assertNotFound();
        $this->assertSame($threads, CommunityThread::count());
        $this->assertSame($replies, CommunityReply::count());
    }

    public function test_admin_soft_delete_preserves_audit_and_blocks_history_retry_and_reports(): void
    {
        $room = $this->room();
        $key = (string) Str::uuid();
        $id = $this->send($room, 'Delete safely', $key)->assertCreated()->json('data.id');
        $report = $this->postJson("/api/community/messages/{$id}/reports", ['reason' => 'Review'])->assertCreated()->json('data.id');
        $this->deleteJson("/api/community/messages/{$id}")->assertForbidden();
        $admin = $this->user('admin');
        $this->actingAs($admin)->deleteJson("/api/community/messages/{$id}")->assertNoContent();
        $this->assertSoftDeleted('community_messages', ['id' => $id]);
        $this->assertDatabaseHas('community_messages', ['id' => $id, 'deleted_by' => $admin->id, 'content' => 'Delete safely']);
        $this->getJson('/api/admin/community/moderation?view=reports&topic_id='.$this->topic->id)->assertOk()->assertJsonPath('data.0.message.id', $id);
        $this->patchJson("/api/admin/community/reports/{$report}", ['status' => 'handled'])->assertOk();
        $this->patchJson("/api/community/messages/{$id}", ['status' => 'published'])->assertNotFound();
        $this->actingAs($this->member);
        $this->getJson("/api/community/rooms/{$room}/messages")->assertOk()->assertJsonCount(0, 'data');
        $this->getJson("/api/community/rooms/{$room}/messages?after=0")->assertOk()->assertJsonCount(0, 'data');
        $this->send($room, 'Delete safely', $key)->assertNotFound();
        $this->send($room, 'Different', $key)->assertNotFound();
        $this->postJson("/api/community/messages/{$id}/reports", ['reason' => 'Again'])->assertNotFound();
    }

    public function test_rooms_are_unique_and_categories_are_isolated(): void
    {
        $a = $this->room();
        $this->assertSame($a, $this->room());
        $b = $this->room($this->topic());
        $this->assertNotSame($a, $b);
        $this->send($a, 'Kategori A')->assertCreated();
        $this->send($b, 'Kategori B')->assertCreated();
        $this->getJson("/api/community/rooms/{$a}/messages")->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.content', 'Kategori A');
        $this->getJson("/api/community/rooms/{$b}/messages")->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.content', 'Kategori B');
        $this->assertSame(1, CommunityRoom::where('topic_id', $this->topic->id)->count());
    }

    public function test_history_and_cursor_order_are_stable(): void
    {
        $room = $this->room();
        $ids = [];
        foreach (range(1, 5) as $i) {
            $ids[] = $this->send($room, 'Pesan '.$i)->assertCreated()->json('data.id');
        }
        DB::disconnect();
        $page = $this->getJson("/api/community/rooms/{$room}/messages?limit=2")->assertOk();
        $this->assertSame(array_slice($ids, 3), array_column($page->json('data'), 'id'));
        $page->assertJsonPath('meta.has_more', true);
        $older = $this->getJson("/api/community/rooms/{$room}/messages?limit=2&before={$ids[3]}")->assertOk();
        $this->assertSame(array_slice($ids, 1, 2), array_column($older->json('data'), 'id'));
        $newer = $this->getJson("/api/community/rooms/{$room}/messages?limit=2&after={$ids[1]}")->assertOk();
        $this->assertSame(array_slice($ids, 2, 2), array_column($newer->json('data'), 'id'));
        $this->getJson("/api/community/rooms/{$room}/messages?before=1&after=1")->assertUnprocessable();
        $this->getJson("/api/community/rooms/{$room}/messages?limit=101")->assertUnprocessable();
    }

    public function test_identity_is_server_owned_and_retry_is_idempotent(): void
    {
        $room = $this->room();
        $key = (string) Str::uuid();
        $body = ['content' => 'Asli', 'client_message_id' => $key, 'user_id' => $this->user()->id, 'status' => 'hidden'];
        $created = $this->postJson("/api/community/rooms/{$room}/messages", $body)->assertCreated()
            ->assertJsonPath('data.author.id', $this->member->id)->assertJsonPath('data.author.name', $this->member->name)
            ->assertJsonPath('data.status', 'published')->assertJsonStructure(['data' => ['created_at']]);
        $this->postJson("/api/community/rooms/{$room}/messages", $body)->assertOk()->assertJsonPath('data.id', $created->json('data.id'));
        $this->send($room, 'Berbeda', $key)->assertConflict();
        $this->assertSame(1, CommunityMessage::where('room_id', $room)->count());
    }

    public function test_idempotency_key_is_scoped_to_sender_and_room(): void
    {
        $a = $this->room();
        $b = $this->room($this->topic());
        $key = (string) Str::uuid();
        $this->send($a, 'Satu', $key)->assertCreated();
        $this->send($b, 'Dua', $key)->assertCreated();
        $this->actingAs($this->user('admin'));
        $this->send($a, 'Tiga', $key)->assertCreated();
        $this->assertSame(2, CommunityMessage::where('room_id', $a)->count());
        $this->assertSame(1, CommunityMessage::where('room_id', $b)->count());
    }

    public function test_guest_and_free_cannot_write_but_free_can_read(): void
    {
        $room = $this->room();
        $this->actingAs($this->user());
        $this->send($room)->assertForbidden();
        $this->getJson("/api/community/rooms/{$room}/messages")->assertOk();
        auth()->forgetGuards();
        $this->getJson('/api/community/topics/'.$this->topic->id.'/room')->assertUnauthorized();
        $this->getJson("/api/community/rooms/{$room}/messages")->assertUnauthorized();
        $this->send($room)->assertUnauthorized();
    }

    public function test_expired_membership_and_inactive_account_are_denied(): void
    {
        $room = $this->room();
        DB::table('access_grants')->where('user_id', $this->member->id)->update(['starts_at' => now()->subDays(3), 'ends_at' => now()->subDays(2)]);
        $this->send($room)->assertForbidden();
        $this->member->forceFill(['account_status' => 'inactive'])->save();
        $this->send($room)->assertUnauthorized();
    }

    public function test_unpublished_and_sensei_categories_are_not_chat_rooms(): void
    {
        $room = $this->room();
        $this->topic->update(['status' => 'hidden']);
        $this->getJson('/api/community/topics/'.$this->topic->id.'/room')->assertNotFound();
        $this->getJson("/api/community/rooms/{$room}/messages")->assertNotFound();
        $this->send($room)->assertNotFound();
        $sensei = CommunityTopic::firstOrCreate(['slug' => 'tanya-sensei'], ['title' => 'Tanya Sensei', 'status' => 'published']);
        $this->getJson('/api/community/topics/'.$sensei->id.'/room')->assertNotFound();
    }

    public function test_moderation_is_admin_only_and_hidden_messages_do_not_leak(): void
    {
        $room = $this->room();
        $key = (string) Str::uuid();
        $id = $this->send($room, 'Moderasi', $key)->assertCreated()->json('data.id');
        $this->patchJson("/api/community/messages/{$id}", ['status' => 'hidden'])->assertForbidden();
        $this->actingAs($this->user('admin'));
        $this->patchJson("/api/community/messages/{$id}", ['status' => 'hidden'])->assertOk();
        $this->getJson("/api/community/rooms/{$room}/messages")->assertOk()->assertJsonPath('data.0.status', 'hidden');
        $this->actingAs($this->member);
        $this->getJson("/api/community/rooms/{$room}/messages")->assertOk()->assertJsonCount(0, 'data');
        $this->send($room, 'Moderasi', $key)->assertNotFound();
    }

    public function test_input_validation_and_sensei_membership(): void
    {
        $room = $this->room();
        $this->send($room, '   ')->assertUnprocessable();
        $this->send($room, str_repeat('x', 5001))->assertUnprocessable();
        $this->send($room, 'Pesan', 'invalid')->assertUnprocessable();
        $this->postJson("/api/community/rooms/{$room}/messages", ['content' => ['bad'], 'client_message_id' => (string) Str::uuid()])->assertUnprocessable();
        DB::table('access_grants')->where('user_id', $this->member->id)->update(['plan_code' => 'sensei']);
        $this->send($room)->assertCreated();
    }

    public function test_old_forum_remains_unchanged_and_readable(): void
    {
        $thread = CommunityThread::create(['topic_id' => $this->topic->id, 'user_id' => $this->member->id, 'title' => 'Arsip', 'content' => 'Diskusi lama', 'status' => 'published']);
        $reply = CommunityReply::create(['thread_id' => $thread->id, 'user_id' => $this->member->id, 'content' => 'Balasan lama', 'status' => 'published']);
        $before = [$thread->fresh()->getAttributes(), $reply->fresh()->getAttributes()];
        $this->send($this->room())->assertCreated();
        $this->assertSame($before, [$thread->fresh()->getAttributes(), $reply->fresh()->getAttributes()]);
        $this->getJson('/api/community/threads/'.$thread->id)->assertOk()->assertJsonPath('data.content', 'Diskusi lama')->assertJsonPath('data.replies.0.content', 'Balasan lama');
    }

    public function test_entitlement_failure_does_not_allow_writing(): void
    {
        $room = $this->room();
        $this->mock(EntitlementService::class, function ($mock) {
            $mock->shouldReceive('effectiveAccess')->once()->andThrow(new \RuntimeException('Entitlement unavailable'));
        });
        $this->send($room)->assertStatus(500);
        $this->assertSame(0, CommunityMessage::where('room_id', $room)->count());
    }

    public function test_admin_and_linked_instructor_keep_existing_write_access(): void
    {
        $room = $this->room();
        $this->actingAs($this->user('admin'));
        $this->send($room)->assertCreated()->assertJsonPath('data.author.is_sensei', true);
        $instructor = $this->user();
        SenseiProfile::create(['user_id' => $instructor->id, 'name' => 'Instructor', 'role' => 'Mentor', 'bio' => 'Test', 'expertise' => ['Grammar'], 'active' => true, 'level' => 'n5']);
        $this->actingAs($instructor);
        $this->send($room)->assertCreated();
    }

    public function test_parallel_requests_create_one_message(): void
    {
        $room = $this->room();
        $key = (string) Str::uuid();
        $code = <<<'PHP'
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
App\Support\DatabaseSafety::assertTarget(true);
$request = Illuminate\Http\Request::create('/', 'POST', ['content' => 'Parallel', 'client_message_id' => $argv[3]]);
$request->setUserResolver(fn () => App\Models\User::findOrFail($argv[2]));
$response = $app->make(App\Http\Controllers\CommunityChatController::class)->store($request, App\Models\CommunityRoom::findOrFail($argv[1]));
echo $response->getStatusCode().':'.$response->getData()->data->id;
PHP;
        $workers = [];
        DB::beginTransaction();
        CommunityRoom::whereKey($room)->lockForUpdate()->firstOrFail();
        try {
            foreach (range(1, 2) as $i) {
                $worker = new Process([PHP_BINARY, '-r', $code, (string) $room, (string) $this->member->id, $key], base_path(), ['APP_ENV' => 'testing']);
                $worker->start();
                $workers[] = $worker;
            }
            // Hold the room until both independent PostgreSQL connections wait on its lock.
            $deadline = microtime(true) + 15;
            do {
                foreach ($workers as $worker) {
                    if (! $worker->isRunning()) {
                        $this->fail('Worker exited before lock: '.$worker->getErrorOutput().$worker->getOutput());
                    }
                }
                DB::select('SELECT pg_stat_clear_snapshot()');
                $waiting = DB::selectOne("SELECT count(*) AS total FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND wait_event_type = 'Lock'")->total;
                if ((int) $waiting >= 2) {
                    break;
                }
                usleep(20000);
            } while (microtime(true) < $deadline);
            $this->assertGreaterThanOrEqual(2, (int) $waiting, 'Both workers must contend on database locks');
        } finally {
            DB::commit();
        }
        $results = [];
        foreach ($workers as $worker) {
            $worker->wait();
            $this->assertTrue($worker->isSuccessful(), $worker->getErrorOutput().$worker->getOutput());
            $results[] = explode(':', $worker->getOutput());
        }
        $this->assertEqualsCanonicalizing(['200', '201'], array_column($results, 0));
        $this->assertSame($results[0][1], $results[1][1]);
        $this->assertSame(1, CommunityMessage::where('room_id', $room)->count());
    }
}
