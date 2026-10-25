# Focused Placement QA

## Real browser + Laravel + PostgreSQL

Run from `Frontend/` after confirming local PostgreSQL test access and reviewing additive Placement migrations:

```powershell
$env:HIRU_PLACEMENT_SCHEMA_READY = "1"
$env:HIRU_PLACEMENT_REAL_QA = "1"
npx playwright test --config=playwright.placement.config.ts
```

The harness verifies testing environment, loopback PostgreSQL server, database `hiru_academy_test`, and a uniquely named `hiru_browser_test_placement_*` schema before writes. It runs migrations only in that new schema. No database reset, no production target. Dedicated ports: frontend 3026, backend 8026. Identity metadata stays in temporary storage; artifacts stay under ignored `test-results/`.

Questions are deliberately labeled QA fixtures, created through authenticated Admin APIs in the isolated schema. They test software behavior, not educational calibration. No product bank is seeded.

Persistence-only check (no server/database; revision queue, duplicate submit, canonical expiry, lost-response recovery and conflicting-answer protection):

```powershell
npx playwright test --config=playwright.placement.config.ts placement-adaptive-persistence.spec.ts
```

## Backend-only checks

```powershell
# From Backend/
$env:DB_HOST = "127.0.0.1"
php artisan test --filter="AdaptivePlacementTest|PlacementRaceTest|Tests.Feature.PlacementTest"
```

All three classes reject non-testing/non-loopback/non-QA database targets. Race tests use dedicated temporary tables and PostgreSQL worker processes.

## Verified backend scenarios

Focused backend checks cover all-wrong/empty N5, easy-only not N1, demonstrated N1, N4/N3/N2 evidence, all three lengths, committed answers, unknown/unissued IDs, stale revision, snapshot immutability, expiry, old attempts, preview ownership, incomplete bank/media, active/inactive/custom program lookup and no paid grants/invoices. PostgreSQL race checks use separate worker connections, not mocked timing.

## Manual product check

1. Use a local QA backend with additive migration `2026_10_25_000002_add_adaptive_placement_state.php` applied. Do not run migrations against unverified default/production targets.
2. Open `/admin/placement-hasil`; save a draft. Default 12 questions, 7-minute timer; choose 12/20/25 without code changes.
3. Fill the real bank: each N5–N1/category pair requires 3/5/7 valid published questions for 12/20/25 mode. Choukai needs audio; Dokkai needs passage. Missing-level legacy questions do not count. Insufficient bank blocks publication and preview.
4. Use **Pratinjau Tes** to run the same backend adaptive engine as participants. Draft changes must be saved first. Preview results do not become leads.
5. Publish, then open `/placement` in a separate guest browser context. Answering commits each answer and obtains the next server-selected question. Refresh preserves attempt, answers and deadline.
6. Complete and inspect score, initial estimate, category results and program link. All-correct runs must include successful N1 questions before N1 recommendation; all-wrong runs recommend N5.
7. Program link opens `/program?level=Nx`, with the database-backed active program selected. No paid access is granted. An unavailable program has an explicit notice.

This is a short lead-generation estimate, not a JLPT certificate or a psychometrically validated exam. Content quality and level calibration require review by Japanese-language educators. The deterministic software rule (two correct answers across two categories with accuracy at least 2/3 at that level) is an explicit initial-estimate heuristic, not independently calibrated placement accuracy.
