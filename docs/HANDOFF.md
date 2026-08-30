# Handoff

> **Overwritten every session — never appended.** If `git log -1` is not
> `a22272b`, work has happened since this was written: distrust it and read
> `docs/technical/spec-status.md` (derived) instead.

*Written 2026-08-30 23:58 · branch `master` ·
HEAD `a22272b` — feat(tools): playtest scripts, so the game can be played by actual people · 6 uncommitted file(s)*

## What I was doing

Added tools/status_html.py — a generated project status page, published as an artifact, wired into pnpm check so it cannot silently drift. Everything on it is derived: spec state from spec_status --json, the minigame roster parsed from the minigames' own source, decisions from the log, deps from the manifests, test count from the test files.

## What is half-finished

Nothing. Still open from the start: specs/shell T16 (render.ts) and T18 (ui.ts) are implemented and working but untested, needing a browser/DOM test env.

## The very next action

Playtest with real people (pnpm playtest) - every tuning figure in the log is from bots. Then minigame #5 (co-op, Hold the Line) or close T16/T18.

## Gotchas

The status page has TWO views that drift independently: the file and the published artifact. pnpm check guards the file; only the Artifact tool updates the artifact, so REPUBLISH after regenerating (artifact URL is in .claude/rules/spec-workflow.md and README). This is the exact failure that put the previous project's published registry two weeks behind while every check stayed green.

## Uncommitted when this was written

- `claude/rules/spec-workflow.md`
- `README.md`
- `docs/DECISION_LOG.md`
- `package.json`
- `docs/technical/status.html`
- `tools/status_html.py`

---

*Durable history goes in `docs/DECISION_LOG.md` (append-only). What shipped is
derived by `tools/spec_status.py`. This file is neither — it is only ever "where the
hands were".*
