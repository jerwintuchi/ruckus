# Handoff

> **Overwritten every session — never appended.** If `git log -1` is not
> `191940a`, work has happened since this was written: distrust it and read
> `docs/technical/spec-status.md` (derived) instead.

*Written 2026-08-31 02:13 · branch `main` ·
HEAD `191940a` — docs: de-identify the post-mortem before publishing · 9 uncommitted file(s)*

## What I was doing

Built visual-direction Phase A: textures.ts (8 procedural paper generators into DataTextures) and face.ts (8 distinct generated faces), plus kit-rules.test.ts proving the Kit ban still bites with textures in play. 415 tests.

## What is half-finished

Nothing broken. visual-direction is 8/16 with 3 superseded: Phase B (outlines + materials, T8-T9) and Phase C (the slab character, T10-T12) are the remaining 3D work. T4's arena half is deliberately still open.

## The very next action

Phase B (T8 native crisp rendering + the geometry outline strategy, T9 unlit characters and paper materials), then Phase C rebuilds the character as slabs. That is when T4's arena retarget lands too.

## Gotchas

kit_check scans TEST files too — kit-rules.test.ts assembles the forbidden loader identifier at runtime, because naming it in source makes the test violate the rule it tests. Do NOT exempt tests from the scan to make that convenient. Face eye-spacing is capped at 0.30: at 0.44 the outer brow landed at x=44 on a 40px face and was silently clipped. Textures are LinearFilter (paper is smooth) — the opposite of what the superseded PS1 spec wanted.

## Uncommitted when this was written

- `ocs/DECISION_LOG.md`
- `docs/technical/spec-status.md`
- `docs/technical/status.html`
- `specs/visual-direction/tasks.md`
- `src/client/src/kit/face.test.ts`
- `src/client/src/kit/face.ts`
- `src/client/src/kit/kit-rules.test.ts`
- `src/client/src/kit/textures.test.ts`
- `src/client/src/kit/textures.ts`

---

*Durable history goes in `docs/DECISION_LOG.md` (append-only). What shipped is
derived by `tools/spec_status.py`. This file is neither — it is only ever "where the
hands were".*
