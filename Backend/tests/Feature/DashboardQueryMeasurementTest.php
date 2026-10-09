<?php

namespace Tests\Feature;

use App\Models\AccessGrant;
use App\Models\ActivityCompletion;
use App\Models\AudioQuestion;
use App\Models\Chapter;
use App\Models\Flashcard;
use App\Models\LearningModule;
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

class DashboardQueryMeasurementTest extends TestCase
{
    use DatabaseTransactions;

    private function measure(string $label, callable $request): array
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $start = hrtime(true);
        $result = $request();
        $elapsed = (hrtime(true) - $start) / 1e6;
        $queries = DB::getQueryLog();
        DB::disableQueryLog();
        $patterns = [];
        foreach ($queries as $query) {
            $patterns[$query['query']] = ($patterns[$query['query']] ?? 0) + 1;
        }
        arsort($patterns);
        fwrite(STDOUT, json_encode(['label' => $label, 'queries' => count($queries), 'sql_ms' => round(array_sum(array_column($queries, 'time')), 2), 'wall_ms' => round($elapsed, 2), 'repeated_sql' => array_filter($patterns, fn ($count) => $count > 1)], JSON_UNESCAPED_SLASHES).PHP_EOL);

        return [$result, count($queries)];
    }

    private function fixture(int $number): void
    {
        foreach (Program::orderBy('sort_order')->get() as $program) {
            $chapter = Chapter::create(['program_id' => $program->id, 'chapter_number' => $number, 'title' => 'Dashboard fixture', 'status' => 'published']);
            VideoLesson::create(['chapter_id' => $chapter->id, 'title' => 'Video', 'video_url' => 'https://example.test/video.mp4', 'status' => 'published']);
            LearningModule::create(['chapter_id' => $chapter->id, 'title' => 'Module', 'module_type' => 'grammar', 'status' => 'published']);
            if ($program->family === 'interview') {
                continue;
            }
            foreach (range(1, 2) as $index) {
                Flashcard::create(['chapter_id' => $chapter->id, 'japanese' => '猫', 'reading' => 'ねこ', 'meaning' => 'Cat', 'status' => 'published']);
            }
            if ($program->family !== 'jlpt') {
                continue;
            }
            $question = ['question' => 'Fixture?', 'options' => ['A' => 'One', 'B' => 'Two', 'C' => 'Three', 'D' => 'Four'], 'correct_option' => 'B', 'status' => 'published'];
            AudioQuestion::create(['chapter_id' => $chapter->id, 'audio_url' => 'https://example.test/audio.mp3', ...$question]);
            $passage = ReadingPassage::create(['chapter_id' => $chapter->id, 'title' => 'Reading', 'body' => 'Fixture', 'status' => 'published']);
            foreach (range(1, 2) as $index) {
                ReadingQuestion::create(['reading_passage_id' => $passage->id, ...$question]);
            }
        }
    }

    private function dashboard(User $student): int
    {
        $this->actingAs($student);
        [$programs] = $this->measure('catalog', fn () => $this->getJson('/api/public/programs')->assertOk()->json('data'));
        $this->measure('access', fn () => $this->getJson('/api/student/access')->assertOk());
        $progressCount = 0;
        $expected = [];
        $this->measure('dashboard_chapters_and_progress', function () use ($programs, &$progressCount, &$expected) {
            foreach ($programs as $program) {
                $chapters = $this->getJson('/api/student/programs/'.$program['id'].'/chapters')->assertOk()->json('data');
                foreach ($chapters as $chapter) {
                    $row = ['program_id' => $program['id'], 'chapter' => $chapter];
                    if (in_array($chapter['access'], ['full', 'preview'], true)) {
                        $row['progress'] = $this->getJson('/api/student/programs/'.$program['id'].'/chapters/'.$chapter['id'].'/progress')->assertOk()->json('data');
                        $progressCount++;
                    }
                    $expected[] = $row;
                }
            }
        });
        [$aggregated, $count] = $this->measure('dashboard_after', fn () => $this->getJson('/api/student/dashboard')->assertOk()->json('data'));
        $this->assertSame($programs, $aggregated['programs']);
        $this->assertEquals($expected, $aggregated['chapters']);
        $this->assertLessThanOrEqual(12, $count);
        fwrite(STDOUT, 'progress_requests='.$progressCount.PHP_EOL);

        return $progressCount;
    }

    public function test_current_dashboard_query_baseline(): void
    {
        fwrite(STDOUT, json_encode((array) DB::selectOne('SELECT current_database() AS database, host(inet_server_addr()) AS host, current_schema() AS schema')).PHP_EOL);
        $this->seed([ProgramSeeder::class, ProgramOfferSeeder::class]);
        Chapter::query()->update(['status' => 'draft', 'chapter_number' => DB::raw('chapter_number + 100000')]);
        $student = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $student->forceFill(['role' => 'student', 'account_status' => 'active'])->save();
        $this->fixture(1);
        fwrite(STDOUT, 'scenario=free_one_chapter'.PHP_EOL);
        $this->assertSame(6, $this->dashboard($student));
        $this->fixture(2);
        $this->fixture(3);
        fwrite(STDOUT, 'scenario=free_three_chapters'.PHP_EOL);
        $this->assertSame(6, $this->dashboard($student));
        $grant = AccessGrant::create(['user_id' => $student->id, 'program_id' => Program::where('code', 'n3')->firstOrFail()->id, 'plan_code' => 'lms', 'starts_at' => now()->subDay()->toDateString(), 'ends_at' => now()->addDay()->toDateString(), 'status' => 'active']);
        fwrite(STDOUT, 'scenario=lms_n3_three_chapters'.PHP_EOL);
        $this->assertSame(14, $this->dashboard($student));
        $grant->update(['plan_code' => 'sensei']);
        fwrite(STDOUT, 'scenario=sensei_n3_three_chapters'.PHP_EOL);
        $this->assertSame(14, $this->dashboard($student));
        $chapter = Chapter::where('program_id', Program::where('code', 'n5')->firstOrFail()->id)->where('chapter_number', 1)->firstOrFail();
        foreach ($chapter->flashcards as $card) {
            ActivityCompletion::create(['user_id' => $student->id, 'chapter_id' => $chapter->id, 'type' => 'flashcard', 'resource_id' => $card->id, 'completed_at' => now()]);
        }
        [$canonical] = $this->measure('canonical_progress', fn () => $this->getJson('/api/student/programs/'.$chapter->program_id.'/chapters/'.$chapter->id.'/progress')->assertOk()->json('data'));
        [$overall] = $this->measure('overall_progress', fn () => $this->getJson('/api/student/progress')->assertOk()->json('data'));
        $summary = collect($overall['chapters'])->firstWhere('chapter_id', $chapter->id);
        $this->assertSame(2, $canonical['activities']['flashcard']['total']);
        $this->assertSame(2, $canonical['activities']['reading']['total']);
        fwrite(STDOUT, json_encode(['canonical' => $canonical, 'overall_chapter' => $summary]).PHP_EOL);
        $admin = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $admin->forceFill(['role' => 'admin', 'account_status' => 'active'])->save();
        $this->actingAs($admin);
        $this->measure('admin_users', fn () => $this->getJson('/api/admin/users')->assertOk());
        $this->measure('admin_effective_access_one_student', fn () => $this->getJson('/api/admin/users/'.$student->id.'/effective-access')->assertOk());
        $this->measure('admin_effective_access_ten_requests', function () use ($student) {
            foreach (range(1, 10) as $index) {
                $this->getJson('/api/admin/users/'.$student->id.'/effective-access')->assertOk();
            }
        });
        $students = collect();
        foreach (range(1, 30) as $index) {
            $user = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
            $user->forceFill(['role' => 'student', 'account_status' => 'active', 'name' => 'Dashboard audit cohort '.$index])->save();
            AccessGrant::create(['user_id' => $user->id, 'program_id' => $grant->program_id, 'plan_code' => 'lms', 'starts_at' => now()->subDay()->toDateString(), 'ends_at' => now()->addDay()->toDateString(), 'status' => 'active']);
            $students->push($user);
        }
        $projections = [];
        $this->measure('admin_effective_access_30_distinct_students_before', function () use ($students, &$projections) {
            foreach ($students as $user) {
                $projections[$user->id] = $this->getJson('/api/admin/users/'.$user->id.'/effective-access')->assertOk()->json('data');
            }
        });
        [$embedded, $count] = $this->measure('admin_effective_access_30_distinct_students_after', fn () => $this->getJson('/api/admin/users?search=Dashboard%20audit%20cohort&include=effective_access')->assertOk()->json('data'));
        $this->assertCount(30, $embedded);
        $this->assertSame(3, $count);
        foreach ($embedded as $row) {
            $this->assertSame($projections[$row['id']], $row['effective_access']);
        }
    }
}
