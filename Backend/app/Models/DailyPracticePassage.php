<?php

namespace App\Models;

class DailyPracticePassage extends TryOutPassage
{
    protected $table = 'daily_practice_passages';

    protected $guarded = ['id'];

    protected $fillable = [];
}
