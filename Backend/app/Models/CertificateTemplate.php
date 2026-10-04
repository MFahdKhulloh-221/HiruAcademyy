<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CertificateTemplate extends Model
{
    protected $fillable = ['program', 'title', 'description', 'image', 'sort_order', 'status'];

    protected $attributes = ['sort_order' => 1, 'status' => 'draft'];

    protected function casts(): array
    {
        return ['sort_order' => 'integer'];
    }
}
