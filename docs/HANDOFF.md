# Handoff

> **Overwritten every session — never appended.** If `git log -1` is not
> `8de317a`, work has happened since this was written: distrust it and read
> `docs/technical/spec-status.md` (derived) instead.

*Written 2026-08-31 00:32 · branch `master` ·
HEAD `8de317a` — docs(visual-direction): the look, and how it keeps the Kit ban intact · 9 uncommitted file(s)*

## What I was doing

Rewrote specs/visual-direction to a Paper Mario direction (RD-021), superseding the PS1 one. Slabs with ink edge faces so the outline is geometry rather than a shader; unlit characters; palette moved to paper stock. 16 open tasks, 3 marked superseded in place. The visual artifact was rewritten to match and now demonstrates the slab with a live CSS 3D rotation.

## What is half-finished

Nothing implemented yet — visual-direction is 0/16, spec and reference only. specs/shell T16/T18 remain open (dormant) and still need a DOM test env.

## The very next action

Phase A of specs/visual-direction: paper texture kit (T1), kit_check regression (T2), face generator (T3), palette to paper stock (T4). The artifact contains WORKING JS for the texture and face generators — port them, do not reinvent them.

## Gotchas

RD-021 supersedes RD-020: NO retro buffer, NO dither, NO fog, NO nearest filtering — those fight flat colour, which is the whole paper read. The outline is the slab's near-black EDGE FACES, not a shader; a fullscreen outline pass is a decision, not a tweak, and T8 asserts none exists. Characters are slabs NOT billboards: depth judgement is load-bearing in Sweepers and Hot Potato. And the no-asset rule is held on RD-001 process grounds, NOT performance — measurement says procedural buys cold start only, never frame rate.

## Uncommitted when this was written

- `LAUDE.md`
- `README.md`
- `docs/DECISION_LOG.md`
- `docs/technical/spec-status.md`
- `docs/technical/status.html`
- `docs/technical/visual-direction.html`
- `specs/visual-direction/design.md`
- `specs/visual-direction/requirements.md`
- `specs/visual-direction/tasks.md`

---

*Durable history goes in `docs/DECISION_LOG.md` (append-only). What shipped is
derived by `tools/spec_status.py`. This file is neither — it is only ever "where the
hands were".*
