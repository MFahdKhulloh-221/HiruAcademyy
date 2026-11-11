<?php

namespace Tests\Feature;

use App\Models\TryOut;
use App\Models\TryOutAttempt;
use App\Models\User;
use App\Services\AdminTryOutReportService;
use App\Services\ChapterAccessPolicy;
use App\Services\TryOutService;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Bootstrap\LoadConfiguration;
use Illuminate\Foundation\Bootstrap\LoadEnvironmentVariables;
use Illuminate\Foundation\Testing\TestCase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use ZipArchive;

class AdminTryOutReportTest extends TestCase
{
    private TryOut $tryOut;

    private User $admin;

    private User $student;

    private string $base;

    public function createApplication()
    {
        // Deliberately bypass Tests\TestCase's PostgreSQL-only guard: this suite owns only :memory:.
        $app = require Application::inferBasePath().'/bootstrap/app.php';
        $this->traitsUsedByTest = [];
        $app->instance(LoadEnvironmentVariables::class, new class extends LoadEnvironmentVariables
        {
            public function bootstrap(\Illuminate\Contracts\Foundation\Application $app) {}
        });
        if ($app->configurationIsCached()) {
            throw new \RuntimeException('Report tests require uncached configuration.');
        }
        $app->afterBootstrapping(LoadConfiguration::class, function ($app) {
            $app['config']->set([
                'app.env' => 'testing',
                'app.key' => 'base64:'.base64_encode(str_repeat('t', 32)),
                'database.default' => 'sqlite',
                'database.connections' => ['sqlite' => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '', 'foreign_key_constraints' => true]],
                'cache.default' => 'array',
                'session.driver' => 'array',
                'queue.default' => 'sync',
                'mail.default' => 'array',
            ]);
        });
        $app->make(Kernel::class)->bootstrap();

