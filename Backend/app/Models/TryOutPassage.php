<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TryOutPassage extends Model
{
    protected $fillable = ['try_out_id', 'title', 'body', 'image', 'image_alt', 'image_position'];
}
