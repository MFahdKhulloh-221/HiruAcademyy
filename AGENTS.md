# Repository instructions

## Current state

- Active project stack: `Frontend/` (Next.js App Router, React 19, TypeScript, Tailwind CSS), `Backend/` (Laravel 12, Sanctum, PostgreSQL, S3-compatible storage), active APIs, database migrations, PHPUnit unit/feature tests, and Playwright E2E suites.
- Existing codebase manifests, configs, migrations, and test files are the operational authority. Blueprints in `Docs/ai/` serve as background architecture references.

## Requirement authority

- Hierarchy for product decisions: latest client revision, Figma Pages 08–11, `Docs/ai/01-PRD-HIRU-ACADEMY.md`, `Docs/ai/02-UI-UX-DESIGN-BRIEF.md`, relevant security/testing docs, reference visuals.
- For small revisions, inspect only the affected implementation and related contracts. Consult PRD/Figma/large specs only when product requirements are ambiguous, unresolved, or explicitly requested.
- Use Graphify in a targeted manner only when inter-module dependencies are unclear; do not audit the entire repository.
- Security controls override prototype behavior while preserving UX with minimal visual change.
- Tokens from `Docs/RefrensiHTML/DESIGN.md`: app canvas `#F9F9FF`, `#FFF7EF` marketing only, CTA `#F48220` with `#5A2A00` or `#954900` with white. Reference HTML files are implementation/interaction references only.
- Never guess unresolved business rules: prices, promo values, catalog details, progress weights, assessment timers/scores, upload limits, or admin permissions.

## Architecture and product constraints

- Keep frontend mock data behind replaceable API boundaries; never scatter inline mock objects across UI components.
- Laravel owns authorization, validation, entitlements, scores, timers, attempts, invoice activation, and resource ownership. Client-side hidden/disabled state is not security.
- Browser must not access PostgreSQL directly or receive DB/storage secrets. `NEXT_PUBLIC_*` values are public.
- Single student UI family for Free, LMS, and LMS + Sensei; handle tier differences via entitlement states rather than separate dashboards.
- Single configurable assessment engine for Checkpoint, Try Out, and Mini Checkpoint; keep Placement separate where rules diverge.
- Assessment submission and invoice verification must be idempotent. WhatsApp clicks never activate membership.
- Mini Checkpoint: LMS + Sensei only, levels N5–N2, hierarchy `level -> sesi -> part`, timed, passes when `score >= passing_score`.
- No Sensei portal/login unless explicitly added by client specification. Public CMS serves published content only; sanitize rich content.

## UI and testing traps

- Target WCAG 2.2 AA: semantic controls, keyboard operation, visible focus, 44x44 mobile targets, `<ruby><rt>` furigana, reduced-motion fallback.
- Preserve Flashcard `rotateY` flip and 600 ms feel; reduced motion may remove/shorten transition but must preserve state reveal.
- Breakpoints: mobile `<640px`, tablet `640–1023px`, desktop `>=1024px`, wide `>=1280px`.
- E2E defaults: locale `id-ID`, timezone `Asia/Jakarta`; store/compare absolute timestamps and format only for display.
- Playwright locators: role, label, placeholder, stable visible text, then test ID. Avoid arbitrary timeouts; await UI/network state.
- Keep auth states, traces, screenshots, test results, secrets, and database dumps out of Git. Never target production data.
- Race tests are mandatory when modifying assessment concurrency or persistence logic (stale autosave, double submit, collision between manual/auto submit, timer refresh, answer-key secrecy). Race tests are NOT required for routine text or UI changes.
- Run focused validations matching changed files (targeted lint, typecheck, or specific test). Do not execute full E2E suites without explicit technical necessity.

## Git and safety

- Commit format: `<type>(<scope>): <description>` (lowercase imperative subject, no trailing period).
- Keep each commit focused on one logical domain/purpose.
- NEVER commit, push, reset, deploy, or touch production environments without explicit user instructions.

## Agent execution workflow

- Prioritize one functional outcome per task, resolve root causes, and apply the smallest coherent change that completely solves the issue.
- Work on only one explicitly requested batch at a time. Do not implement adjacent features or silently continue into subsequent batches.
- Before editing, inspect relevant code and contracts. Do not read heavy PRD/Figma docs for small changes unless requirements are unclear.
- Reuse existing components and patterns before introducing new ones.
- Do not automatically create extra QA documentation, large test fixtures, or lengthy reports.
- Report changed files, focused validation results, remaining OPEN items, and proposed commit message. Do not commit.
