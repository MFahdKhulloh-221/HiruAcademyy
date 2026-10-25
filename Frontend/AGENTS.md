<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# HIRU Academy frontend rules

Before any implementation work in this Frontend project:

1. Read `../AGENTS.md` and treat it as the project-level authority.
2. Active stack: Next.js App Router (React 19, TypeScript, Tailwind CSS) connected to Laravel backend and PostgreSQL.
3. For small revisions, inspect only affected components and API contracts. Consult large docs (PRD/Figma) only if requirements are unclear or explicitly requested.
4. Run focused validation (typecheck, lint, or targeted test) matching the change; do not run full Playwright E2E suites without explicit technical need.
5. Race tests are required only when changing assessment concurrency/persistence, not for routine UI/text edits.
6. Target one functional outcome per task, smallest coherent diff, and solve root causes.
7. Do not auto-generate extra QA documents, large fixtures, or lengthy reports.
8. Never commit, push, reset, deploy, or touch production without explicit instruction.
