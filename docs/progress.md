# Progress Ledger — Documentation Update

**Goal**: Bring `docs/*` and root `README.md` in line with the current codebase (design-system extraction, dependency upgrades, new PRODUCT.md/DESIGN.md) and switch all docs to English.

**Profile**: Standard (triage score 3/10: ~8 files touched, existing doc pattern, code is the authoritative spec, zero production risk, parallelizable). No PRD — thin delta (the code and git history are normative).

**Run counter**: 3

**Acceptance criteria** (no PRD; task-level verifiable outcomes):
- AC-1: All in-scope docs are in English.
- AC-2: Every version, command, env var, and file path stated in docs matches the repo (package.json, scripts, .env.example, actual files).
- AC-3: The design system is documented: `:root` token layer, Tailwind theme mapping, `components/ui` primitives, `cn()`, no-hardcode rule, white-label theming (config / `themeLink`).
- AC-4: No factual drift (vercel.json wording, test counts, route lists).
- AC-5: `docs/RELEASE_PLAN.md` is marked as a historical v0.1.0 record; facts kept as-of-release.

**Actors and use cases**: Skipped: use cases — documentation-only task, single role (maintainer).

**Infrastructure inventory**: `Local stack: N/A — documentation-only task, no code touches runtime dependencies.`

**Task table**:

| Slice/subtask | Agent | Status | Evidence summary | RV-IDs | Attempts |
|---|---|---|---|---|---|
| A: docs/README.md, docs/ARCHITECTURE.md, docs/FRONTEND_AND_UI.md, README.md | implementor | DONE | English rewrite; 18 version strings grep-verified; Cyrillic grep clean; link check zero broken; only 4 in-scope files in diff | — | 1 |
| B: docs/DATABASE.md, docs/SYNC_SYSTEM.md, docs/DEPLOYMENT_AND_CONFIGURATION.md, docs/RELEASE_PLAN.md | implementor | DONE | English rewrite; env sets 21/21 match .env.example; quoted snippets matched to source lines; vercel.json reframed; RELEASE_PLAN banner added | — | 1 |
| Cross-doc consistency review | doc-reviewer | DONE | 10/10 spot-checks match code; 43/43 links resolve; 0 Cyrillic; no must-fix-now; RV-DOCS-001..004 fix-in-slice, RV-DOCS-005..006 backlog | RV-DOCS-001..006 | 1 |
| Fix application (RV-DOCS-001..006) | coordinator | DONE | PRODUCT.md (English docs, 18 tests, sync-scheduler wording), DESIGN.md + design.json (three sanctioned literal spots, palette-role vs --primary note), SYNC_SYSTEM.md counters note, docs/README.md navigator row | all closed | — |

**Decisions log**:
- D1: docs language → English (user, 2026-09-24).
- D2: RELEASE_PLAN.md → historical record; translate, add banner, no modernization (user, 2026-09-24).
- D3: `docs/MY_SHOPS.md` is gitignored — out of scope.

**Open questions**: none (user answered D1/D2 pre-dispatch).

**Concerns carried into final review**:
- C1: `viewport.themeColor` literal in app/layout.tsx — third literal color spot; DESIGN.md "exactly two places" wording undercounts.
- C2: PRODUCT.md stale facts ("12 passing tests", "docs in Russian").
- C3 (code, out of docs scope): `init/postgres_functions.sql:2` declares `returns setof design` (singular) — CREATE likely fails; needs code owner.
- C4 (operational): Vercel Cron issues GET vs POST-only sync route — documented as caveat; needs product decision if Vercel Cron is desired.

**Session state**: Phase 5 — task complete. All fix-in-slice findings applied and closed (RV-DOCS-001..006, incl. both backlog items). Backlog items requiring a code/product owner remain: C3 (`init/postgres_functions.sql` `returns setof design` singular — CREATE likely fails) and C4 (Vercel Cron vs POST-only route — product decision). 4 agent runs total, under the 8-run Standard ceiling. Disclosed substitution: the coordinator applied the one-line RV-DOCS-004 fix in docs/SYNC_SYSTEM.md directly instead of a dedicated re-dispatch.
