# Hot Potato — Design

Satisfies R1–R8. Lives in `src/server/src/minigames/hot-potato/`.

## Prerequisite: the shell leaked (RD-009)

`src/client/src/main.ts` currently decodes Falling Floor's tile protocol inline
(`extra.full` / `extra.changed`). That is minigame-specific code in the shell
entrypoint — invisible with one minigame, obvious with two. Hot Potato needs a
dynamic visual (the bomb) and must not add a second such branch.

Two changes, both generalisations rather than special cases:

1. **A generic `prims` channel.** Any minigame's `snapshot()` may include
   `prims: Prim[]`; the renderer rebuilds them each frame from the closed `Prim`
   union it already knows. Most minigames will need nothing else, and Hot Potato
   needs exactly this — one sphere.
2. **A client minigame registry**, `src/client/src/minigames/index.ts`, mapping id →
   optional handler. Falling Floor's tile decoding moves there. `main.ts` stops
   knowing any minigame's name.

## Constants

| name | value | why |
|---|---|---|
| `ARENA` | 18 m square | ~3.3 s corner to corner at `MAX_SPEED`; big enough to flee, small enough to be caught |
| `WALL` | 1.0 m thick | over `MIN_SOLID_THICKNESS` (0.5), so no tunnelling (shell P7) |
| `FUSE_START_MS` | 9000 | long enough for two or three passes |
| `FUSE_STEP_MS` | 1000 | each explosion tightens the screw |
| `FUSE_MIN_MS` | 4000 | below this it is a coin flip, not a decision |
| `PASS_LOCK_MS` | 600 | see below |
| `CONTACT` | `2 * PLAYER_RADIUS` | bodies touching |
| `DASH_MS` | 220 | a burst, not a mode |
| `DASH_SPEED_MUL` | 2.1 | enough to close a gap, not enough to be the only tactic |
| `DASH_COOLDOWN_MS` | 1400 | you get roughly one committed attempt per pass |
| `maxDurationMs` | 90000 | hard stop (shell R5) |

**Why `PASS_LOCK_MS` exists.** Without it, two players standing in contact swap the
bomb every tick — 20 passes a second, visually a strobe and mechanically a stalemate.

**P1**: no pair exchanges the bomb twice inside `PASS_LOCK_MS`.

*Corrected during implementation (RD-010).* This originally specified a **symmetric**
lock — the new holder cannot pass, *and* the previous holder cannot receive. The
second half is unreachable: the first already blocks **every** pass for the whole
window, so the receive-check can only be evaluated at a moment when nobody may
receive. It is one gate. Ping-pong at the boundary (A→B, then B→A exactly
`PASS_LOCK_MS` later) is allowed and harmless: the fuse keeps running underneath, so
two players glued together still lose one of themselves on schedule.

## State

```ts
interface S {
  holder: number;              // slot
  fuseMs: number;              // counts down
  fuseLength: number;          // this fuse's starting length
  lockUntil: number;           // elapsed ms until the bomb may move at all
  dashUntil: Map<number, number>;
  dashReadyAt: Map<number, number>;
  prevBtn: Set<number>;        // for edge-triggering the dash (R4)
  alive: Set<number>;
  placement: number[];         // elimination order, first out first
  elimAt: Map<number, number>;
  roster: number[];
  elapsed: number;
}
```

## Tick (20 Hz)

1. **Dash edges.** For each living player, a button that is down now and was up last
   tick, with `elapsed >= dashReadyAt`, starts a dash. **P2**: holding the button
   produces exactly one dash per press, never a chain.
2. **Move.** `stepMovement` with `speedMul` = `DASH_SPEED_MUL` while dashing, else 1,
   against the four wall solids. Ground is a constant 0 — nothing to fall through.
3. **Passes.** While `elapsed >= lockUntil`, any living non-holder within `CONTACT`
   of the holder may take the bomb; `lockUntil` is pushed to `elapsed + PASS_LOCK_MS`.
   Only the **nearest** contact takes it, so a three-way pile-up resolves by geometry
   rather than by array order (ties break on slot, so it stays seeded).
4. **Fuse.** `fuseMs -= dt*1000`. At or below zero: the holder is eliminated and
   recorded; `fuseLength = max(FUSE_MIN_MS, fuseLength - FUSE_STEP_MS)`; the bomb goes
   to the nearest surviving player; the lock is cleared.

**P3** (R6): the round terminates with zero input. Each fuse is at least `FUSE_MIN_MS`
and every expiry removes exactly one player, so with N players the round is over after
at most `N-1` fuses — bounded by `FUSE_START_MS * (N-1)`, which for 8 players is 63 s,
inside the 90 s cap.

**P4** (R1): exactly one holder exists whenever two or more players are alive, and the
holder is always alive.

## Snapshot

```ts
{ holder, fuse: fuseMs, fuseLength, prims: [ { k: "sphere", pos, r, colour } ] }
```

The bomb prim rides above the holder's head. Its colour ramps from `pickup` to
`hazard` as the fuse runs down, and its radius pulses faster as it shortens — the
whole tension read, procedural, no asset (RD-005). **P5**: the prim's position tracks
the holder's body within a tick.

## Arena descriptor

Fixed camera `eye = (0, 24, 20)`, `look = origin`, `fov = 45` — the 18 m arena and its
walls on screen with no occlusion. `solids` carries the four walls; `statics` carries
the floor slab and the four wall boxes so they are drawn once.

## Client

**None.** The bomb arrives through the generic `prims` channel added above. This is
the property that makes minigame #3 cheap, and the reason Hot Potato was chosen as
the second one.
