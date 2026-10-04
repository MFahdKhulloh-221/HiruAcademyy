<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('showcase_items', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->string('label');
            $table->text('image_src');
            $table->text('alt');
            $table->integer('sort_order')->default(1);
            $table->boolean('visible')->default(false);
            $table->timestamps();
            $table->index(['visible', 'sort_order', 'id']);
        });
        Schema::create('sensei_profiles', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('role');
            $table->text('bio');
            $table->text('photo');
            $table->jsonb('expertise');
            $table->boolean('active')->default(false);
            $table->integer('sort_order')->default(1);
            $table->string('level')->nullable();
            $table->timestamps();
            $table->index(['active', 'sort_order', 'id']);
        });
        Schema::create('testimonials', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->text('context');
            $table->text('quote');
            $table->text('image')->nullable();
            $table->text('video_url')->nullable();
            $table->text('video_title')->nullable();
            $table->boolean('published')->default(false);
            $table->boolean('landing')->default(false);
            $table->integer('sort_order')->default(1);
            $table->timestamps();
            $table->index(['published', 'landing', 'sort_order', 'id']);
        });
        Schema::create('blog_articles', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->string('slug')->unique();
            $table->text('excerpt')->nullable();
            $table->text('body');
            $table->text('thumbnail')->nullable();
            $table->string('category');
            $table->string('seo_title')->nullable();
            $table->text('meta_description')->nullable();
            $table->boolean('featured')->default(false);
            $table->boolean('published')->default(false);
            $table->timestampTz('published_at', 6)->nullable();
            $table->string('author')->default('Hiru Academy');
            $table->timestamps();
            $table->index(['published', 'published_at', 'id']);
        });
        Schema::create('certificate_templates', function (Blueprint $table) {
            $table->id();
            $table->string('program');
            $table->string('title');
            $table->text('description');
            $table->text('image')->nullable();
            $table->integer('sort_order')->default(1);
            $table->string('status')->default('draft');
            $table->timestamps();
        });
        if (DB::getDriverName() === 'pgsql') {
            foreach (['showcase_items', 'sensei_profiles', 'testimonials', 'certificate_templates'] as $table) {
                DB::statement("ALTER TABLE {$table} ADD CHECK (sort_order > 0)");
            }
            DB::statement("ALTER TABLE showcase_items ADD CHECK ((key = 'dashboard' AND label = 'Dashboard') OR (key = 'journey' AND label = 'Pembelajaran') OR (key = 'lesson' AND label = 'Materi / Video Lesson') OR (key = 'flashcard' AND label = 'Flashcard') OR (key = 'evaluation' AND label = 'Try Out / Evaluasi'))");
            DB::statement("ALTER TABLE sensei_profiles ADD CHECK (level IS NULL OR level IN ('n5', 'n4', 'n3', 'n2', 'n1')), ADD CHECK (jsonb_typeof(expertise) = 'array' AND jsonb_array_length(expertise) > 0)");
            DB::statement('ALTER TABLE testimonials ADD CHECK ((video_url IS NULL AND video_title IS NULL) OR (length(btrim(video_url)) > 0 AND length(btrim(video_title)) > 0 AND video_url IS NOT NULL AND video_title IS NOT NULL))');
            DB::statement("ALTER TABLE blog_articles ADD CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'), ADD CHECK (author = 'Hiru Academy'), ADD CHECK (category IN ('Tips Belajar', 'Grammar / Bunpou', 'Listening / Choukai', 'JLPT'))");
            DB::statement("ALTER TABLE certificate_templates ADD CHECK (status IN ('draft', 'published'))");
            foreach ([
                'showcase_items' => ['image_src', 'alt'],
                'sensei_profiles' => ['name', 'role', 'bio', 'photo'],
                'testimonials' => ['name', 'context', 'quote'],
                'blog_articles' => ['title', 'body'],
                'certificate_templates' => ['program', 'title', 'description'],
            ] as $table => $fields) {
                foreach ($fields as $field) {
                    DB::statement("ALTER TABLE {$table} ADD CHECK (length(btrim({$field})) > 0)");
                }
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('certificate_templates');
        Schema::dropIfExists('blog_articles');
        Schema::dropIfExists('testimonials');
        Schema::dropIfExists('sensei_profiles');
        Schema::dropIfExists('showcase_items');
    }
};
