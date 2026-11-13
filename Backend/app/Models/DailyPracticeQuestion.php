<?php

namespace App\Models;

class DailyPracticeQuestion extends TryOutQuestion
{
    protected $table = 'daily_practice_questions';

    protected $guarded = ['id'];

    protected $fillable = [];
}
