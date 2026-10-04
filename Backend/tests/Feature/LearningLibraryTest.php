<?php

namespace Tests\Feature;

use App\Models\AccessGrant;
use App\Models\Chapter;
use App\Models\LearningModule;
use App\Models\Program;
use App\Models\User;
use App\Services\LearningLibraryService;
use Database\Seeders\ProgramOfferSeeder;
use Database\Seeders\ProgramSeeder;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class LearningLibraryTest extends TestCase
{
    use DatabaseTransactions;

    public function test_library_projects_only_accessible_published_canonical_modules(): void
    {
        $this->assertSame('hiru_academy_test', DB::connection()->getDatabaseName());
        $this->seed([ProgramSeeder::class, ProgramOfferSeeder::class]);
        $user = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $program = Program::where('code', 'n5')->firstOrFail();
        $first = Chapter::create(['program_id' => $program->id, 'chapter_number' => 1, 'title' => 'Preview', 'status' => 'published', 'sort_order' => 0]);
        $locked = Chapter::create(['program_id' => $program->id, 'chapter_number' => 2, 'title' => 'Locked', 'status' => 'published', 'sort_order' => 1]);
        $draft = Chapter::create(['program_id' => $program->id, 'chapter_number' => 3, 'title' => 'Draft', 'status' => 'draft', 'sort_order' => 2]);
        $visible = LearningModule::create(['chapter_id' => $first->id, 'title' => 'Canonical module', 'module_type' => 'grammar', 'file_url' => 'https://media.example.test/module.pdf', 'status' => 'published', 'sort_order' => 0]);
        foreach ([[$first, 'draft'], [$locked, 'published'], [$draft, 'published']] as [$chapter, $status]) {
            LearningModule::create(['chapter_id' => $chapter->id, 'title' => 'Hidden', 'module_type' => 'grammar', 'file_url' => 'https://media.example.test/hidden.pdf', 'status' => $status, 'sort_order' => 1]);
        }
        $service = app(LearningLibraryService::class);
        $items = $service->modules($user);
        $this->assertSame([$visible->id], array_column($items, 'id'));
        $this->assertSame($first->id, $items[0]['chapter']['id']);
        $this->getJson('/api/student/library')->assertUnauthorized();
        $this->actingAs($user)->getJson('/api/student/library')->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $visible->id);
        $user->role = 'admin';
        $user->save();
        $this->getJson('/api/student/library')->assertForbidden();
        $user->role = 'student';
        $user->account_status = 'inactive';
        $user->save();
        $this->getJson('/api/student/library')->assertUnauthorized();
        $user->account_status = 'active';
        $user->save();
        $grant = AccessGrant::create([
            'user_id' => $user->id, 'program_id' => Program::where('code', 'n4')->firstOrFail()->id,
            'plan_code' => 'lms', 'starts_at' => now()->subDay()->toDateString(),
            'ends_at' => now()->addDay()->toDateString(), 'status' => 'active',
        ]);
        $this->getJson('/api/student/library')->assertOk()->assertJsonCount(2, 'data');
        $grant->update(['ends_at' => now()->subDay()->toDateString()]);
        $this->getJson('/api/student/library')->assertOk()->assertJsonCount(1, 'data');
        $visible->update(['title' => 'Updated canonical title']);
        $this->assertSame('Updated canonical title', $service->modules($user)[0]['title']);
        $program->update(['status' => 'inactive']);
        $this->assertSame([], $service->modules($user));
    }
}
