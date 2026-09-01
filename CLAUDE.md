# Ruckus — Root Context

> Ruckus is an 8-player browser party game: tap a link, enter a room code, play.
> A match is five short minigames plus a finale, ~10 minutes. Authoritative Node
> server, TypeScript + Three.js web client, low-poly 3D with a fixed camera.

@docs/vision.md
@.claude/rules/spec-workflow.md

## Budget — this file is capped

**CLAUDE.md must stay under 6 KB** (`python3 tools/context_budget.py --check`).

It is loaded in full on every turn of every session, so it holds only what is true
for *all* work. It is not a changelog, not a status report, not a handoff. Those
have homes below, and every one of them is derived or bounded:

| You want | Read | Never |
|---|---|---|
| What shipped / what's rotting | `docs/technical/spec-status.md` (**generated**) | prose in this file |
| Why a decision was made | `docs/DECISION_LOG.md` (append-only, `RD-###`) | prose in this file |
| Where the last session stopped | `docs/HANDOFF.md` (**overwritten**, capped) | prose in this file |

An earlier project's CLAUDE.md reached 18,700 tokens because completed-work prose accreted
in it, and the file itself ended up warning that the prose was unreliable. **Status
is derived, never asserted.** If you catch yourself writing "Completed: ..." here,
it belongs in the DECISION_LOG and the registry will report it for free.

## Active Work

<!-- Max 20 lines. Pointer + next actions only. No history. -->

Phase: **Verifying on the phone.**

The build work of the phone phase is done: framing, touch controls, the action button,
spectating, collision. Nine specs now hold **one open box each, and every one of them is
a manual playtest task** — the questions those specs were written to ask, which only a
person holding a device can answer.

Next: close those nine. `specs/audio/` is the last unbuilt feature (0/5, specced) and
waits behind them by its own note.

## Trust Boundary

| Layer | Path | Role |
|---|---|---|
| Server | `src/server/` | Authoritative. All game state. Never trust the client. |
| Shared | `src/shared/` | Wire protocol + deterministic sim primitives. No game rules. |
| Client | `src/client/` | Render + input only. Untrusted. Zero game logic. |

Transport is **raw WebSocket with a JSON envelope**. Both halves are TypeScript and
import `@ruckus/shared` directly, so the protocol is a shared type, not a mirrored
contract.

## The Kit is CLOSED — geometry is code

The art drain is designed out structurally, not by discipline.

- **No model files. No image files. No Blender.** `.glb/.gltf/.fbx/.obj/.blend` and
  image assets are rejected by `python3 tools/kit_check.py --check`.
- **Textures are generated in code** into `DataTexture`s (RD-020) — real textures, no
  file, no loader. A texture the generators cannot express is one the design does
  without, never a reason to add a file.
- Everything is a Three.js **primitive** — box, cylinder, sphere, plane — coloured from
  the fixed palette in `src/client/src/kit/palette.ts`.
- The look is **paper cutouts with hard outlines** (RD-021). A character is a thin slab
  with near-black edge faces, so the outline is *geometry* — no shader, no pass, no
  per-frame cost. Characters are unlit; paper does not receive light.
- Character animation is **procedural and hinged**. No rigs, no keyframes.
- No shadow maps, no post-processing, no fog.

A minigame that "needs" a new asset needs a different rule instead.

## Non-negotiables

1. **The simulation is 2.5D.** Movement solves on the X/Z plane (circle-vs-AABB);
   `y` is a scalar for jump height. No physics engine, server or client. 3D is a
   *rendering* choice and the server never knows about it.
2. **One thumb.** One virtual stick + at most one button. The camera is fixed per
   arena and is never player-controlled. A minigame needing more input is out of scope.
3. **Mobile-first.** Every change is judged on a mid-range phone in landscape, not
   on the desktop it was written on. 60fps is the floor.
4. **A minigame is a plugin**, implementing `Minigame` from `@ruckus/shared` in
   `src/server/src/minigames/<id>/`. The shell knows nothing about any specific one.
5. **Seeded RNG is server-only and deterministic.** Same seed → same round. Never
   `Math.random()` in simulation.
6. **`docs/DECISION_LOG.md` is append-only.** Never edit a past entry; only add.
7. **Every task (T#) cites a requirement (R#) and names its test before being done.**

## Session close

Before ending a session, run `python3 tools/handoff.py` and fill in the four fields.
It **overwrites** `docs/HANDOFF.md` — the file never grows, and a stale handoff is
worse than none.

## On-demand rules

Load these when the work touches them; they are deliberately not eager.

- `.claude/rules/netcode-invariants.md` — server authority, validation, snapshots
- `.claude/rules/kit-rules.md` — the closed Kit in detail, palette, procedural anim
- `.claude/rules/minigame-contract.md` — how to author a new minigame
