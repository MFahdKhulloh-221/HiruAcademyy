# Placement rebuild file list

## Backend

- `Backend/app/Services/PlacementService.php`: adaptive selection, coverage, revision, scoring, preview and active JLPT program resolution.
- `Backend/app/Models/PlacementAttempt.php`: adaptive state cast/serialization protection.
- `Backend/app/Models/PlacementConfig.php`: question count cast.
- `Backend/app/Http/Controllers/PublicPlacementController.php`: preview and canonical expiry refresh.
- `Backend/app/Http/Controllers/AdminPlacementLeadController.php`: preview exclusion.
- `Backend/routes/web.php`: authorized preview routes.
- `Backend/database/migrations/2026_10_25_000002_add_adaptive_placement_state.php`: additive fields and constraints.
- `Backend/tests/Feature/AdaptivePlacementTest.php`: adaptive, coverage, program and entitlement checks.
- `Backend/tests/Feature/PlacementTest.php`: updated API fixtures and explicit legacy snapshots.
- `Backend/tests/Feature/PlacementRaceTest.php`: real concurrent adaptive workers.
- `Backend/PLACEMENT-ADAPTIVE.md`: deterministic algorithm and API contract.

## Frontend

- `Frontend/src/components/admin-placement-prototype.tsx`: existing builder, counts, levels, passages, bank availability and backend preview.
- `Frontend/src/components/admin-placement-preview.tsx`: non-scored individual-question inspection.
- `Frontend/src/components/placement-runner.tsx`: backend-issued questions, shared admin preview, persisted result and program links.
- `Frontend/src/lib/admin-placement-api.ts`: builder/preview API mapping.
- `Frontend/src/lib/admin-placement-store.ts`: existing store contract alignment.
- `Frontend/src/lib/placement-store.ts`: configured count without exposing bank.
- `Frontend/src/lib/assessment-attempt.ts`: adaptive revision persistence and lost-response reconciliation without replay; legacy contract retained.
- `Frontend/src/lib/api.ts`: relevant Placement validation/conflict errors.
- `Frontend/src/app/placement/page.tsx`: configured question count.
- `Frontend/src/app/program/page.tsx`: recommended level preselection and database-backed availability, including N1.
- `Frontend/playwright.placement.config.ts`: isolated real QA config.
- `Frontend/tests/placement-adaptive-real.spec.ts`: real Admin/API/guest browser journey.
- `Frontend/tests/placement-adaptive-persistence.spec.ts`: revision queue, duplicate submit and canonical expiry checks.
- `Frontend/tests/support/placement-qa-server.mjs`: guarded dedicated local QA process.
- `Frontend/tests/support/placement-qa-fixture.php`: isolated QA admin, no product question seeding.
- `Frontend/tests/support/placement-qa-router.php`: QA-only playable audio fixture.
- `Frontend/tests/PLACEMENT-QA.md`: commands and manual checks.
- `Frontend/tsconfig.json`: Next.js-generated type includes for dedicated QA port 3026.

Pre-existing unrelated working-tree edits and `2026_10_25_000001_add_n1_recommendation_rule.php` are not part of this rebuild. No commit, push, merge or deployment performed.
