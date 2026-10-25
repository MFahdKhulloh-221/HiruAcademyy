# Repository instructions

## Current state

- `Frontend/` and `Backend/` are placeholders; no manifests, lockfiles, runtime versions, CI, or executable test/lint/typecheck commands exist yet.
- Do not turn command examples in `Docs/ai/04-DEBUG-PLAYBOOK.md` or `Docs/ai/05-E2E-PLAYWRIGHT.md` into repository claims. Those documents are blueprints; use scripts/config added to the codebase as authority.
- Planned stack: `Frontend/` = Next.js App Router, React, TypeScript, Tailwind CSS; `Backend/` = Laravel, Sanctum, PostgreSQL, S3-compatible storage; E2E = Playwright.

## Requirement authority

- Resolve product conflicts in this order: latest client revision, Figma Pages 08–11, `Docs/ai/01-PRD-HIRU-ACADEMY.md`, `Docs/ai/02-UI-UX-DESIGN-BRIEF.md`, relevant security/debug/testing document, reference visuals.
- Security controls override prototype behavior while preserving UX with smallest visual change.
- `Docs/RefrensiHTML/DESIGN.md` supplies visual tokens, not product flow. Its prose conflicts with its token block; follow UI brief resolution: app canvas `#F9F9FF`, `#FFF7EF` only for suitable marketing sections, CTA `#F48220` with `#5A2A00` or `#954900` with white.
- The reference HTML has already been extracted into `Docs/RefrensiHTML/`. Inspect the actual files there when visual or interaction reference is needed.
- `Docs/RefrensiHTML/*.html` is an implementation-experience reference only. It may inform layout feel, hover, motion, tactile feedback, Flashcard interaction, and reusable UI patterns, but it must not introduce product behavior that conflicts with the latest client revision, Figma Pages 08–11, PRD, or UI/UX brief.
- `Docs/RefrensiHTML/DESIGN.md` provides supporting visual tokens and implementation notes; where it conflicts with the final UI/UX brief or Figma Pages 08–11, the higher-authority source wins.
- Never guess unresolved prices, promotions, catalog, progress weights, assessment limits/timers/scores, production domains, WhatsApp details, upload limits, storage visibility, or Admin permission granularity.

## Architecture and product constraints

- Keep mock frontend data behind replaceable API boundaries; do not scatter mocks through JSX.
- Laravel owns authorization, validation, entitlements, scores, timers, attempts, invoice activation, and resource ownership. Client-side hidden/disabled UI is not authorization.
- Browser must not access PostgreSQL directly or receive DB/object-storage secrets. `NEXT_PUBLIC_*` values are browser-readable.
- Use one student UI family for Free, LMS, and LMS + Sensei; model differences as entitlement states rather than separate dashboards.
- Use one configurable assessment family for Checkpoint, Try Out, and Mini Checkpoint; keep Placement separate where rules differ. Server-controlled rules must remain configurable, not copied from Figma samples.
- Assessment submission and invoice verification must be idempotent. WhatsApp click never activates membership.
- Mini Checkpoint is LMS + Sensei only, levels N5–N2, structured `level -> sesi -> part`, has a timer, and passes when `score >= passing_score`.
- No Sensei login/portal unless a newer client requirement adds one. Public CMS exposes published content only; sanitize controlled rich content.

## UI and testing traps

- Target WCAG 2.2 AA: semantic controls, keyboard operation, visible focus, 44x44 mobile targets, `<ruby><rt>` furigana, and reduced-motion fallback.
- Preserve Flashcard `rotateY` flip and 600 ms feel; reduced motion may remove/shorten transition but must preserve state reveal.
- Breakpoints: mobile `<640px`, tablet `640–1023px`, desktop `>=1024px`, wide `>=1280px`.
- Planned E2E defaults are locale `id-ID` and timezone `Asia/Jakarta`; store/compare absolute timestamps and format only for display.
- Playwright locators: role, label, placeholder, stable visible text, then test ID. Avoid `waitForTimeout`; await meaningful UI/network state.
- Keep Playwright auth state, traces, screenshots, test results, secrets, dumps, and private keys out of Git. Tests must never target production data.
- Race tests are mandatory for assessment persistence: stale autosave, double submit, manual/automatic submit collision, refresh-safe timer, and answer-key secrecy before review is allowed.

## Git

- Commit format: `<type>(<scope>): <description>` with lowercase English imperative subject and no final period.
- Keep each commit to one logical domain/purpose; commit lockfile with dependency changes and migration with its feature when review stays clear.

## Figma role mapping



## Agent execution workflow

- Work on only one explicitly requested batch at a time.
- Before editing, inspect the relevant existing implementation and source-of-truth documents.
- For a new architecture, shared foundation, assessment system, Admin foundation, or other broad change, produce a concise implementation plan before editing.
- Do not silently continue into the next batch.
- Do not implement adjacent features merely because they appear related.
- Prefer the smallest coherent change that completes the requested batch.
- Reuse existing components before creating new ones.
- Do not duplicate Free, LMS, and Sensei UI when the difference can be represented by configuration or entitlement.
- Do not invent backend/API contracts that are still unresolved.
- Mark unresolved product decisions as `OPEN` rather than guessing.
- After implementation, run only repository-supported validation commands.
- Report changed files, validation results, remaining OPEN items, and the proposed Git commit message.
- Do not create a Git commit unless explicitly asked.

## Document lifecycle

- `Docs/ai/03-SECURITY-AUDIT.md` is currently a pre-implementation security baseline, not a completed codebase security audit. A real audit must be performed again after auth, API, route protection, session handling, forms, uploads, and backend authorization exist.
- `Docs/ai/05-E2E-PLAYWRIGHT.md` is currently an E2E blueprint. Do not implement the entire Playwright suite before the functional frontend MVP and approval of the critical journeys.
- `Docs/ai/04-DEBUG-PLAYBOOK.md` is the debugging SOP and may be used throughout implementation.
- `Docs/ai/07-GIT-COMMIT-PLAN.md` is active from the first implementation commit.

# HIRU Academy project rules

Before any implementation work in this Frontend project:

1. Read `../AGENTS.md` and treat it as the project-level authority.
2. Follow its requirement hierarchy, architecture constraints, agent workflow,
   documentation lifecycle, Git rules, and product constraints.
3. This file adds Next.js version-specific guidance only; it does not override
   HIRU Academy product requirements.
4. For Next.js implementation details, follow the version-matched Next.js
   documentation referenced by the generated rules below.
