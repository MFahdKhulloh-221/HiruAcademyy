<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class StudentChapterResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $data = $this->resource->only(['id', 'chapter_number', 'title', 'description', 'sort_order']);
        $data['access'] = $this->resource->getAttribute('access');
        if (! $this->resource->relationLoaded('videoLessons')) {
            return $data;
        }
        foreach ([
            'video_lessons' => ['videoLessons', ['id', 'title', 'video_url', 'description', 'sort_order']],
            'modules' => ['modules', ['id', 'title', 'module_type', 'file_url', 'description', 'sort_order']],
            'flashcards' => ['flashcards', ['id', 'japanese', 'reading', 'meaning', 'example', 'sort_order']],
            'audio_questions' => ['audioQuestions', ['id', 'title', 'question', 'audio_url', 'options', 'sort_order']],
        ] as $key => [$relation, $fields]) {
            $data[$key] = $this->resource->$relation->map(fn ($item) => $item->only($fields))->all();
        }
        $data['reading_passages'] = $this->resource->readingPassages->map(function ($passage) {
            return $passage->only(['id', 'title', 'body', 'sort_order']) + [
                'questions' => $passage->questions->map(fn ($question) => $question->only(['id', 'question', 'options', 'sort_order']))->all(),
            ];
        })->all();
        $data['mini_checkpoint'] = ['exists' => (bool) $this->resource->mini_checkpoint_exists];

        return $data;
    }
}
