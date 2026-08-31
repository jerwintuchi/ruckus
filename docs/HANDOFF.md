# Handoff

> **Overwritten every session — never appended.** If `git log -1` is not
> `15e073d`, work has happened since this was written: distrust it and read
> `docs/technical/spec-status.md` (derived) instead.

*Written 2026-08-31 12:26 · branch `visual-direction-phase-bc` ·
HEAD `15e073d` — perf(kit): the outline is free per fragment, not per draw — T18 · 0 uncommitted file(s)*

## What I was doing

visual-direction Phase E. T18 measured the paper build's cost instead of assuming it, found the draw-call regression RD-021 had hidden, and fixed it. Phases B/C were committed first, unchanged, on branch visual-direction-phase-bc.

## What is half-finished

Nothing broken. 469 tests, typecheck and all four guards green, status artifact republished. Two branch commits sit unmerged on visual-direction-phase-bc; main is still at a199339.

## The very next action

T19 — the only open box in visual-direction. Play it on a phone: 'pnpm playtest', open the printed phone URL, and read the two questions in tasks.md. Then open /bench.html on the same phone and record p95 in RD-028; that number and T12's arm's-length capture are both owed and both need the hardware.

## Gotchas

Draw calls are geometry GROUPS, not meshes. A six-material slab costs six draws; the mesh count went 5 to 7 and looked fine while the real cost went 40 to 296. A slab's material array is now indexed by group, not by face — use materialForFace(mesh, face), never material[4]. Committing a spec restages its own status report (the report embeds git's last-touched date), so status_html.py --check fails right after the commit: regenerate and amend, which is the documented wrinkle in spec-workflow.md.

## Uncommitted when this was written

- (clean tree)

---

*Durable history goes in `docs/DECISION_LOG.md` (append-only). What shipped is
derived by `tools/spec_status.py`. This file is neither — it is only ever "where the
hands were".*
