<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\ProgramController;
use Illuminate\Support\Facades\Route;

Route::prefix('api')->middleware('throttle:identity')->group(function () {
    Route::get('public/programs', [ProgramController::class, 'publicIndex']);
    Route::get('admin/programs', [ProgramController::class, 'adminIndex'])
        ->middleware(['auth:sanctum', 'active', 'role:admin']);

    Route::prefix('auth')->group(function () {
        Route::post('register', [AuthController::class, 'register']);
        Route::post('login', [AuthController::class, 'login']);
        Route::post('logout', [AuthController::class, 'logout'])->middleware(['auth:sanctum']);
        Route::post('forgot-password', [AuthController::class, 'forgot'])->middleware('throttle:recovery');
        Route::post('reset-password', [AuthController::class, 'reset'])->middleware('throttle:recovery');
    });

    Route::middleware(['auth:sanctum', 'active'])->group(function () {
        Route::get('me', [AuthController::class, 'me']);
        Route::patch('me', [AuthController::class, 'update']);
        Route::get('auth/me', [AuthController::class, 'me']);
        Route::patch('auth/me', [AuthController::class, 'update']);
    });
});
