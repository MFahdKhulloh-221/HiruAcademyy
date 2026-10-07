<?php

namespace Tests\Feature;

use App\Models\ActivityCompletion;
use App\Models\AudioQuestion;
use App\Models\Chapter;
use App\Models\CommunityThread;
use App\Models\CommunityTopic;
use App\Models\Flashcard;
use App\Models\LearningModule;
use App\Models\Program;
use App\Models\SenseiProfile;
use App\Models\TryOut;
use App\Models\TryOutQuestion;
use App\Models\User;
use Database\Seeders\ProgramOfferSeeder;
use Database\Seeders\ProgramSeeder;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ManualQaBatch2Test extends TestCase
{
    use DatabaseTransactions;

    private User $student;

    private User $admin;

    private Chapter $chapter;

    private TryOut $tryOut;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([ProgramSeeder::class, ProgramOfferSeeder::class]);
        $this->student = User::create([
            'name' => 'QA Student',
            'email' => 'qa.student@test.com',
            'whatsapp' => '+6281111111100',
            'password' => Hash::make('Password123!'),
            'role' => 'student',
            'account_status' => 'active',
        ]);
        $this->admin = User::create([
            'name' => 'QA Admin',
            'email' => 'qa.admin@test.com',
            'whatsapp' => '+6281111111101',
            'password' => Hash::make('Password123!'),
            'role' => 'admin',
            'account_status' => 'active',
        ]);

        $program = Program::where('code', 'n5')->firstOrFail();
        $this->chapter = Chapter::create([
            'program_id' => $program->id,
            'chapter_number' => 1,
            'title' => 'Chapter 1 Fixture',
            'status' => 'published',
        ]);

        Flashcard::create([
            'chapter_id' => $this->chapter->id,
            'japanese' => '猫',
            'reading' => 'ねこ',
            'meaning' => 'Kucing',
            'status' => 'published',
        ]);

        LearningModule::create([
            'chapter_id' => $this->chapter->id,
            'title' => 'Modul Tata Bahasa N5',
            'description' => 'Penjelasan partikel dasar.',
            'module_type' => 'grammar',
            'file_url' => 'https://example.test/grammar.pdf',
            'status' => 'published',
        ]);

        CommunityTopic::firstOrCreate(
            ['slug' => 'diskusi-member'],
            ['title' => 'Diskusi Member', 'description' => 'Forum diskusi', 'status' => 'published']
        );
        CommunityTopic::firstOrCreate(
            ['slug' => 'tanya-sensei'],
            ['title' => 'Tanya Sensei', 'description' => 'Tanya Sensei pengajar', 'status' => 'published']
        );

        $this->tryOut = TryOut::create([
            'program_id' => $program->id,
            'title' => 'Try Out N5 Simulasi Test',
            'status' => 'published',
            'total_passing_score' => null,
        ]);

        foreach (['vocabulary_kanji', 'grammar', 'reading', 'audio'] as $session) {
            TryOutQuestion::create([
                'try_out_id' => $this->tryOut->id,
                'session' => $session,
                'question' => "Pertanyaan {$session}",
                'options' => ['A' => 'One', 'B' => 'Two', 'C' => 'Three', 'D' => 'Four'],
                'correct_option' => 'A',
                'point_value' => 45,
                'status' => 'published',
                'audio_url' => $session === 'audio' ? 'media/audio/018f0000-0000-7000-8000-000000000001.wav' : null,
            ]);
        }
    }

    public function test_audio_and_reading_answers_can_change_presubmit_and_key_is_hidden(): void
    {
        $program = Program::where('code', 'n5')->firstOrFail();
        $q1 = AudioQuestion::create([
            'chapter_id' => $this->chapter->id,
            'question' => 'Audio Q1',
            'options' => ['A' => 'One', 'B' => 'Two', 'C' => 'Three', 'D' => 'Four'],
            'correct_option' => 'C',
            'explanation' => 'Private explanation',
            'audio_url' => 'media/audio/018f0000-0000-7000-8000-000000000001.wav',
            'status' => 'published',
        ]);
        $q2 = AudioQuestion::create([
            'chapter_id' => $this->chapter->id,
            'question' => 'Audio Q2',
            'options' => ['A' => 'Alpha', 'B' => 'Beta', 'C' => 'Gamma', 'D' => 'Delta'],
            'correct_option' => 'A',
            'explanation' => 'Explanation 2',
            'audio_url' => 'media/audio/018f0000-0000-7000-8000-000000000001.wav',
            'status' => 'published',
        ]);

        $this->actingAs($this->student);
        $base = "/api/student/programs/{$program->id}/chapters/{$this->chapter->id}";
        $attempt = $this->postJson("{$base}/attempts", ['kind' => 'audio'])->assertCreated()->json('data');

        // Answer keys hidden before submit
        $this->assertStringNotContainsString('correct_option', json_encode($attempt));
        $this->assertStringNotContainsString('Private explanation', json_encode($attempt));

        // Save answer A for Q1
        $url = "{$base}/attempts/{$attempt['id']}";
        $this->putJson("{$url}/answers", ['answers' => [$q1->id => 'A'], 'revision' => 0])
            ->assertOk()
            ->assertJsonPath('data.answers.'.$q1->id, 'A');

        // Change answer from A to C for Q1 pre-submit
        $this->putJson("{$url}/answers", ['answers' => [$q1->id => 'C'], 'revision' => 1])
            ->assertOk()
            ->assertJsonPath('data.answers.'.$q1->id, 'C');

        // Submit requires all questions
        $this->postJson("{$url}/submit", ['answers' => [$q1->id => 'C'], 'revision' => 2])
            ->assertUnprocessable();

        // Submit both questions
        $submitted = $this->postJson("{$url}/submit", [
            'answers' => [$q1->id => 'C', $q2->id => 'A'],
            'revision' => 2,
        ])->assertOk()->json('data');

        $this->assertSame('completed', $submitted['status']);
        $this->assertSame(2, $submitted['result']['correct']);
        $this->assertSame(100.0, (float) $submitted['result']['percentage']);

        // Review is authorized after submit
        $review = $this->getJson("{$url}/review")->assertOk()->json('data');
        $this->assertSame('C', $review['questions'][0]['correct_option']);
        $this->assertSame('Private explanation', $review['questions'][0]['explanation']);
    }

    public function test_flashcards_endpoint_returns_real_metrics_and_zero_for_fresh_student(): void
    {
        $this->actingAs($this->student);
        $response = $this->getJson('/api/student/flashcards')->assertOk()->json('data');

        // Fresh account shows 0 studied cards and 0 streak
        $this->assertSame(0, $response['metrics']['cards_studied']);
        $this->assertSame(0, $response['metrics']['decks_completed']);
        $this->assertSame(0, $response['metrics']['streak_days']);
        $this->assertGreaterThan(0, $response['metrics']['cards_available']);
        $this->assertNotEmpty($response['decks']);
    }

    public function test_library_projects_canonical_resources_without_separate_table(): void
    {
        $this->actingAs($this->student);
        $response = $this->getJson('/api/student/library')->assertOk()->json('data');

        $categories = array_unique(array_column($response, 'category'));
        $this->assertContains('Tata Bahasa', $categories);
        $this->assertContains('Kosakata', $categories);
    }

    public function test_try_out_simulation_returns_published_sessions(): void
    {
        $this->actingAs($this->student);
        $response = $this->getJson('/api/student/try-outs')->assertOk()->json('data');

        $this->assertNotEmpty($response);
        $first = $response[0];
        $this->assertSame(180, $first['max_score']);
        $this->assertSame(19, $first['section_passing_score']);
        $this->assertNull($first['total_passing_score']);
        $this->assertCount(4, $first['sessions']);
    }

    public function test_community_student_can_create_and_read_thread(): void
    {
        $topic = CommunityTopic::where('slug', 'diskusi-member')->firstOrFail();

        // Grant LMS access so student is not Free
        $program = Program::where('code', 'n5')->firstOrFail();
        DB::table('access_grants')->insert([
            'user_id' => $this->student->id,
            'program_id' => $program->id,
            'plan_code' => 'lms',
            'starts_at' => now()->subDay(),
            'ends_at' => now()->addMonths(6),
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($this->student);
        $thread = $this->postJson('/api/community/threads', [
            'topic_id' => $topic->id,
            'title' => 'Pertanyaan Baru',
            'content' => 'Bagaimana cara belajar hiragana cepat?',
        ])->assertCreated()->json('data');

        $this->assertNotEmpty($thread['id']);

        $list = $this->getJson('/api/community/threads?topic_slug=diskusi-member')->assertOk()->json('data');
        $this->assertContains('Pertanyaan Baru', array_column($list, 'title'));
    }

    public function test_ask_sensei_authorization_requires_sensei_profile_to_answer(): void
    {
        $tanyaTopic = CommunityTopic::where('slug', 'tanya-sensei')->firstOrFail();

        // Grant Sensei access to student
        $program = Program::where('code', 'n5')->firstOrFail();
        DB::table('access_grants')->insert([
            'user_id' => $this->student->id,
            'program_id' => $program->id,
            'plan_code' => 'sensei',
            'starts_at' => now()->subDay(),
            'ends_at' => now()->addMonth(),
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($this->student);
        $threadData = $this->postJson('/api/community/threads', [
            'topic_id' => $tanyaTopic->id,
            'title' => 'Tanya Sensei Soal Bunpou',
            'content' => 'Sensei, mohon bantuannya.',
            'is_ask_sensei' => true,
        ])->assertCreated()->json('data');

        $thread = CommunityThread::findOrFail($threadData['id']);

        // Another student with Sensei plan cannot answer
        $otherStudent = User::create([
            'name' => 'Other Student',
            'email' => 'other.student@test.com',
            'whatsapp' => '+6281111111102',
            'password' => Hash::make('Password123!'),
            'role' => 'student',
            'account_status' => 'active',
        ]);
        DB::table('access_grants')->insert([
            'user_id' => $otherStudent->id,
            'program_id' => $program->id,
            'plan_code' => 'sensei',
            'starts_at' => now()->subDay(),
            'ends_at' => now()->addMonth(),
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($otherStudent);
        $this->postJson("/api/community/threads/{$thread->id}/replies", [
            'content' => 'Saya coba jawab ya.',
        ])->assertForbidden();

        // Sensei instructor with linked SenseiProfile CAN answer
        $senseiUser = User::create([
            'name' => 'Sensei Ren',
            'email' => 'sensei.ren@test.com',
            'whatsapp' => '+6281111111103',
            'password' => Hash::make('Password123!'),
            'role' => 'student',
            'account_status' => 'active',
        ]);
        SenseiProfile::create([
            'user_id' => $senseiUser->id,
            'name' => 'Sensei Ren',
            'role' => 'Mentor',
            'bio' => 'Mentor berpengalaman JLPT N5-N1.',
            'expertise' => ['Grammar', 'Kanji'],
            'active' => true,
            'level' => 'n5',
        ]);

        $this->actingAs($senseiUser);
        $this->postJson("/api/community/threads/{$thread->id}/replies", [
            'content' => 'Konnichiwa! Ini penjelasan dari Sensei.',
        ])->assertCreated()->assertJsonPath('data.author.is_sensei', true);
    }

    public function test_progress_persists_and_starts_at_zero(): void
    {
        $this->actingAs($this->student);
        $progress = $this->getJson('/api/student/progress')->assertOk()->json('data');

        $this->assertSame(0, $progress['overall_percentage']);
        $this->assertSame(0, $progress['kanji_mastered']);
        $this->assertSame(0, $progress['practice_completed']);
        $this->assertSame(0, $progress['streak_days']);

        // Add a completion
        ActivityCompletion::create([
            'user_id' => $this->student->id,
            'chapter_id' => $this->chapter->id,
            'type' => 'flashcard',
            'resource_id' => 1,
            'completed_at' => now(),
        ]);

        $updated = $this->getJson('/api/student/progress')->assertOk()->json('data');
        $this->assertSame(1, $updated['streak_days']);
    }

    public function test_password_change_requires_valid_current_password(): void
    {
        $this->actingAs($this->student);

        // Wrong current password fails
        $this->putJson('/api/me/password', [
            'current_password' => 'WrongPassword!',
            'password' => 'NewPassword123!',
            'password_confirmation' => 'NewPassword123!',
        ])->assertUnprocessable();

        // Valid current password updates password
        $this->putJson('/api/me/password', [
            'current_password' => 'Password123!',
            'password' => 'NewPassword123!',
            'password_confirmation' => 'NewPassword123!',
        ])->assertOk();

        $this->assertTrue(Hash::check('NewPassword123!', $this->student->fresh()->password));
    }
}
