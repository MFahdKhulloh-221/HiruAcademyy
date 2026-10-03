<?php

use App\Http\Controllers\AccessGrantController;
use App\Http\Controllers\AdminLearningController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\EffectiveAccessController;
use App\Http\Controllers\InvoiceController;
use App\Http\Controllers\ProgramController;
use App\Http\Controllers\ProgramOfferController;
use App\Http\Controllers\PromotionController;
use App\Http\Controllers\StudentLearningController;
use App\Services\LearningContentService;
use Illuminate\Support\Facades\Route;

Route::prefix('api')->middleware('throttle:identity')->group(function () {
    Route::middleware(['auth:sanctum', 'active', 'role:admin'])->prefix('admin')->group(function () {
        foreach (array_keys(LearningContentService::RESOURCES) as $resource) {
            Route::get($resource, [AdminLearningController::class, 'index'])->defaults('resource', $resource);
            Route::post($resource, [AdminLearningController::class, 'store'])->defaults('resource', $resource);
            Route::get("$resource/{content}", [AdminLearningController::class, 'show'])->whereNumber('content')->defaults('resource', $resource);
            Route::patch("$resource/{content}", [AdminLearningController::class, 'update'])->whereNumber('content')->defaults('resource', $resource);
            Route::delete("$resource/{content}", [AdminLearningController::class, 'destroy'])->whereNumber('content')->defaults('resource', $resource);
        }
        Route::get('invoices', [InvoiceController::class, 'index']);
        Route::get('invoices/{invoice}', [InvoiceController::class, 'show']);
        Route::post('invoices/{invoice}/transition', [InvoiceController::class, 'transition']);
        Route::get('users/{user}/effective-access', [EffectiveAccessController::class, 'admin']);
        Route::get('users/{user}/access', [AccessGrantController::class, 'index']);
        Route::post('users/{user}/access', [AccessGrantController::class, 'store']);
        Route::patch('access/{grant}', [AccessGrantController::class, 'update']);
        Route::delete('access/{grant}', [AccessGrantController::class, 'destroy']);
        Route::get('promotions', [PromotionController::class, 'index']);
        Route::post('promotions', [PromotionController::class, 'store']);
        Route::patch('promotions/{promotion}', [PromotionController::class, 'update']);
        Route::delete('promotions/{promotion}', [PromotionController::class, 'destroy']);
    });
    Route::middleware(['auth:sanctum', 'active', 'role:student'])->prefix('student')->group(function () {
        Route::get('programs/{program}/chapters', [StudentLearningController::class, 'index']);
        Route::get('programs/{program}/chapters/{chapter}', [StudentLearningController::class, 'show']);
        Route::get('invoices', [InvoiceController::class, 'index']);
        Route::post('invoices', [InvoiceController::class, 'store']);
        Route::get('invoices/{invoice}', [InvoiceController::class, 'show']);
        Route::post('invoices/{invoice}/submit', [InvoiceController::class, 'submit']);
        Route::post('invoices/{invoice}/mark-paid', [InvoiceController::class, 'markPaid']);
    });
    Route::get('student/access', [EffectiveAccessController::class, 'student'])
        ->middleware(['auth:sanctum', 'active', 'role:student']);
    Route::get('public/offers', [ProgramOfferController::class, 'publicIndex']);
    Route::get('admin/offers', [ProgramOfferController::class, 'adminIndex'])
        ->middleware(['auth:sanctum', 'active', 'role:admin']);
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
