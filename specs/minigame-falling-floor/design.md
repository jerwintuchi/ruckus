# Falling Floor — Design

Satisfies R1–R6. Lives in `src/server/src/minigames/falling-floor/`.

## Constants

| name | value | why |
|---|---|---|
| `GRID` | 9×9 | 81 tiles, readable at phone size with 8 capsules on it |
| `TILE` | 1.6 m | ~2 body widths; a player can straddle two tiles |
| `CRACK_MS` | 1100 | long enough to cross, short enough to force movement |
| `FALL_MS` | 500 | the warning window after cracking |
| `SHRINK_START_MS` | 25000 | stalemate breaker (R4) |
| `SHRINK_INTERVAL_MS` | 2200 | one ring per interval |
| `maxDurationMs` | 75000 | hard stop (shell R5) |

## State

```ts
type TileState = 'solid' | 'cracking' | 'gone';
interface S {
  tiles: { state: TileState; crack: number; fallAt: number }[];  // GRID*GRID, row-major
  alive: Set<number>;            // slots
  placement: number[];           // slots in elimination order, last-out first
  ring: number;                  // outermost ring not yet condemned (R4)
  elapsed: number;
}
```

## Tick (20 Hz)

1. **Occupancy** — for each alive player, the tile under their centre gains
   `dt*1000` crack. **P1**: two occupants add twice as much (R1).
2. **Promote** — `crack >= CRACK_MS` → `cracking`, `fallAt = elapsed + FALL_MS`.
   `elapsed >= fallAt` → `gone`.
3. **Shrink** (R4) — past `SHRINK_START_MS`, every `SHRINK_INTERVAL_MS` condemn ring
   `ring` (set every solid tile in it to `cracking`) and decrement. **P2**: the ring
   schedule alone clears the whole grid by 25 000 + 5 × 2 200 + 500 < `maxDurationMs`,
   so R4's no-input property holds by construction.
4. **Move** — `stepMovement` from `@ruckus/shared`, arena solids empty (open platform).
5. **Fall** — a player whose tile is `gone` (or off-grid) gets `grounded = false`;
   gravity takes them. Below `-3 m` → eliminated, pushed onto `placement`.

**P3** (R2): elimination tests ground under the body centre, so a player straddling a
gone tile and a solid one survives — the tile id is never the criterion.

## Scoring (R3)

Finish order is survivors first, then the eliminated by elimination time, latest
first. Players who fell on the *same tick* form one group and all take that group's
best rank; the next group is pushed down by the size of the tie (standard competition
ranking). Points by rank: 3, 2, 1, then 0.

**P4** — *corrected during implementation, RD-006.* This was originally "the total
awarded never exceeds 6", which is unsatisfiable alongside shared placements: two
tied winners already take 3 + 3, and a third place pushes the total to 7. The
property that actually holds is: **no player scores more than 3, and nobody
eliminated strictly earlier outscores someone eliminated later.**

## Snapshot

Tiles change rarely, so the snapshot carries a **delta**: `{ changed: [idx, state] }`
plus a full `tiles` array only in the first snapshot after `roundStart`. Players ride
the shell's standard quantized player array. **P5**: applying every delta in order to
the initial array reproduces the server's tile array exactly.

## Arena descriptor

Camera is fixed: `eye = (0, 21, 17)`, `look = (0, 0, 0)`, `fov = 45` — a high
three-quarter view that puts the whole 14.4 m grid on screen with no occlusion
(RD-005). Static geometry is empty; tiles are dynamic and come from the snapshot.

## Client

Nothing new. Tiles are boxes: `solid` = floor colour, `cracking` = hazard colour with
a per-tile shudder driven by `fallAt - now`, `gone` = the box drops and fades. The
shudder is procedural, from the Kit, and is the one visual affordance the rule needs.
