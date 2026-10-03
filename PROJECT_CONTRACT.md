# HiruAcademy Project Contract

Locked reference for future backend/frontend micro-phases. Change only with explicit client instruction; unresolved decisions stay OPEN.

## Current Safe Checkpoints
- 8d57f6d Student/Public frontend final
- 6fa1151 Admin frontend final
- 5740a80 security cleanup
- 1f97675 Laravel/PostgreSQL/Auth foundation
- 4586fe2 frontend real auth integration

## Core Stack
- Frontend: current approved Next.js frontend
- Backend: Laravel 12
- Database: PostgreSQL
- Auth: Laravel Sanctum stateful cookie/session
- Local frontend: http://localhost:3000
- Local backend: http://localhost:8000

## Product Authority
- Approved frontend is the presentation/product contract.
- Backend adapts to frontend, not the reverse.
- Backend primarily changes persistence, source of data, security, authorization, and business logic.
- Do not redesign approved Student/Public/Admin UI during API work.

## Roles
Only `admin` and `student`. Free / LMS / Sensei are NOT roles.

## Plans
- Free
- Belajar Mandiri / LMS
- Kelas bersama Sensei

## Programs
- DASAR
- JLPT N5
- JLPT N4
- JLPT N3
- JLPT N2
- JLPT N1
- SSW Pengolahan Makanan
- Interview

## Access Rules
Paid JLPT access is cumulative downward:
- N5 -> DASAR + N5
- N4 -> DASAR + N5 + N4
- N3 -> DASAR + N5 + N4 + N3
- N2 -> DASAR + N5 + N4 + N3 + N2
- N1 -> DASAR + N5 + N4 + N3 + N2 + N1

Higher unowned JLPT levels: Chapter 1 preview.
Free: Chapter 1 preview for DASAR and N5-N1.
SSW: standalone. Interview: standalone.

## Sensei Replay
Sensei replay is cumulative downward: N3 -> N5 + N4 + N3; likewise for other levels.
Do not store per-level replay booleans.

## Activity Structure
- DASAR: Video, Modul, Flashcard, Checkpoint
- JLPT: Video, Modul, Flashcard, Audio, Reading, Checkpoint
- SSW: Video, Modul, Flashcard, Checkpoint
- Interview: Video + Modul only

## Mini Checkpoint
Unlock requires effective chapter access + required activities completed.
Free Chapter 1 can unlock its Mini after prerequisites. Membership itself is not the Mini gate.

## Try Out
Fixed sessions:
1. Kosakata & Kanji
2. Tata Bahasa
3. Reading / Dokkai
4. Audio / Choukai

- sectionPassingScore = 19
- Attempts unlimited
- Best Score = highest completed score
- totalPassingScore per level = OPEN
- No official JLPT scaled scoring implemented.

## Commercial Rules
- Mandiri default commercial duration: 6 months
- Sensei: 1 month
- Promo overlays base price. Do not mutate base price.
- N1 price/sellability remains OPEN.

## Invoice
Manual flow: Draft -> Menunggu Pembayaran -> Sudah Bayar -> Diverifikasi -> Aktif.
No payment gateway. Invoice activation creates source access exactly once.

## Content Ownership
Static frontend-owned; do not move to generic CMS:
- approved Landing copy
- section headings/copy
- CTA wording
- navbar/footer wording
- layout/presentation

Admin-editable domains include:
- pricing/promo
- showcase media
- sensei
- testimonials
- blog
- placement
- learning content
- assessments
- schedule/replay
- certificate template
- notifications
- users/access
- invoices
- affiliate/commission

## Question Model
Current multiple-choice questions use A/B/C/D options. Prefer JSONB options in backend.
Student API must not expose correct answers/explanations before authorized submission/review.

## Assessment History
Use immutable attempt snapshots initially.
Do not introduce formal content version UI/tables unless later needed.

## Library
No dedicated Library CMS/table initially.
Prefer projection over canonical published learning resources.

## Security
- Never commit .env
- Never commit SQLite
- PostgreSQL is canonical
- Never print secrets
- No JWT
- No auth token in localStorage/sessionStorage
- Never weaken CSRF/CORS just to pass tests

## Development Rules
- One micro-phase at a time
- Inspect only files relevant to the micro-phase
- No repository-wide re-audit unless explicitly requested
- No unrelated cleanup
- Run focused tests
- Compact report
- No commit unless explicitly instructed
- No push unless explicitly instructed
- Manual QA before locking user-visible integration

## Current Auth Status
Real backend auth is complete:
- register
- login email/WhatsApp
- /api/me
- logout
- password recovery
- admin/student guards
- real browser cookie session verified

Membership/entitlement is NOT yet real backend authority.

## Known OPEN Decisions
- N1 price/sellability
- Try Out totalPassingScore by JLPT level
- automatic furigana mechanism
- production media/storage provider
- renewal overlap/stacking
- live meeting release window
- promo overlap/rounding
- certificate issuance rules
- analytics integration
- production WhatsApp configuration
