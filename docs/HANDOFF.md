# Handoff

> **Overwritten every session — never appended.** If `git log -1` is not
> `bda3c4f`, work has happened since this was written: distrust it and read
> `docs/technical/spec-status.md` (derived) instead.

*Written 2026-08-31 00:20 · branch `master` ·
HEAD `bda3c4f` — feat(tools): a generated status page, guarded like everything else · 7 uncommitted file(s)*

## What I was doing

Wrote specs/visual-direction (17 tasks): PS1-era world at 270p with 15-bit dither, box-humanoid characters with generated faces, and a chunky Nintendo-party DOM UI. Published a visual reference artifact that generates every texture and face live. No code written yet — this is the spec.

## What is half-finished

specs/visual-direction is entirely unimplemented (0/17) — the spec and the visual reference exist, the kit does not. Still open: specs/shell T16/T18, which the registry now shows as dormant.

## The very next action

Phase A of specs/visual-direction: the procedural texture kit (T1), the kit_check regression test (T2), and the face generator (T3). The artifact at the URL in RD-020 contains WORKING implementations of both generators in JS — port them, do not reinvent them.

## Gotchas

The Kit ban stands: textures are DataTextures generated in code, NOT files. kit_check bans TextureLoader but DataTexture is fine and T2 must assert that distinction. Vertex jitter and affine warping are DELIBERATELY excluded (RD-020) — adding either is a decision, not a tweak. The UI is DOM at native resolution and must never be drawn into the retro buffer; that split is the whole direction.

## Uncommitted when this was written

- `LAUDE.md`
- `README.md`
- `docs/DECISION_LOG.md`
- `docs/technical/spec-status.md`
- `docs/technical/status.html`
- `docs/technical/visual-direction.html`
- `specs/visual-direction/`

---

*Durable history goes in `docs/DECISION_LOG.md` (append-only). What shipped is
derived by `tools/spec_status.py`. This file is neither — it is only ever "where the
hands were".*
