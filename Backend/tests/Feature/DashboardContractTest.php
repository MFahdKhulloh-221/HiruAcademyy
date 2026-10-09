<?php

namespace Tests\Feature;

use App\Models\AccessGrant;
use App\Models\ActivityCompletion;
use App\Models\Chapter;
use App\Models\Program;
use App\Models\ReadingPassage;
use App\Models\ReadingQuestion;
use App\Models\User;
use App\Models\VideoLesson;
use Database\Seeders\ProgramOfferSeeder;
use Database\Seeders\ProgramSeeder;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class DashboardContractTest extends TestCase
{
    use DatabaseTransactions;

    private function user(string $role = 'student'): User
    {
        $user = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $user->forceFill(['role' => $role, 'account_status' => 'active'])->save();

        return $user;
    }

    private function grant(User $user, string $code, array $overrides = []): AccessGrant
    {
        return AccessGrant::create(array_replace(['user_id' => $user->id, 'program_id' => Program::where('code', $code)->firstOrFail()->id, 'plan_code' => 'lms', 'status' => 'active', 'starts_at' => now()->toDateString(), 'ends_at' => now()->toDateString()], $overrides));
    }

    private function parity(User $user): array
    {
        $this->actingAs($user);
        $data = $this->getJson('/api/student/dashboard')->assertOk()->json('data');
        $this->assertSame($this->getJson('/api/public/programs')->assertOk()->json('data'), $data['programs']);
        $this->assertSame($this->getJson('/api/student/access')->assertOk()->json('data'), $data['access']);
        $expected = [];
        foreach ($data['programs'] as $program) {
            foreach ($this->getJson('/api/student/programs/'.$program['id'].'/chapters')->assertOk()->json('data') as $chapter) {
                $row = ['program_id' => $program['id'], 'chapter' => $chapter];
                if ($chapter['access'] !== 'locked') {
                    $row['progress'] = $this->getJson('/api/student/programs/'.$program['id'].'/chapters/'.$chapter['id'].'/progress')->assertOk()->json('data');
                }
                $expected[] = $row;
            }
        }
        $this->assertEquals($expected, $data['chapters']);
        $json = json_encode($data);
        foreach (['correct_option', 'explanation', 'video_url', 'file_url', 'password'] as $private) {
            $this->assertStringNotContainsString('"'.$private.'"', $json);
        }

        return $data;
    }

    public function test_family_progress_publication_readiness_and_user_isolation(): void
    {
        $this->seed([ProgramSeeder::class, ProgramOfferSeeder::class]);
        Chapter::query()->update(['status' => 'draft', 'chapter_number' => DB::raw('chapter_number + 100000')]);
        $user = $this->user();
        $other = $this->user();
        $this->grant($user, 'n1', ['plan_code' => 'sensei']);
        $this->grant($user, 'ssw-food');
        $this->grant($user, 'interview');
        foreach (Program::orderBy('id')->get() as $program) {
            $chapter = Chapter::create(['program_id' => $program->id, 'chapter_number' => 1, 'title' => 'Fixture', 'status' => 'published']);
            $video = VideoLesson::create(['chapter_id' => $chapter->id, 'title' => 'Published', 'video_url' => 'https://example.test/a.mp4', 'status' => 'published']);
            $draftChapter = Chapter::create(['program_id' => $program->id, 'chapter_number' => 2, 'title' => 'Draft', 'status' => 'draft']);
            $draft = VideoLesson::create(['chapter_id' => $draftChapter->id, 'title' => 'Draft', 'status' => 'draft']);
            foreach ([$video, $draft] as $item) {
                ActivityCompletion::create(['user_id' => $user->id, 'chapter_id' => $chapter->id, 'type' => 'video', 'resource_id' => $item->id, 'completed_at' => now()]);
            }
            ActivityCompletion::create(['user_id' => $other->id, 'chapter_id' => $chapter->id, 'type' => 'video', 'resource_id' => $video->id, 'completed_at' => now()]);
            ActivityCompletion::create(['user_id' => $user->id, 'chapter_id' => $chapter->id, 'type' => 'module', 'resource_id' => $video->id, 'completed_at' => now()]);
            if ($program->family === 'jlpt') {
                $passage = ReadingPassage::create(['chapter_id' => $chapter->id, 'title' => 'Published', 'body' => 'Fixture', 'status' => 'published']);
                $question = ReadingQuestion::create(['reading_passage_id' => $passage->id, 'question' => 'Fixture', 'options' => ['A' => 'A', 'B' => 'B', 'C' => 'C', 'D' => 'D'], 'correct_option' => 'A', 'status' => 'published']);
                ActivityCompletion::create(['user_id' => $user->id, 'chapter_id' => $chapter->id, 'type' => 'reading', 'resource_id' => $question->id, 'completed_at' => now()]);
                ReadingQuestion::create(['reading_passage_id' => $passage->id, 'question' => 'Draft', 'options' => ['A' => 'A', 'B' => 'B', 'C' => 'C', 'D' => 'D'], 'correct_option' => 'A', 'status' => 'draft']);
                ReadingPassage::create(['chapter_id' => $chapter->id, 'title' => 'Empty', 'body' => 'Fixture', 'status' => 'published']);
                $unpublished = ReadingPassage::create(['chapter_id' => $chapter->id, 'title' => 'Draft', 'body' => 'Fixture', 'status' => 'draft']);
                ReadingQuestion::create(['reading_passage_id' => $unpublished->id, 'question' => 'Hidden parent', 'options' => ['A' => 'A', 'B' => 'B', 'C' => 'C', 'D' => 'D'], 'correct_option' => 'A', 'status' => 'published']);
            }
        }
        $data = $this->parity($user);
        foreach ($data['chapters'] as $row) {
            $this->assertSame(1, $row['progress']['activities']['video']['total']);
            $this->assertSame(1, $row['progress']['activities']['video']['completed']);
            $this->assertFalse($row['progress']['activities']['module']['complete']);
            if (isset($row['progress']['activities']['reading'])) {
                $this->assertSame(1, $row['progress']['activities']['reading']['total']);
                $this->assertSame(1, $row['progress']['activities']['reading']['completed']);
                $this->assertFalse($row['progress']['activities']['reading']['complete']);
            }
        }
        $otherData = $this->parity($other);
        foreach ($otherData['chapters'] as $row) {
            if (isset($row['progress']['activities']['reading'])) {
                $this->assertSame(0, $row['progress']['activities']['reading']['completed']);
            }
        }
        VideoLesson::where('title', 'Published')->update(['status' => 'draft']);
        ReadingQuestion::where('status', 'published')->update(['status' => 'draft']);
        $data = $this->parity($user);
        foreach ($data['chapters'] as $row) {
            $this->assertSame(0, $row['progress']['activities']['video']['completed']);
        }
        Program::where('code', 'n1')->update(['status' => 'inactive']);
        Chapter::where('program_id', Program::where('code', 'n5')->firstOrFail()->id)->update(['status' => 'draft']);
        $data = $this->parity($user);
        $this->assertNotContains('n1', array_column($data['programs'], 'code'));
    }

    public function test_access_dates_tiers_preview_and_admin_projection(): void
    {
        $this->seed([ProgramSeeder::class, ProgramOfferSeeder::class]);
        $user = $this->user();
        $admin = $this->user('admin');
        $this->grant($user, 'n1', ['starts_at' => now()->addDay()->toDateString(), 'ends_at' => now()->addDays(2)->toDateString()]);
        $this->grant($user, 'n2', ['starts_at' => now()->subDays(2)->toDateString(), 'ends_at' => now()->subDay()->toDateString()]);
        $this->grant($user, 'n1', ['status' => 'inactive']);
        foreach (['n5', 'n4', 'n3', 'n2', 'n1'] as $code) {
            $grant = $this->grant($user, $code, ['plan_code' => 'sensei']);
            $data = $this->parity($user);
            $this->assertSame('full', $data['access']['learning'][$code]);
            $this->assertContains($code, $data['access']['replay_levels']);
            $this->actingAs($admin);
            $default = $this->getJson('/api/admin/users')->assertOk()->json('data');
            $embedded = $this->getJson('/api/admin/users?include=effective_access')->assertOk()->json('data');
            $this->assertSame($data['access'], collect($embedded)->firstWhere('id', $user->id)['effective_access']);
            foreach ($default as $row) {
                $this->assertArrayNotHasKey('effective_access', $row);
                $this->assertNotSame($admin->id, $row['id']);
            }
            $grant->update(['status' => 'inactive']);
        }
        $this->grant($user, 'ssw-food');
        $this->grant($user, 'interview');
        $data = $this->parity($user);
        $this->assertSame('preview', $data['access']['learning']['n1']);
        $this->assertSame('full', $data['access']['learning']['interview']);
        $this->assertSame('full', $data['access']['learning']['ssw-food']);
        $this->actingAs($admin);
        foreach (['other', 'effective_access,other', ''] as $include) {
            $this->getJson('/api/admin/users?include='.urlencode($include))->assertUnprocessable();
        }
        $this->getJson('/api/admin/users?include[]=effective_access')->assertUnprocessable();
    }

    public function test_query_count_stays_bounded_as_chapters_and_users_grow(): void
    {
        $this->seed([ProgramSeeder::class, ProgramOfferSeeder::class]);
        Chapter::query()->update(['status' => 'draft', 'chapter_number' => DB::raw('chapter_number + 100000')]);
        $user = $this->user();
        $admin = $this->user('admin');
        $this->grant($user, 'n5');
        $program = Program::where('code', 'n5')->firstOrFail();
        $counts = [];
        foreach (range(1, 30) as $number) {
            $chapter = Chapter::create(['program_id' => $program->id, 'chapter_number' => $number, 'title' => 'Growth', 'status' => 'published']);
            VideoLesson::create(['chapter_id' => $chapter->id, 'title' => 'Video', 'status' => 'published']);
            $passage = ReadingPassage::create(['chapter_id' => $chapter->id, 'title' => 'Empty', 'body' => 'Fixture', 'status' => 'published']);
            ReadingQuestion::create(['reading_passage_id' => $passage->id, 'question' => 'Draft only', 'options' => ['A' => 'A', 'B' => 'B', 'C' => 'C', 'D' => 'D'], 'correct_option' => 'A', 'status' => 'draft']);
            if (in_array($number, [1, 30], true)) {
                $this->actingAs($user);
                DB::flushQueryLog();
                DB::enableQueryLog();
                $data = $this->getJson('/api/student/dashboard')->assertOk()->json('data');
                $counts[] = count(DB::getQueryLog());
                DB::disableQueryLog();
                $this->assertCount($number, $data['chapters']);
                foreach ($data['chapters'] as $row) {
                    $this->assertSame(0, $row['progress']['activities']['reading']['total']);
                    $this->assertFalse($row['progress']['activities']['reading']['complete']);
                }
            }
        }
        $this->assertSame($counts[0], $counts[1]);
        $this->assertLessThanOrEqual(11, $counts[1]);
        $this->actingAs($admin);
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->getJson('/api/admin/users?include=effective_access')->assertOk();
        $before = count(DB::getQueryLog());
        DB::disableQueryLog();
        foreach (range(1, 30) as $number) {
            $this->grant($this->user(), 'n5');
        }
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->getJson('/api/admin/users?include=effective_access')->assertOk();
        $after = count(DB::getQueryLog());
        DB::disableQueryLog();
        $this->assertSame(3, $before);
        $this->assertSame($before, $after);
    }

    public function test_dashboard_and_admin_include_require_correct_active_role(): void
    {
        $this->getJson('/api/student/dashboard')->assertUnauthorized();
        $this->getJson('/api/admin/users?include=effective_access')->assertUnauthorized();
        $student = $this->user();
        $admin = $this->user('admin');
        $this->actingAs($student)->getJson('/api/admin/users?include=effective_access')->assertForbidden();
        $this->actingAs($admin)->getJson('/api/student/dashboard')->assertForbidden();
        $student->forceFill(['account_status' => 'inactive'])->save();
        $this->actingAs($student)->getJson('/api/student/dashboard')->assertUnauthorized();
        $admin->forceFill(['account_status' => 'inactive'])->save();
        $this->actingAs($admin)->getJson('/api/admin/users?include=effective_access')->assertUnauthorized();
    }
}
