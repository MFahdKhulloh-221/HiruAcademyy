# Batch B — TryOut schema proposal

**Scope:** image proposal promoted to official migration `database/migrations/2026_11_05_000001_add_try_out_builder_images.php`, prepared but NOT executed. `try-out-builder-images.php` remains an archived draft outside migration discovery; do not run it separately. Official migration preflights both tables and refuses existing image columns before any DDL. No decimal migration or decimal runtime changes. Batch A scoring/results and Checkpoint tables/classes remain untouched; shared services gate TryOut image behavior explicitly.

## Images — official migration ready, execution pending approval

Both `try_out_questions` and `try_out_passages` gain `image TEXT NULL`, `image_alt TEXT NOT NULL DEFAULT ''`, `image_position VARCHAR(255) NOT NULL DEFAULT 'before'`. PostgreSQL named checks restrict position to `before`/`after`. No existing columns change. Capability-gated runtime code validates existing media references, requires image alt text, and freezes question/group metadata in immutable snapshots. `builder_capabilities.images` remains false unless all three columns exist on both tables; unsupported metadata is rejected. SQLite fixture columns verify code contracts only, not active PostgreSQL schema or constraints.

`up()` is additive. `down()` inspects **both** tables before dropping anything; any non-null image (including empty string), nonempty alt, or nondefault position refuses rollback. PostgreSQL locks both tables through inspection/DDL to prevent concurrent-reference loss. Never delete storage objects, clear references, or force rollback to bypass refusal. Draft syntax validation only: `php -l Backend/database/proposals/try-out-builder-images.php`; no DB connection, migration execution, or environment access.

## Decimal plan — business confirmation required before code

Current authority: `2026_10_04_000007_create_try_out_tables.php`, `2026_10_20_000002_add_try_out_builder_configuration.php`, and `TryOutService` validation. `point_value` is integer 1–180; `max_score` is integer 1–2147483647; nullable `total_passing_score` is 0–`max_score`. Optional session thresholds currently contain all four session keys, integer values 0–2147483647, and must be achievable at publication. Preserve existing ceilings; SQL precision is capacity, not a new business maximum.

| Proposed nullable shadow | SQL type | Compatibility / proposed constraint |
| --- | --- | --- |
| `try_out_questions.point_value_decimal` | `NUMERIC(5,2)` | Existing 1–180 fits exactly; positive quarter steps, at most 180 |
| `try_outs.max_score_decimal` | `NUMERIC(12,2)` | Existing 2147483647 fits exactly; positive, at most existing ceiling |
| `try_outs.total_passing_score_decimal` | `NUMERIC(12,2)` | Null preserved; otherwise 0–shadow max score |
| `try_outs.session_passing_scores_decimal` | nullable `JSONB` | Null preserves legacy fallback; otherwise exact four-key object |

User-requested **step 0.25** means `> 0` implies proposed minimum **0.25**, changing current minimum 1; obtain explicit approval. Confirm whether max/total/session thresholds also require quarter steps rather than merely two-decimal precision. No guessed new range. Proposed session JSON contract: exactly `vocabulary_kanji`, `grammar`, `reading`, `audio`; each value a nonnegative canonical decimal **string**, two fractional digits (e.g. `"19.25"`), no signs/exponents/JSON numbers/null members, no leading zeros except `0.00`. Retain existing threshold ceiling and publication check against achievable session points. Future DB checks and server validation must agree, including JSON shape, scale, ranges, and approved step rules; reject excess scale rather than relying on NUMERIC rounding.

Backfill shadows by exact integer-to-NUMERIC conversion (`n` becomes `n.00`), preserving nulls; convert session integers to exact strings without float casts. Keep legacy columns and reads until approved cutover; never truncate decimal writes into integer columns. Cutover requires explicit writer coordination and reconciliation. Rollback must refuse any fractional scalar/session value or value unrepresentable under legacy constraints; validate every row before conversion. Preserve data for manual review, never round away fractions or silently drop populated shadows.

Future scoring uses raw fixed-point hundredths, parsed from decimal strings without binary floats. Require PHP 64-bit; check bounds before multiplication by 100 and each aggregation addition against `PHP_INT_MAX`, rejecting overflow before arithmetic. Quarter values satisfy hundredths modulo 25 = 0. Final-score half-up rounding remains **pending approval**, not implemented. Snapshot scoring version plus exact points/max/thresholds and rounding contract per new attempt; old/in-progress snapshots retain their original scorer and results, never reinterpret historical Batch A data.

**Tests before activation:** PostgreSQL defaults/checks and reversible empty image DDL; rollback refusal on either table and concurrent writers; exact integer backfill/nulls; quarter/scale/range boundaries; JSON string contract; fractional rollback refusal; PHP64 overflow and aggregation; scoring-version/snapshot compatibility; explicit Checkpoint isolation. Race tests required if future attempt persistence/scoring changes. **OPEN:** decimal minimum/threshold-step and rounding approval, dual-write/cutover policy, image schema review/activation, PostgreSQL constraint and lock validation. PostgreSQL activation tests and decimal tests have not run; no migration executed.
