# Handoff

> **Overwritten every session — never appended.** If `git log -1` is not
> `89d986d`, work has happened since this was written: distrust it and read
> `docs/technical/spec-status.md` (derived) instead.

*Written 2026-08-31 00:57 · branch `master` ·
HEAD `89d986d` — feat(tools): bots, because a match needs two players and you are one · 12 uncommitted file(s)*

## What I was doing

Fixed a real gap found in playtest: the lobby never displayed the room code (RD-023). Added the code display, a copy-invite-link button with an insecure-context fallback, and a wait-note naming the host. Wrote ui.test.ts (14 tests) which finally lets shell T18 be ticked honestly — 18/19.

## What is half-finished

Nothing. shell T16 (render.ts) is the last open shell task and genuinely needs WebGL. specs/visual-direction is still 0/16.

## The very next action

Play it: pnpm playtest:solo, join room PLAY. Then either shell T16 or Phase A of specs/visual-direction.

## Gotchas

RD-023's lesson: every UI test here asserted STATE (is host, is button enabled) and none asserted what is RENDERED, which is why an empty lobby went unnoticed through four minigames. navigator.clipboard needs a secure context and a phone on a LAN over http is not one — the fallback path is the one that usually runs, so do not delete it. The DOM stub in ui.test.ts was enough; jsdom was never needed, which is why T18 sat open for days for no reason.

## Uncommitted when this was written

- `ocs/DECISION_LOG.md`
- `docs/technical/spec-status.md`
- `docs/technical/status.html`
- `specs/shell/tasks.md`
- `src/client/src/main.ts`
- `src/client/src/ui.ts`
- `tools/playtest.sh`
- `src/client/src/ui.test.ts`
- `"tools/playtest - Shortcut (2).lnk"`
- `"tools/playtest - Shortcut (3).lnk"`
- `"tools/playtest - Shortcut (4).lnk"`
- `"tools/playtest - Shortcut.lnk"`

---

*Durable history goes in `docs/DECISION_LOG.md` (append-only). What shipped is
derived by `tools/spec_status.py`. This file is neither — it is only ever "where the
hands were".*
