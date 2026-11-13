<?php

namespace Tests\Unit;

use App\Models\Program;
use App\Models\ProgramAchievement;
use App\Models\ProgramAchievementSetting;
use App\Services\ProgramAchievementSettings;
use Illuminate\Database\Connection;
use Illuminate\Database\ConnectionResolverInterface;
use Illuminate\Events\Dispatcher;
use LogicException;
use PHPUnit\Framework\TestCase;

class StorageAchievement extends ProgramAchievement
{
    public function fireStorageEvent(string $event): mixed
    {
        return $this->fireModelEvent($event);
    }
}

class ProgramAchievementStorageTest extends TestCase
{
    private function achievement(): StorageAchievement
    {
        $achievement = new StorageAchievement([
            'user_id' => 1, 'program_id' => 2,
            'student_name_snapshot' => 'Student', 'program_name_snapshot' => 'JLPT N5',
            'program_code_snapshot' => 'n5', 'learning_type_snapshot' => 'lms',
            'presentation_snapshot' => ['title' => 'Certificate'],
            'completion_evidence_snapshot' => ['completed' => true], 'issued_at' => '2026-11-09T10:00:00+07:00',
        ]);
        $achievement->issuedByService = true;

        return $achievement;
    }

    public function test_creation_validates_required_fields_and_provenance_without_saving(): void
    {
        $dispatcher = ProgramAchievement::getEventDispatcher();
        ProgramAchievement::setEventDispatcher(new Dispatcher);
        StorageAchievement::clearBootedModels();
        try {
            foreach (['free', 'lms', 'sensei'] as $type) {
                $valid = $this->achievement();
                $valid->learning_type_snapshot = $type;
                $this->assertNull($valid->fireStorageEvent('creating'));
            }
            $invalid = [
                ['user_id', null], ['user_id', 0], ['user_id', -1], ['user_id', '1.5'],
                ['program_id', null], ['program_id', 0], ['program_id', -1],
                ['student_name_snapshot', null], ['student_name_snapshot', '   '],
                ['program_name_snapshot', null], ['program_name_snapshot', "\t"],
                ['program_code_snapshot', null], ['program_code_snapshot', ' '],
                ['learning_type_snapshot', null], ['learning_type_snapshot', 'admin'],
                ['issued_at', null], ['issued_at', 'not-a-date'],
                ['presentation_snapshot', null], ['presentation_snapshot', []], ['presentation_snapshot', ['list']],
                ['completion_evidence_snapshot', null], ['completion_evidence_snapshot', []], ['completion_evidence_snapshot', ['list']],
                ['issuedByService', false],
            ];
            foreach ($invalid as [$field, $value]) {
                $achievement = $this->achievement();
                if ($field === 'issued_at') {
                    $attributes = $achievement->getAttributes();
                    $attributes[$field] = $value;
                    $achievement->setRawAttributes($attributes);
                } else {
                    $achievement->$field = $value;
                }
                try {
                    $achievement->fireStorageEvent('creating');
                    $this->fail('Accepted invalid '.$field);
                } catch (LogicException $error) {
                    $this->assertNotSame('', $error->getMessage());
                }
            }
            foreach (['updating', 'deleting'] as $event) {
                try {
                    $this->achievement()->fireStorageEvent($event);
                    $this->fail('Allowed '.$event);
                } catch (LogicException $error) {
                    $this->assertSame('Program achievements are immutable.', $error->getMessage());
                }
            }
        } finally {
            StorageAchievement::clearBootedModels();
            if ($dispatcher) {
                ProgramAchievement::setEventDispatcher($dispatcher);
            } else {
                ProgramAchievement::unsetEventDispatcher();
            }
        }
    }

    public function test_absent_settings_use_virtual_defaults_without_database_access(): void
    {
        $original = ProgramAchievementSetting::getConnectionResolver();
        $connection = $this->getMockBuilder(Connection::class)->setConstructorArgs([null])->onlyMethods(['select'])->getMock();
        $connection->expects($this->once())->method('select')->willReturn([]);
        $resolver = $this->createMock(ConnectionResolverInterface::class);
        $resolver->method('connection')->willReturn($connection);
        ProgramAchievementSetting::setConnectionResolver($resolver);
        try {
            $program = new Program;
            $program->id = 2;
            $this->assertSame([
                'automatic_enabled' => true, 'title' => 'Sertifikat Penyelesaian Program',
                'description' => null, 'background_image' => null, 'presentation_version' => 1,
            ], (new ProgramAchievementSettings)->resolve($program));
        } finally {
            if ($original) {
                ProgramAchievementSetting::setConnectionResolver($original);
            } else {
                ProgramAchievementSetting::unsetConnectionResolver();
            }
        }
    }

    public function test_migrations_declare_restricted_keys_unique_pair_and_snapshot_checks(): void
    {
        $path = dirname(__DIR__, 2).'/database/migrations/';
        $settings = file_get_contents($path.'2026_11_09_000001_create_program_achievement_settings.php');
        $achievement = file_get_contents($path.'2026_11_09_000002_create_program_achievements.php');
        $this->assertStringContainsString("foreignId('program_id')->unique()->constrained()->restrictOnDelete()", $settings);
        foreach (['user_id', 'program_id'] as $field) {
            $this->assertStringContainsString("foreignId('$field')->constrained()->restrictOnDelete()", $achievement);
        }
        $this->assertStringContainsString("unique(['user_id', 'program_id'])", $achievement);
        $this->assertStringNotContainsString('cascade', $settings.$achievement);
        foreach (['student_name_snapshot', 'program_name_snapshot', 'program_code_snapshot'] as $field) {
            $this->assertStringContainsString("$field ~ '[^[:space:]]'", $achievement);
        }
        $this->assertStringContainsString("learning_type_snapshot IN ('free', 'lms', 'sensei')", $achievement);
        foreach (['presentation_snapshot', 'completion_evidence_snapshot'] as $field) {
            $this->assertStringContainsString("jsonb('$field')", $achievement);
            $this->assertStringContainsString("jsonb_typeof($field) = 'object'", $achievement);
            $this->assertStringContainsString("$field <> '{}'::jsonb", $achievement);
        }
    }
}
