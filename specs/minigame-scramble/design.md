# Scramble — Design

Satisfies R1–R8. Lives in `src/server/src/minigames/scramble/`.

## Phase A: the fourth implementation makes a duplication undeniable

`scores()` is copy-pasted in all three shipped minigames: build groups of tied players,
award `[3, 2, 1]` by standard competition ranking, default the rest to zero. Scramble
needs exactly that logic keyed on a **different quantity** — items collected rather
than elimination time — which is the point at which it should stop being copied.

`awardByRank(roster, keyOf)` moves to `@ruckus/shared`: `keyOf` returns a number where
**higher is better**, equal keys tie, and the tie group pushes the next rank down by
its own size. The three existing minigames pass elimination time (survivors take
`Infinity`); Scramble passes the item count. One implementation, four callers, and the
tie semantics stop being three chances to get it subtly different.

## Constants

| name | value | why |
|---|---|---|
| `ARENA` | 22 m square | room for eight to spread out and still contest the middle |
| `WALL` | 1.0 m | clears `minThicknessFor(DASH_SPEED_MUL)` = 0.578 m |
| `ROUND_MS` | 45000 | fixed; lands mid-band of RD-011's 30–60 s by construction |
| `maxDurationMs` | 50000 | the shell's backstop, above `ROUND_MS` so the clock wins |
| `PICKUP_RADIUS` | 0.45 m | plus `PLAYER_RADIUS`, a forgiving 0.85 m grab |
| `START_PICKUPS` | 6 | the floor is never empty at the whistle |
| `MAX_PICKUPS` | 14 | dense enough to always have a target, sparse enough to choose |
| `SPAWN_INTERVAL_MS` | 600 | replaces a collected pickup in well under a second |
| `MIN_SPAWN_GAP` | 2.0 m | pickups do not cluster into a single free harvest |
| `SHOVE_SPEED` | 7.0 m/s | a shove costs a second of running, not a life |

Dash constants match `hot-potato` exactly: 220 ms at 2.1x on a 1400 ms cooldown. They
are re-exported rather than re-tuned — a dash that feels different in each minigame is
a worse game, not a richer one.

## State

```ts
interface Pickup { id: number; pos: Vec2 }
interface S {
  pickups: Pickup[];
  nextId: number;
  nextSpawnAt: number;
  counts: Map<number, number>;      // slot -> collected
  dashUntil: Map<number, number>;
  dashReadyAt: Map<number, number>;
  prevBtn: Set<number>;
  roster: number[];
  elapsed: number;
}
```

## Tick (20 Hz)

1. **Dash edges**, identical to `hot-potato`: down-now and up-last-tick, past the
   cooldown. **P1**: holding the button yields exactly one dash.
2. **Move.** `stepMovement` against the walls with `speedMul` while dashing, ground
   constant 0 — nothing falls in this round.
3. **Shove** (R3). For each dashing player, any other player within `2*PLAYER_RADIUS`
   takes a velocity impulse of `SHOVE_SPEED` along the shover's travel direction.
   **P2**: a shove changes velocity only. No count is ever decremented — there is no
   way to lose a banked point, which is what keeps a losing round from feeling worse
   than an elimination round.
4. **Spawn** (R2). Past `nextSpawnAt` and under `MAX_PICKUPS`, place one at a seeded
   position rejected if it is within `MIN_SPAWN_GAP` of an existing pickup, retried a
   bounded number of times so the tick can never hang.
5. **Collect** (R1). For each pickup, the **nearest** player inside the grab radius
   takes it; ties break on slot. **P3**: a pickup is removed in the same tick it is
   awarded, so it can never be double-counted.

**P4** (R5): `isOver` reads `elapsed >= ROUND_MS` and nothing else. It does not consult
the players at all, so an empty or fully disconnected lobby still ends on the clock.

## Snapshot

```ts
{ counts: { [slot]: number }, remaining: number, prims: [ /* one per pickup */ ] }
```

Pickups are `sphere` prims bobbing on a seeded phase, so a still frame does not look
like a bug. `counts` rides along for a future live scoreboard; no client reads it yet,
and that is fine — it costs a few bytes and the alternative is a protocol change later.

## Arena descriptor

Fixed camera `eye = (0, 28, 23)`, `look = origin`, `fov = 45`. `solids` carries the
four walls; `statics` carries the floor slab and the walls.

## Client

**None.** Pickups ride the generic `prims` channel. Three minigames in a row needing no
client file is the evidence that RD-009 was the right fix.
