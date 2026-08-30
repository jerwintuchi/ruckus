# Handoff

> **Overwritten every session — never appended.** If `git log -1` is not
> `(no commits)`, work has happened since this was written: distrust it and read
> `docs/technical/spec-status.md` (derived) instead.

*Written 2026-08-30 19:53 · branch `(no branch)` ·
HEAD `(no commits)` — — · 15 uncommitted file(s)*

## What I was doing

Scaffolded Ruckus end to end: repo, context tooling, the shell spec, and the first minigame (Falling Floor). 143 tests green, pnpm check green, client builds, and a real 3-client match has been driven over the wire.

## What is half-finished

specs/shell T16 (render.ts) and T18 (ui.ts) are IMPLEMENTED and working but have no tests, so they are deliberately left unticked - both need a browser/DOM test environment that is not set up. The registry flags them as MISSING, which is correct.

## The very next action

Either set up a DOM test env (jsdom or vitest browser mode) to close T16/T18, or start minigame #2 (Hot Potato) - the contract is proven and a second minigame is the cheapest way to test that it generalises.

## Gotchas

Node --experimental-strip-types cannot handle TS parameter properties or .js import specifiers - server sources use explicit field assignment and .ts specifiers with rewriteRelativeImportExtensions. Do not reintroduce either. Player colours live ONLY in src/shared/src/colours.ts; they were chosen by search against colour-blindness simulation (RD-007) and casually brightening them re-breaks the test.

## Uncommitted when this was written

- `.claude/`
- `.gitattributes`
- `.github/`
- `.gitignore`
- `CLAUDE.md`
- `README.md`
- `docs/`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `specs/`
- `src/`

---

*Durable history goes in `docs/DECISION_LOG.md` (append-only). What shipped is
derived by `tools/spec_status.py`. This file is neither — it is only ever "where the
hands were".*
