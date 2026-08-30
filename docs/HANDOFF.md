# Handoff

> **Overwritten every session — never appended.** If `git log -1` is not
> `66327a9`, work has happened since this was written: distrust it and read
> `docs/technical/spec-status.md` (derived) instead.

*Written 2026-08-31 01:21 · branch `master` ·
HEAD `66327a9` — fix(ui): show the room code — it was never on screen · 2 uncommitted file(s)*

## What I was doing

Playtest tweak: every printed URL now carries ?room=CODE so the link is the whole invite, with --room to pick it. Confirmed Ruckus uses no Godot at all — the client is TypeScript + Three.js + Vite in a browser.

## What is half-finished

Nothing. shell T16 (render.ts) is the last open shell task and genuinely needs WebGL. specs/visual-direction is 0/16.

## The very next action

Play it: pnpm playtest:solo, then click the printed link. Then shell T16 or Phase A of specs/visual-direction.

## Gotchas

Room codes are 4 letters A-Z; --room now trims and SAYS SO rather than silently handing back a different room. Godot belongs to Testament only — if a doc or spec ever mentions Godot in Ruckus it is wrong.

## Uncommitted when this was written

- `EADME.md`
- `tools/playtest.sh`

---

*Durable history goes in `docs/DECISION_LOG.md` (append-only). What shipped is
derived by `tools/spec_status.py`. This file is neither — it is only ever "where the
hands were".*
