<?php

namespace Tests\Unit;

use App\Models\AccessGrant;
use App\Models\Program;
use App\Models\User;
use App\Services\EntitlementService;
use App\Services\ProgramAchievementLearningType;
use Tests\TestCase;

class ProgramAchievementLearningTypeTest extends TestCase
{
    private function grant(int $id, string $code, string $plan, array $extra = []): AccessGrant
    {
        $grant = (new AccessGrant)->forceFill(array_replace(['id' => $id, 'user_id' => 10, 'plan_code' => $plan,
            'status' => 'active', 'starts_at' => now()->subDay(), 'ends_at' => now()->addDay()], $extra));
        $grant->setRelation('program', new Program(['code' => $code]));

        return $grant;
    }

    public function test_cumulative_sources_are_deterministic_and_sensei_wins(): void
    {
        $service = new ProgramAchievementLearningType(new EntitlementService);
        $user = (new User)->forceFill(['id' => 10, 'role' => 'student', 'account_status' => 'active']);
        $target = new Program(['code' => 'n5', 'family' => 'jlpt']);
        $grants = [$this->grant(8, 'n5', 'lms'), $this->grant(9, 'n4', 'sensei'), $this->grant(3, 'n3', 'sensei')];
        $expected = ['learning_type' => 'sensei', 'grant_id' => 3, 'reason' => 'resolved'];
        $this->assertSame($expected, $service->fromGrants($user, $target, $grants));
        $this->assertSame($expected, $service->fromGrants($user, $target, array_reverse($grants)));
        $this->assertSame('sensei', $service->fromGrants($user, new Program(['code' => 'dasar']), [$grants[1]])['learning_type']);
        $this->assertNull($service->fromGrants($user, new Program(['code' => 'n2']), $grants)['learning_type']);
    }

    public function test_invalid_foreign_expired_future_grants_never_prove_membership(): void
    {
        $service = new ProgramAchievementLearningType(new EntitlementService);
        $user = (new User)->forceFill(['id' => 10, 'role' => 'student', 'account_status' => 'active']);
        $target = new Program(['code' => 'n5']);
        $grants = [$this->grant(1, 'n5', 'sensei', ['status' => 'inactive']),
            $this->grant(2, 'n5', 'sensei', ['user_id' => 11]),
            $this->grant(3, 'n5', 'sensei', ['ends_at' => now()->subDay()]),
            $this->grant(4, 'n5', 'sensei', ['starts_at' => now()->addDay()])];
        $this->assertSame('learning_type_unresolved', $service->fromGrants($user, $target, $grants)['reason']);
        $this->assertNull($service->fromGrants($user, $target, [])['learning_type']);
    }

    public function test_dynamic_non_jlpt_uses_only_effective_source_not_global_label(): void
    {
        $service = new ProgramAchievementLearningType(new EntitlementService);
        $user = (new User)->forceFill(['id' => 10, 'role' => 'student', 'account_status' => 'active']);
        foreach (['ssw-4', 'interview-b1'] as $code) {
            $program = new Program(['code' => $code]);
            $this->assertSame('lms', $service->fromGrants($user, $program, [$this->grant(1, $code, 'lms')])['learning_type']);
            $this->assertNull($service->fromGrants($user, $program, [$this->grant(1, $code, 'sensei')])['learning_type']);
            $this->assertNull($service->fromGrants($user, $program, [$this->grant(1, 'n1', 'sensei')])['learning_type']);
        }
    }
}
