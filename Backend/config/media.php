<?php

return [
    'disk' => env('MEDIA_DISK', 'public'),
    'max_kb' => [
        'image' => (int) env('MEDIA_IMAGE_MAX_KB', 10240),
        'audio' => (int) env('MEDIA_AUDIO_MAX_KB', 51200),
        'video' => (int) env('MEDIA_VIDEO_MAX_KB', 102400),
    ],
    'url_lifetime_minutes' => (int) env('MEDIA_URL_LIFETIME_MINUTES', 5),
];