        return $app;
    }

    protected function setUp(): void
    {
        if (! extension_loaded('pdo_sqlite')) {
            $this->markTestSkipped('pdo_sqlite required; never fall back to PostgreSQL.');
        }
        parent::setUp();
        $this->assertSame(':memory:', DB::connection()->getDatabaseName());
        $this->assertSame('sqlite', DB::connection()->getDriverName());
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            foreach (['name', 'email', 'whatsapp', 'role', 'account_status'] as $column) {
                $table->string($column);
            }
            $table->timestamps();
        });
        Schema::create('programs', function (Blueprint $table) {
            $table->id();
            $table->string('code');
            $table->string('name');
            $table->string('family');
            $table->timestamps();
        });
        Schema::create('try_outs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('program_id');
            $table->string('title');
            $table->string('status')->default('published');
            $table->string('access_type')->default('free');
            $table->integer('max_score')->default(100);
            $table->integer('total_passing_score')->nullable();
            $table->integer('duration_minutes')->nullable();
            $table->integer('sort_order')->default(0);
            $table->json('session_passing_scores')->nullable();
            $table->timestamps();
        });
        Schema::create('try_out_questions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('try_out_id');
            $table->string('question');
            $table->string('correct_option');
            $table->string('status')->default('published');
        });
        Schema::create('try_out_attempts', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('try_out_id');
            $table->string('status');
            foreach (['content_snapshot', 'grading_snapshot', 'result_snapshot', 'answers', 'completed_sessions'] as $column) {
                $table->json($column)->nullable();
            }
            $table->integer('current_session')->default(0);
            $table->integer('revision')->default(0);
            foreach (['started_at', 'expires_at', 'completed_at', 'abandoned_at'] as $column) {
                $table->timestamp($column)->nullable();
            }
            $table->timestamps();
        });
        DB::table('programs')->insert(['id' => 1, 'code' => 'n5', 'name' => 'JLPT N5', 'family' => 'jlpt']);
        $this->tryOut = TryOut::create(['program_id' => 1, 'title' => 'Report fixture', 'access_type' => 'free']);
        $this->admin = $this->user(1, 'Admin', 'admin');
        $this->student = $this->user(2, '=SUM(1,2)', 'student');
        $this->base = '/api/admin/try-outs/'.$this->tryOut->id.'/reports';
    }

    private function user(int $id, string $name, string $role = 'student'): User
    {
        DB::table('users')->insert(['id' => $id, 'name' => $name, 'email' => 'fixture'.$id.'@example.test', 'whatsapp' => '+62812000000'.$id, 'role' => $role, 'account_status' => 'active']);

        return User::findOrFail($id);
    }

    private function question(int $id = 10, string $text = 'Snapshot original'): array
    {
        return ['id' => $id, 'session' => 'vocabulary_kanji', 'question' => $text, 'options' => ['A' => 'One', 'B' => 'Two', 'C' => 'Three', 'D' => 'Four'], 'reading_passage' => null, 'audio_url' => null, 'instruction' => null, 'japanese' => null];
    }

    private function attempt(array $questions, array $answers, int $score = 50, bool $passed = false, array $extra = []): TryOutAttempt
    {
        $grades = [];
        foreach ($questions as $question) {
            $grades[$question['id']] = ['correct_option' => 'A', 'explanation' => 'Snapshot explanation', 'point_value' => 50];
        }

        return TryOutAttempt::create(array_replace([
            'try_out_id' => $this->tryOut->id, 'user_id' => $this->student->id, 'status' => 'completed',
            'content_snapshot' => $questions, 'grading_snapshot' => ['questions' => $grades, 'passages' => [], 'max_score' => 100, 'total_passing_score' => 60, 'session_passing_scores' => []],
            'answers' => $answers, 'completed_sessions' => array_keys(TryOutService::SESSIONS), 'current_session' => 4, 'revision' => 1,
            'result_snapshot' => ['earned' => $score, 'max' => 100, 'correct' => $score > 0 ? 1 : 0, 'wrong' => 0, 'unanswered' => 0, 'overall_pass' => $passed, 'total_passing_score' => 60, 'sessions' => array_map(fn ($code) => ['code' => $code, 'label' => TryOutService::SESSIONS[$code], 'earned' => $code === 'vocabulary_kanji' ? $score : 0, 'max' => $code === 'vocabulary_kanji' ? 100 : 0, 'correct' => $code === 'vocabulary_kanji' && $score > 0 ? 1 : 0, 'wrong' => 0, 'unanswered' => 0, 'passing_score' => 0, 'passing_score_basis' => 'points', 'pass' => $passed], array_keys(TryOutService::SESSIONS))],
            'started_at' => '2026-10-01 01:00:00', 'completed_at' => '2026-10-01 01:20:00',
        ], $extra));
    }

    public function test_report_routes_require_active_admin(): void
    {
        $attempt = $this->attempt([$this->question()], [10 => 'A']);
        foreach (['', '/participants', '/attempts/'.$attempt->id, '/export.xlsx'] as $suffix) {
            $this->getJson($this->base.$suffix)->assertUnauthorized();
        }
        $this->actingAs($this->student);
        foreach (['', '/participants', '/attempts/'.$attempt->id, '/export.xlsx'] as $suffix) {
            $denied = $this->getJson($this->base.$suffix)->assertForbidden();
            $this->assertStringNotContainsString($this->student->whatsapp, $denied->getContent());
            $this->assertStringNotContainsString($this->student->name, $denied->getContent());
        }
        $denied = $this->getJson('/api/student/try-outs/'.$this->tryOut->id.'/reports')->assertNotFound();
        $this->assertStringNotContainsString($this->student->whatsapp, $denied->getContent());
        $this->admin->account_status = 'inactive';
        $this->actingAs($this->admin)->getJson($this->base)->assertUnauthorized();
    }

    public function test_overview_counts_attempts_versions_and_received_denominators_without_writes(): void
    {
        $this->attempt([$this->question(), $this->question(11, 'Only two recipients')], [10 => 'A'], 50);
        $this->attempt([$this->question(), $this->question(11, 'Only two recipients')], [10 => 'B', 11 => 'A'], 50);
        $this->attempt([$this->question(10, 'Edited snapshot')], [10 => 'A'], 100, true);
        $this->attempt([$this->question()], [], 0, false, ['status' => 'in_progress', 'completed_at' => null, 'expires_at' => '2020-01-01 00:00:00', 'result_snapshot' => null]);
        $this->attempt([$this->question()], [], 0, false, ['status' => 'in_progress', 'completed_at' => null, 'abandoned_at' => '2026-10-01 01:10:00']);
        DB::table('try_out_questions')->insert(['id' => 10, 'try_out_id' => $this->tryOut->id, 'question' => 'Snapshot original', 'correct_option' => 'A']);
        DB::table('try_out_questions')->where('id', 10)->update(['question' => 'Canonical changed after submission', 'correct_option' => 'D']);
        $before = DB::table('try_out_attempts')->orderBy('id')->get()->toJson();
        $response = $this->actingAs($this->admin)->getJson($this->base)->assertOk();
        $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));
        $data = $response->json('data');
        $this->assertSame(3, $data['summary']['responses']);
        $this->assertSame(1, $data['summary']['unique_participants']);
        $this->assertSame(1, $data['summary']['passed']);
        $this->assertSame(2, $data['summary']['failed']);
        $this->assertEqualsWithDelta(200 / 3, $data['summary']['mean'], 0.01);
        $this->assertEquals(50, $data['summary']['median']);
        $this->assertEquals(50, $data['summary']['min']);
        $this->assertEquals(100, $data['summary']['max']);
        $this->assertSame(3, array_sum(array_column($data['histogram'], 'count')));
        $this->assertCount(3, $data['questions']);
        $versions = collect($data['questions'])->where('id', 10);
        $this->assertCount(2, $versions);
        $this->assertContains('Snapshot original', $versions->pluck('question')->all());
        $this->assertNotContains('Canonical changed after submission', $versions->pluck('question')->all());
        $this->assertSame(['A'], $versions->pluck('correct_option')->unique()->values()->all());
        $this->assertCount(2, $versions->pluck('fingerprint')->unique());
        $question = collect($data['questions'])->firstWhere('id', 11);
        $this->assertSame(2, $question['received']);
        $this->assertSame(1, $question['not_received']);
        $this->assertSame(1, $question['correct']);
        $this->assertSame(0, $question['wrong']);
        $this->assertSame(1, $question['unanswered']);
        $this->assertEquals(50, $question['correct_percentage']);
        $this->assertSame(1, $question['distribution']['A']['count']);
        $this->assertEquals(50, $question['distribution']['A']['percentage']);
        $this->assertSame($before, DB::table('try_out_attempts')->orderBy('id')->get()->toJson());
    }

    public function test_participant_filters_pagination_and_individual_snapshot_are_scoped(): void
    {
        $first = $this->attempt([$this->question()], [10 => 'A'], 100, true);
        $second = $this->attempt([$this->question(10, 'Later snapshot')], [], 0, false, ['started_at' => '2026-10-02 01:00:00', 'completed_at' => '2026-10-02 01:20:00']);
        $other = $this->user(3, 'Other student');
        $this->attempt([$this->question()], [10 => 'B'], 0, false, ['user_id' => $other->id]);
        $before = DB::table('try_out_attempts')->orderBy('id')->get()->toJson();
        $this->actingAs($this->admin);
        $this->getJson($this->base.'/participants?per_page=1&page=2')->assertOk()->assertJsonPath('meta.total', 3)->assertJsonPath('meta.current_page', 2)->assertJsonCount(1, 'data');
        $this->getJson($this->base.'/participants?status=passed')->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.id', $first->id);
        $this->getJson($this->base.'/participants?search=Other')->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.user_id', $other->id);
        $this->getJson($this->base.'/participants?date_from=2026-10-02&date_to=2026-10-02&user_id='.$this->student->id)->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.id', $second->id);
        $this->getJson($this->base.'/attempts/'.$first->id)->assertOk()->assertJsonPath('data.participant.name', $this->student->name)->assertJsonPath('data.questions.0.question', 'Snapshot original')->assertJsonPath('data.questions.0.correct_option', 'A')->assertJsonPath('data.questions.0.explanation', 'Snapshot explanation')->assertJsonPath('data.questions.0.outcome', 'correct')->assertJsonCount(2, 'data.attempts');
        $this->getJson($this->base.'/attempts/'.$second->id)->assertOk()->assertJsonPath('data.questions.0.outcome', 'unanswered');
        $foreign = TryOut::create(['program_id' => 1, 'title' => 'Other assessment']);
        $this->getJson('/api/admin/try-outs/'.$foreign->id.'/reports/attempts/'.$first->id)->assertNotFound();
        foreach (['status=unknown', 'date_from=not-a-date', 'per_page=0', 'page=0'] as $query) {
            $this->getJson($this->base.'/participants?'.$query)->assertUnprocessable();
        }
        $this->assertSame($before, DB::table('try_out_attempts')->orderBy('id')->get()->toJson());
    }

    public function test_individual_resolves_ordered_passage_blocks_without_mutating_snapshot(): void
    {
        $blocks = [['type' => 'text', 'text' => '<p>Before</p>'], ['type' => 'image', 'image' => 'https://example.test/diagram.png', 'image_alt' => 'Diagram'], ['type' => 'text', 'text' => '<p>After</p>']];
        $attempt = $this->attempt([$this->question() + ['passage_id' => 7]], [10 => 'A']);
        $grading = $attempt->grading_snapshot;
        $grading['passages'][7] = ['id' => 7, 'title' => 'Group', 'body' => 'Legacy fallback', 'blocks' => $blocks];
        DB::table('try_out_attempts')->where('id', $attempt->id)->update(['grading_snapshot' => json_encode($grading)]);
        $attempt->refresh();
        $before = $attempt->getAttributes();
        $response = $this->actingAs($this->admin)->getJson($this->base.'/attempts/'.$attempt->id)->assertOk();
        $response->assertJsonPath('data.questions.0.passage.blocks.0.text', '<p>Before</p>')
            ->assertJsonPath('data.questions.0.passage.blocks.1.image', 'https://example.test/diagram.png')
            ->assertJsonPath('data.questions.0.passage.blocks.1.image_resolved_url', 'https://example.test/diagram.png')
            ->assertJsonPath('data.questions.0.passage.blocks.2.text', '<p>After</p>')
            ->assertJsonPath('data.grading_snapshot.passages.7.blocks', $blocks);
        $this->assertSame($before, $attempt->fresh()->getAttributes());
    }

    public function test_individual_uses_authoritative_grading_not_injected_content_fields(): void
    {
        $attempt = $this->attempt([array_replace($this->question(), ['correct_option' => 'D', 'point_value' => 999, 'earned' => 999])], [10 => 'A']);
        $before = DB::table('try_out_attempts')->orderBy('id')->get()->toJson();
        $this->actingAs($this->admin)->getJson($this->base.'/attempts/'.$attempt->id)->assertOk()
            ->assertJsonPath('data.questions.0.correct_option', 'A')
            ->assertJsonPath('data.questions.0.point_value', 50)
            ->assertJsonPath('data.questions.0.earned', 50);
        $this->assertSame($before, DB::table('try_out_attempts')->orderBy('id')->get()->toJson());
    }

    public function test_real_student_show_exposes_no_participant_pii_or_reports(): void
    {
        $this->attempt([$this->question()], [10 => 'A']);
        $access = \Mockery::mock(ChapterAccessPolicy::class);
        $access->shouldReceive('canAccessProgram')->once()->andReturn(true);
        $this->app->instance(ChapterAccessPolicy::class, $access);
        DB::table('try_outs')->where('id', $this->tryOut->id)->update(['status' => 'published']);
        $response = $this->actingAs($this->student)->getJson('/api/student/try-outs/'.$this->tryOut->id)->assertOk();
        foreach ([$this->student->name, $this->student->whatsapp, $this->student->email] as $pii) {
            $this->assertStringNotContainsString($pii, $response->getContent());
        }
        foreach (['participants', 'summary', 'histogram', 'hardest', 'grading_snapshot', 'answers'] as $key) {
            $this->assertArrayNotHasKey($key, $response->json('data'));
        }
    }

    public function test_jakarta_day_boundaries_and_literal_search_are_shared_by_reports(): void
    {
        $literal = $this->user(3, 'Literal %_ user');
        $this->attempt([$this->question()], [10 => 'A'], 100, true, ['user_id' => $literal->id, 'completed_at' => '2026-10-01 17:00:00']);
        $this->attempt([$this->question()], [], 0, false, ['completed_at' => '2026-10-01 16:59:59']);
        $this->attempt([$this->question()], [], 0, false, ['completed_at' => '2026-10-02 17:00:00']);
        $query = '?date_from=2026-10-02&date_to=2026-10-02&status=passed';
        $this->actingAs($this->admin)->getJson($this->base.$query)->assertOk()->assertJsonPath('data.summary.responses', 1)->assertJsonPath('data.summary.mean', 100);
        $this->getJson($this->base.'/participants'.$query)->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.user_id', $literal->id);
        $export = $this->get($this->base.'/export.xlsx'.$query)->assertOk();
        $path = tempnam(sys_get_temp_dir(), 'hiru-filter-test-');
        try {
            file_put_contents($path, $export->streamedContent());
            $zip = new ZipArchive;
            $this->assertTrue($zip->open($path));
            $summary = simplexml_load_string($zip->getFromName('xl/worksheets/sheet1.xml'));
            $summary->registerXPathNamespace('s', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
            $this->assertSame('1', (string) $summary->xpath('//s:row[s:c/s:is/s:t="responses"]/s:c[2]/s:v')[0]);
            $this->assertSame('100', (string) $summary->xpath('//s:row[s:c/s:is/s:t="mean"]/s:c[2]/s:v')[0]);
            $analysis = simplexml_load_string($zip->getFromName('xl/worksheets/sheet3.xml'));
            $analysis->registerXPathNamespace('s', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
            $this->assertCount(2, $analysis->xpath('//s:sheetData/s:row'));
            $this->assertSame('1', (string) $analysis->xpath('//s:c[@r="M2"]/s:v')[0]);
            $this->assertSame('100', (string) $analysis->xpath('//s:c[@r="R2"]/s:v')[0]);
            foreach ([2, 4] as $index) {
                $sheet = simplexml_load_string($zip->getFromName('xl/worksheets/sheet'.$index.'.xml'));
                $sheet->registerXPathNamespace('s', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
                $this->assertCount(2, $sheet->xpath('//s:sheetData/s:row'), 'Filtered export contains header and exactly one cohort row.');
            }
            $zip->close();
        } finally {
            unlink($path);
        }
        foreach (['%', '_'] as $search) {
            $this->getJson($this->base.'/participants?search='.rawurlencode($search))->assertOk()->assertJsonPath('meta.total', 1);
        }
    }

    public function test_empty_and_even_sized_summary_preserve_stored_scores(): void
    {
        $this->actingAs($this->admin)->getJson($this->base)->assertOk()
            ->assertJsonPath('data.summary.responses', 0)
            ->assertJsonPath('data.summary.mean', null)
            ->assertJsonPath('data.summary.median', null)
            ->assertJsonCount(0, 'data.histogram');
        foreach ([0, 20, 80, 100] as $score) {
            $this->attempt([$this->question()], [], $score);
        }
        $this->getJson($this->base)->assertOk()
            ->assertJsonPath('data.summary.responses', 4)
            ->assertJsonPath('data.summary.mean', 50)
            ->assertJsonPath('data.summary.median', 50);
        $this->getJson($this->base.'/participants')->assertOk()
            ->assertJsonPath('data.0.raw_score', 100)
            ->assertJsonPath('data.0.final_score', 100);
    }

    public function test_canonical_versions_ignore_key_order_but_preserve_grading_and_passage_changes(): void
    {
        $service = app(AdminTryOutReportService::class);
        $question = $this->question() + ['passage_id' => 7];
        $grading = ['questions' => [10 => ['correct_option' => 'A', 'point_value' => 50]], 'passages' => [7 => ['title' => 'Original', 'body' => '<p>Original</p>']]];
        $original = $service->questionVersion($question, $grading)['fingerprint'];
        $reordered = array_reverse($question, true);
        $reordered['options'] = array_reverse($question['options'], true);
        $this->assertSame($original, $service->questionVersion($reordered, $grading)['fingerprint']);
        $changedGrade = $grading;
        $changedGrade['questions'][10]['correct_option'] = 'B';
        $this->assertNotSame($original, $service->questionVersion($question, $changedGrade)['fingerprint']);
        $grading['passages'][7]['body'] = '<p>Edited</p>';
        $this->assertNotSame($original, $service->questionVersion($question, $grading)['fingerprint']);
    }

    public function test_xlsx_is_readable_four_sheet_package_with_safe_text_numbers_and_dates(): void
    {
        $unsafe = ['=SUM(1,2)', '+SUM(1,2)', '-SUM(1,2)', '@SUM(1,2)', "\t=SUM(1,2)", "\n=SUM(1,2)"];
        foreach ($unsafe as $index => $text) {
            $this->attempt([$this->question(10 + $index, $text)], [10 + $index => 'A'], 100, true);
        }
        $response = $this->actingAs($this->admin)->get($this->base.'/export.xlsx')->assertOk();
        $this->assertStringContainsString('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', $response->headers->get('Content-Type'));
        $path = tempnam(sys_get_temp_dir(), 'hiru-report-test-');
        try {
            file_put_contents($path, $response->streamedContent());
            $zip = new ZipArchive;
            $this->assertTrue($zip->open($path));
            foreach (['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml'] as $part) {
                $this->assertNotFalse(simplexml_load_string($zip->getFromName($part)), $part.' must parse.');
            }
            $workbook = simplexml_load_string($zip->getFromName('xl/workbook.xml'));
            $this->assertNotFalse($workbook);
            $this->assertCount(4, $workbook->sheets->sheet);
            $all = '';
            $numbers = 0;
            $inlineTexts = [];
            for ($index = 1; $index <= 4; $index++) {
                $xml = $zip->getFromName('xl/worksheets/sheet'.$index.'.xml');
                $this->assertNotFalse($xml);
                $sheet = simplexml_load_string($xml);
                $this->assertNotFalse($sheet);
                $sheet->registerXPathNamespace('s', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
                $this->assertCount(0, $sheet->xpath('//s:f'), 'Untrusted text must never become formulas.');
                $numbers += count($sheet->xpath('//s:c[not(@t) or @t="n"]/s:v'));
                $this->assertNotEmpty($sheet->xpath('//s:pane[@state="frozen"]'));
                $this->assertNotEmpty($sheet->xpath('//s:autoFilter'));
                foreach ($sheet->xpath('//s:c[@t="inlineStr"]/s:is/s:t') as $text) {
                    $inlineTexts[] = (string) $text;
                }
                $all .= $xml;
            }
            $this->assertGreaterThan(0, $numbers);
            $this->assertStringContainsString('SUM(1,2)', $all);
            foreach ($unsafe as $text) {
                $this->assertTrue(in_array($text, $inlineTexts, true) || in_array("'".$text, $inlineTexts, true), 'Formula-like input must remain explicit inline text.');
            }
            $this->assertMatchesRegularExpression('/<c[^>]*s="[1-9][0-9]*"[^>]*>\s*<v>46[0-9]{3}(?:\.[0-9]+)?<\/v>/', $all, 'Dates must use numeric cells with date style.');
            $this->assertMatchesRegularExpression('/<c[^>]*>\s*<v>100<\/v>/', $all, 'Scores must stay numeric.');
            if ($artifact = getenv('HIRU_REPORT_XLSX_ARTIFACT')) {
                $this->assertStringStartsWith(sys_get_temp_dir(), $artifact);
                copy($path, $artifact);
            }
            $this->assertTrue(str_contains($all, '2026-10-01') || preg_match('/<v>46[0-9]{3}(?:\.[0-9]+)?<\/v>/', $all) === 1, 'Completion date must survive XLSX serialization.');
            $zip->close();
        } finally {
            unlink($path);
        }
    }
}
