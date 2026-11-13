<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

class ProgramAchievement extends Model
{
    protected $dateFormat = 'Y-m-d H:i:sP';

    protected $fillable = ['user_id', 'program_id', 'student_name_snapshot', 'program_name_snapshot', 'program_code_snapshot', 'learning_type_snapshot', 'presentation_snapshot', 'completion_evidence_snapshot', 'issued_at'];

    // Set only by the server issuance service; never populated through mass assignment.
    public bool $issuedByService = false;

    protected function casts(): array
    {
        return ['user_id' => 'integer', 'program_id' => 'integer', 'presentation_snapshot' => 'array', 'completion_evidence_snapshot' => 'array', 'issued_at' => 'immutable_datetime'];
    }

    protected static function booted(): void
    {
        static::creating(function (self $achievement) {
            if (! $achievement->issuedByService) {
                throw new LogicException('Program achievements must be issued by the server issuance service.');
            }
            foreach (['user_id', 'program_id'] as $field) {
                if (filter_var($achievement->getAttributes()[$field] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) === false) {
                    throw new LogicException('Program achievement IDs must be positive integers.');
                }
            }
            try {
                $issuedAt = $achievement->issued_at;
            } catch (\Throwable $error) {
                throw new LogicException('Program achievement issued_at must be a valid timestamp.', 0, $error);
            }
            if (! $issuedAt instanceof \DateTimeInterface) {
                throw new LogicException('Program achievement issued_at must be a valid timestamp.');
            }
            foreach (['student_name_snapshot', 'program_name_snapshot', 'program_code_snapshot'] as $field) {
                if (! is_string($achievement->$field) || ! preg_match('/\S/u', $achievement->$field)) {
                    throw new LogicException('Program achievement identity must not be blank.');
                }
            }
            if (! in_array($achievement->learning_type_snapshot, ['free', 'lms', 'sensei'], true)) {
                throw new LogicException('Invalid program achievement learning type.');
            }
            foreach (['presentation_snapshot', 'completion_evidence_snapshot'] as $field) {
                $snapshot = $achievement->$field;
                if (! is_array($snapshot) || $snapshot === [] || array_is_list($snapshot)) {
                    throw new LogicException('Program achievement snapshots must be nonempty JSON objects.');
                }
            }
        });
        static::updating(function () {
            throw new LogicException('Program achievements are immutable.');
        });
        static::deleting(function () {
            throw new LogicException('Program achievements are immutable.');
        });
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function program(): BelongsTo
    {
        return $this->belongsTo(Program::class);
    }
}
