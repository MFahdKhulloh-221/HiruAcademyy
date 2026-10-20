# Admin testimonial layout and active local demo QA

## Scope

Batch fixes testimonial table only and publishes two clearly labelled admin demos through existing authorized Admin forms/media endpoints. No production access, commits, pushes, deployment, credential changes or student-content edits.

## Table fix

Previous 14 columns squeezed long names, quote and actions. Current table has 9 core columns: preview, name/title, type, source, review, publication, landing, testimonial channel, actions. Context, full quote, date, video URL and order remain in Detail/Edit.

CSS is scoped to `.admin-testimonial-prototype`; table has fixed column widths and 1360px minimum, wrapper owns horizontal overflow and is keyboard-focusable with visible focus. Buttons do not wrap; names/titles use ellipsis instead of breaking characters. Shared admin table behavior remains unchanged.

Files: `Frontend/src/components/admin-testimonial-prototype.tsx`, `Frontend/src/app/admin/admin.css`, `Frontend/tests/admin-testimonial-table.test.mjs`.

## Demo assets

Existing videos verified with ffprobe: H.264 MP4 / VP9 WebM, 960×540, 5 seconds, no audio. New thumbnails extracted at 1 second and visibly labelled `DEMO — PREVIEW CLIENT`; video frame retains explicit non-student label.

Assets:
- `assets/demo-testimonials/hiru-demo-01.mp4`
- `assets/demo-testimonials/hiru-demo-02.webm`
- `assets/demo-testimonials/hiru-demo-01-thumbnail.png`
- `assets/demo-testimonials/hiru-demo-02-thumbnail.png`
- `assets/demo-testimonials/generate-thumbnails.ps1` (refuses overwrite)
- `assets/demo-testimonials/thumbnail-label.txt`

Database stores managed media paths, not hardcoded localhost URLs. Local resolved media URLs are expected in local browser playback.

## Active environment prerequisite

Read-only audit verified configured and actual PostgreSQL `127.0.0.1:5432`, database `hiru_academy`, schema `public`, Laravel APP_ENV local, public media disk. Existing backend 8000 / frontend 3000 kept running. Migration `2026_10_13_000001_add_testimonial_types_and_channels` initially pending. User explicitly approved local backup, isolated restore rehearsal and only this forward migration. No destructive reset or automatic rollback permitted.

Admin authentication uses user-performed login in separate QA browser; session state remains in private temporary directory outside Git. Do not print or commit session credentials, backup contents, screenshots containing private student data or DB dumps.

## Validation so far

- 14 native checks pass (table, provider, UI/API contracts, counter, blog).
- 11 Playwright public regression/provider checks pass; mock provider tests do not prove persistent active demo publication.
- `npm run lint`, `npm run typecheck` pass.
- `npm run build` passes using existing distDir configuration with session-scoped HIRU_PLAYWRIGHT_PORT=3099 to avoid touching active dev output. Generated tsconfig include entries for that temporary build were removed; no permanent configuration change.

## Migration rehearsal incident — recovered

First rehearsal orchestration misrouted schema DDL to active development database while logging migration in restored rehearsal database. Initial claim that active DB remained unchanged was incorrect and explicitly corrected. Read-only comparison confirmed original field values retained, backfill mismatches 0, and redesign columns/constraints present in active DB, but its migration ledger lacked the entry. Do not rerun pending migration on active DB.

User explicitly approved fresh-process backup rehearsal and schema/data equivalence checks, followed only upon exact verification by reconciliation of one missing active migration ledger entry. No demo writes permitted before recovery verification. Full private backup and media copy retained. No production access.

Recovery completed: fresh-process restored rehearsal verified both DB and Schema targets before DDL. Columns/indexes/constraints equivalent to active schema; original content retained. A locked reconciliation added exactly one migration ledger entry, batch 16, without active DDL or changes to non-ledger tables. Active DB now has 33 applied migrations, none pending. Proven cause: copied connection config retained internal name=pgsql; Laravel Migrator switched default connection by that name. Cached Schema builder was not the cause. Unsafe orchestration disabled.

Private backup/evidence: `C:\Users\Tulo\AppData\Local\Temp\opencode\hiru-backup-20261013_080842_9b4c7879\`; includes `recovery-verification.json`. Backups and restored rehearsal databases contain private data; do not expose, commit, or use for browser fixtures. Retained for user review, not deleted automatically.

Relevant Laravel tests on isolated guarded target: 47 pass, 1154 assertions. User manual Admin login completed. Initial Chromium launch stalled; explicit channel/launch arguments resolved it. Final authorized UI run passed against actual frontend 3000/backend 8000.

## Active persistent publication — passed

Database `hiru_academy.public`, demo IDs 4 and 5. Both source admin, type video, approved, consent true, published true, show_on_testimonials true, landing false. Exact requested names, titles, context and descriptions saved. Created Draft first through Admin form with image/video uploads via existing media endpoint, then edited Published; refresh confirmed persistence. No SQL inserts, student edits, duplicate records or deletion.

| Demo | Video managed path | Thumbnail managed path |
|---|---|---|
| 01 / ID 4 | `media/video/c8d8ce6e-9e05-417a-bddf-cbd94bb72f36.mp4` | `media/image/d616a709-b8bc-4414-ac91-2024834e4ef6.png` |
| 02 / ID 5 | `media/video/ac64301c-f661-4e88-b367-98b10b0d65d8.webm` | `media/image/f4f7c595-367c-4ba4-ad98-335042403686.png` |

Anonymous `/testimoni`: both thumbnail hashes match assets, MP4 and VP9 WebM play/pause and replay after fresh load with currentTime > 0. No unexpected console errors or media/image 404. Anonymous auth probe 401 expected. Demo01 show_on_testimonials disabled: disappeared; re-enabled: returned; final restoration verified both published/visible. Original three text records unchanged. Active pending count zero; no pending fixtures inserted into active DB, backend isolated tests cover pending privacy and authorization.

Browser assertions cover both tabs at 390/768/1366/1440, nine headers, body no horizontal overflow, contained table, 44px actions, nowrap and keyboard scroll. Add/Edit/detail dialogs captured without extra saves. Proof and screenshots outside Git:
`C:\Users\Tulo\AppData\Local\Temp\opencode\hiru-active-demo-1791880602845\report.json`
Adjacent files: `admin-video-{width}-left.png`, `admin-video-{width}-actions.png`, `admin-text-{width}-left.png`, `admin-add-{width}.png`, `admin-edit-{width}.png`, `admin-modal.png`, `guest-demo-01.png`, `guest-demo-02.png`.

Persistent data/media exist only locally and do not transfer through Git. Do not run demo command on production. Private session state should be removed after QA; no password/token printed.
