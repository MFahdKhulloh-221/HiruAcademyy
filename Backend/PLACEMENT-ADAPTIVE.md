# Placement adaptive-v1

Existing PlacementService and placement_attempts remain authoritative. No entitlement changes.

## Persistence and compatibility

Additive migration `2026_10_25_000002_add_adaptive_placement_state.php` adds config `question_count` (12 default; allowed 12/20/25), nullable question `level`/`passage`, nullable attempt `adaptive_state`. Existing database trigger and model snapshot protections remain unchanged. Full valid published bank and answer key are immutable attempt snapshots. Mutable state contains `issued_ids` and `revision`; completed attempts remain immutable, including adaptive state.

Attempts with null adaptive_state retain legacy answer editing, threshold scoring, and deadline behavior. New attempts always snapshot scoring_version `adaptive-v1`; old published configs with insufficient coverage fail start with 422. Legacy recommendation_rules remain preserved and supported by backend validation, but admin UI treats them as read-only; they do not affect adaptive scoring.

## Bank and deterministic selection

Every level N5–N1/category pair requires at least ceil(question_count/4) valid published questions. Valid means supported level/category/key, nonblank prompt/four options, nonblank Choukai audio_url, nonblank Dokkai passage and safe media references. Level-null legacy questions do not count. Drafts may remain incomplete. Publishing and edits/deletes under published configs enforce coverage transactionally under config lock.

Admin config `availability` shape: `{N5:{Bunpou:{valid:3,required:3},"Moji・Goi":{valid:3,required:3},Dokkai:{valid:3,required:3},Choukai:{valid:3,required:3}},...N1}`.

Start N3/Bunpou. Rotate Bunpou, Moji・Goi, Dokkai, Choukai by issue index. Correct answer moves one level harder; incorrect moves one easier; clamp N5/N1. Choose first unissued question at requested level/category ordered sort_order then id. Coverage guarantees any path up to planned question count without fallback or repetition.

Only issued questions leave server. Public config has `questions: []`, `adaptive: true`, `question_limit`. Attempt includes `adaptive`, `question_limit`, `revision`, questions in issue order; each question includes level, category, nullable string passage and reading_passage alias. No key, explanation, hidden bank or applicant data exposed.

## Save and submit

PUT answers body `{answers:{questionId:"A"},revision:0}`. Full cumulative or delta answer map accepted. Only issued IDs accepted. Previously saved answers are committed: cannot change, cannot delete by omission. Revision required; stale revision returns 409. After answering current question, issue at most one new question. Each successful PUT increments revision, including no-op saves. GET refreshes canonical state: expired adaptive attempts finalize using saved answers under row lock. Expired PUT also returns canonical completed state; PUT after completion returns completed adaptive payload, preventing stale autosave loops.

POST submit uses same body; requires current revision before deadline. No new question issued on submit. After deadline saved answers alone count. Already-completed submit returns original result without revision check. Unknown IDs still rejected. Row locks serialize save/submit collisions.

Total is planned count, not issued count. Unanswered includes all unissued questions. Areas use issued questions per category. Evidence per level contains correct, answered, distinct correct categories, rounded accuracy and mastered. Mastery requires >=2 correct across >=2 categories and exact accuracy >=2/3. Highest evidenced mastered level wins; otherwise N5. All wrong/empty and easy-only evidence never recommend advanced levels. N1 requires same mastery evidence, never percentage extrapolation.

Result adds `result_title`, `result_description`, `estimation_label`, `evidence`, `recommended_program`, `program_message` (also availability_message alias). Program lookup requires active exact JLPT code (case-insensitive, matching existing lowercase seeded codes) and family `jlpt`. Program result `{code,title:name,path:"/program?level="+code}` targets actual DB-backed program picker, not static mock `/program/[level]`; absent program is null with availability message. No invented catalog or program fallback.

## Admin preview

- POST `/api/admin/placement-configs/{id}/preview`, body `{}`: 201 attempt payload. Draft configs permitted when published bank coverage valid.
- GET `/api/admin/placement-previews/{attempt}`.
- PUT `/api/admin/placement-previews/{attempt}/answers`, body `{answers,revision}`.
- POST `/api/admin/placement-previews/{attempt}/submit`, body `{answers,revision}`.

Preview uses same selector/save/scoring engine, normal persisted attempt with admin user_id and immutable config_snapshot.preview=true. Only active owning admin via admin routes can access preview. Public endpoints reject preview access. Previews excluded from leads and cannot receive lead status changes. No synthetic applicant data.

## Focused validation

`php artisan test --filter='AdaptivePlacementTest|PlacementRaceTest|Tests.Feature.PlacementTest'` runs focused adaptive, legacy-history, Admin/public API and race coverage. AdaptivePlacementTest uses existing DatabaseSafety guard and DatabaseTransactions. PlacementRaceTest uses two actual PHP worker processes, independent PostgreSQL connections, and a parent row-lock barrier verified through pg_stat_activity before release. Its disposable attempt-table fixture carries complete 60-question adaptive bank snapshot and revision state, with original immutability trigger. Races cover double submit, expired manual/automatic submit, stale autosave/manual submit, and late autosave/automatic submit. No default DB writes or schema reset. Requires pgsql, verified loopback host and database hiru_academy_test before test transactions. Covers 12/20/25, full/zero/wrong/easy-only, unissued IDs, stale saves, immutable answers/bank, deadline, refresh, idempotent submit, coverage, preview isolation, exact active program lookup, legacy thresholds.

Never migrate default DB. Verify DatabaseSafety::assertTarget(true) with testing config before running only additive migration using `--env=testing`. No reset/fresh migration.
