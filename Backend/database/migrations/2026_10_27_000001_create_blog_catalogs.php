<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // PostgreSQL migration transaction also rolls back catalog creation if legacy names collide.
    public $withinTransaction = true;

    public function up(): void
    {
        foreach (['blog_categories', 'blog_contributors'] as $table) {
            Schema::create($table, function (Blueprint $table) {
                $table->id();
                $table->string('name')->unique();
                $table->boolean('active')->default(true);
                $table->timestamps();
            });
            DB::statement("CREATE UNIQUE INDEX {$table}_normalized_name_unique ON {$table} (lower(trim(name)))");
            DB::statement("ALTER TABLE {$table} ADD CHECK (length(trim(name)) > 0)");
        }

        foreach ([
            'category' => ['blog_categories', ['Tips Belajar', 'Grammar / Bunpou', 'Listening / Choukai', 'JLPT']],
            'author' => ['blog_contributors', ['Hiru Academy']],
        ] as $column => [$table, $defaults]) {
            // Keep exact legacy strings: case/space collisions must stop migration, never silently rewrite attribution.
            $names = array_unique([...$defaults, ...DB::table('blog_articles')->distinct()->pluck($column)->all()]);
            foreach ($names as $name) {
                DB::table($table)->insert(['name' => $name, 'active' => true, 'created_at' => now(), 'updated_at' => now()]);
            }

            // Find single-column legacy checks by catalog metadata, not generated constraint names.
            $checks = DB::select(<<<'SQL'
                SELECT c.conname, pg_get_expr(c.conbin, c.conrelid) AS expression
                FROM pg_constraint c
                JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attname = ?
                WHERE c.conrelid = 'blog_articles'::regclass AND c.contype = 'c'
                    AND c.conkey = ARRAY[a.attnum]::smallint[]
                SQL, [$column]);
            foreach ($checks as $check) {
                $expression = $check->expression;
                $legacy = $column === 'author'
                    ? str_contains($expression, 'Hiru Academy') && str_contains($expression, '=')
                    : str_contains($expression, 'Tips Belajar') && str_contains($expression, 'Grammar / Bunpou')
                        && str_contains($expression, 'Listening / Choukai') && str_contains($expression, 'JLPT');
                if ($legacy) {
                    $constraint = str_replace('"', '""', $check->conname);
                    DB::statement('ALTER TABLE blog_articles DROP CONSTRAINT "'.$constraint.'"');
                }
            }
            Schema::table('blog_articles', function (Blueprint $blueprint) use ($column, $table) {
                $blueprint->foreign($column)->references('name')->on($table)->cascadeOnUpdate()->restrictOnDelete();
            });
        }
    }

    public function down(): void
    {
        throw new RuntimeException('Blog catalogs are forward-only: rollback blocked before changes to preserve catalog data, attribution, and dynamic article values.');
    }
};
