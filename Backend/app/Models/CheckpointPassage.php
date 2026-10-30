<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CheckpointPassage extends Model
{
    protected $fillable = ['checkpoint_package_id', 'title', 'body'];
}
