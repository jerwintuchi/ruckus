# Handoff

> **Overwritten every session — never appended.** If `git log -1` is not
> `213a70e`, work has happened since this was written: distrust it and read
> `docs/technical/spec-status.md` (derived) instead.

*Written 2026-09-04 23:01 · branch `main` ·
HEAD `213a70e` — docs: hand off with the driver working and the colour row reachable · 17 uncommitted file(s)*

*prose-at `213a70e`*

## What I was doing

Built tools/drive.mjs into a working browser driver (RD-117: Chrome for Testing under ~/.cache, CDP over Node's WebSocket; RD-119: --until waits for a state inside the page). Used it to find and fix RD-118 — the lobby colour row rendered 34px below the bottom of its own scroller, so elementFromPoint on a swatch returned the card behind it. Controls are now pinned outside .lobbyscroll; .slots hides at the 430px tier to buy the roster height back.

## What is half-finished

Nothing half-done in the tree. pnpm verify green (1190 tests, 61 files), status.html regenerated AND republished (it was 15 decisions and 6 specs stale).

## The very next action

round-status is the next unbuilt spec (statusColour is already in palette.ts). Then mutators, then main-menu. round-countdown T4/T8, round-open T9, lobby-social T11 and input-prediction T8 are all manual phone boxes — a screenshot never ticks one.

## Gotchas

A live stack is running: server+client, bots on room NL5W (autostart ON, bot-1 host). The driver must click #readyBtn or bot-1 logs NOT_READY forever — the gate needs every connected player ready, including a headless one. Never pkill -f a pattern that is in your own command line; use pgrep -x chrome. RD-113's 'the 2 and 1 are not visible' is now closed: a per-frame recorder shows red 3 / amber 2 / green 1, one second each.

## Uncommitted when this was written

- `.claude/settings.json`
- `.githooks/pre-commit`
- `.gitignore`
- `CLAUDE.md`
- `docs/DECISION_LOG.md`
- `docs/technical/shots.html`
- `docs/technical/shots.json`
- `docs/technical/spec-status.md`
- `docs/technical/status.html`
- `package.json`
- `src/server/src/main.ts`
- `src/server/src/net.test.ts`

---

*Durable history goes in `docs/DECISION_LOG.md` (append-only). What shipped is
derived by `tools/spec_status.py`. This file is neither — it is only ever "where the
hands were".*
