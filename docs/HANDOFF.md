# Handoff

> **Overwritten every session — never appended.** If `git log -1` is not
> `9aa9bf7`, work has happened since this was written: distrust it and read
> `docs/technical/spec-status.md` (derived) instead.

*Written 2026-08-31 01:49 · branch `master` ·
HEAD `9aa9bf7` — feat(lobby): rooms are created, not conjured · 15 uncommitted file(s)*

## What I was doing

Built visual-direction Phase D (T13-T17): the paper UI kit, screens and a snapshot-driven HUD, in src/client/src/ui/. It subsumed lobby-flow T11, so lobby-flow is 11/12. 378 tests, client builds to 133KB gzipped.

## What is half-finished

Nothing broken. visual-direction is 5/16 with 3 superseded — Phases A (textures/faces), B (materials) and C (the slab character) are the 3D work and are untouched. T4 is PARTLY done: PAPER tokens exist and the UI uses them; the arena tokens are deliberately not retargeted yet.

## The very next action

visual-direction Phase A (T1 texture kit, T2 kit_check regression, T3 face generator) — the published artifact has working JS for two of the three. Then Phases B and C convert the world, and T4's arena half lands with them.

## Gotchas

The UI is now a directory: src/client/src/ui/{kit,screens,hud}.ts. PAPER tokens sit ALONGSIDE the arena tokens on purpose — retargeting the arena now would put a bright paper sky over a dark Lambert-lit world. The HUD must never name a minigame; hud.test.ts greps the whole ui/ directory for every registered id. No box-shadow anywhere may have a blur radius, and kit.test.ts enforces it.

## Uncommitted when this was written

- `ocs/DECISION_LOG.md`
- `docs/technical/spec-status.md`
- `docs/technical/status.html`
- `specs/lobby-flow/tasks.md`
- `specs/visual-direction/tasks.md`
- `src/client/src/kit/palette.ts`
- `src/client/src/main.ts`
- `src/client/src/ui.ts`
- `src/client/src/ui.test.ts -> src/client/src/ui/screens.test.ts`
- `src/client/src/ui/hud.test.ts`
- `src/client/src/ui/hud.ts`
- `src/client/src/ui/index.ts`

---

*Durable history goes in `docs/DECISION_LOG.md` (append-only). What shipped is
derived by `tools/spec_status.py`. This file is neither — it is only ever "where the
hands were".*
