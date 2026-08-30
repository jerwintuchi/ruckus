# Handoff

> **Overwritten every session — never appended.** If `git log -1` is not
> `7c6215e`, work has happened since this was written: distrust it and read
> `docs/technical/spec-status.md` (derived) instead.

*Written 2026-08-31 00:50 · branch `master` ·
HEAD `7c6215e` — docs(visual-direction): paper, not PS1 — and an honest basis for the asset rule · 8 uncommitted file(s)*

## What I was doing

Built bot players (tools/bots.mjs) with a real strategy per minigame, wired --bots N into playtest.sh, and added 17 strategy tests. Solo playtesting now works: pnpm playtest:solo. 296 tests green.

## What is half-finished

Nothing. specs/visual-direction is still 0/16 (spec and reference only); specs/shell T16/T18 remain open and still need a DOM test env.

## The very next action

Actually play it — pnpm playtest:solo, join room PLAY. Every tuning number in the log so far came from bots driving tick() offline; this is the first time the game can be played by a person. Then Phase A of specs/visual-direction.

## Gotchas

Bots join BEFORE you, so a bot is host and you cannot press Start — host goes by join order. The host bot waits for a non-bot name then starts 3s later; bots-only rooms start on a 12s grace. A bot is an ordinary client with no server support, and it only sees what a snapshot carries — if you add a minigame and its bot cannot play it, the snapshot is probably missing something a human client would need too. vitest.config.ts now includes tools/**/*.test.mjs.

## Uncommitted when this was written

- `EADME.md`
- `docs/DECISION_LOG.md`
- `docs/technical/status.html`
- `package.json`
- `tools/playtest.sh`
- `vitest.config.ts`
- `tools/bots.mjs`
- `tools/bots.test.mjs`

---

*Durable history goes in `docs/DECISION_LOG.md` (append-only). What shipped is
derived by `tools/spec_status.py`. This file is neither — it is only ever "where the
hands were".*
