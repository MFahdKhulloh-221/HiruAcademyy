<?php

use App\Services\MediaService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        app(MediaService::class)->locked(function () {
            $profiles = DB::table('sensei_profiles')->orderBy('sort_order')->orderBy('id')->lockForUpdate()->get(['id']);
            foreach ($profiles as $index => $profile) {
                DB::table('sensei_profiles')->where('id', $profile->id)->update(['sort_order' => $index + 1]);
            }
        });
    }

    public function down(): void
    {
        // Keep normalized positions; previous duplicate positions cannot be recovered.
    }
};
