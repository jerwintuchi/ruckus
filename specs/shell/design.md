# Shell — Design

Satisfies R1–R10.

## Wire protocol (`src/shared/src/protocol.ts`)

Envelope: every message is `{ t: <tag>, ... }`. Tags are short; this is per-tick data.

### Client → Server
| tag | payload | notes |
|---|---|---|
| `join` | `{ code: string, name: string }` | R1. `name` clamped to 12 chars, stripped |
| `start` | `{}` | R3. Host only |
| `input` | `{ ax: number, ay: number, btn: boolean }` | R10. Axis clamped to unit disc |
| `pong` | `{ id: number }` | RTT estimate for interpolation |

### Server → Client
| tag | payload | notes |
|---|---|---|
| `welcome` | `{ slot, code, host: slot }` | R2 |
| `room` | `{ players: [{slot,name,colour,score,connected}], host, state }` | lobby//result view |
| `intro` | `{ game: id, rule: string, displayName, endsAt }` | R4, 4 s |
| `roundStart` | `{ game: id, arena: ArenaDescriptor, roster: slot[], endsAt }` | R8 — strings once |
| `snap` | `{ seq, t, players: [...], extra }` | 20 Hz, quantized (R8) |
| `roundEnd` | `{ scores: {slot:points}, totals: {slot:points} }` | R4 |
| `matchEnd` | `{ totals, winner: slot }` | R4 |
| `err` | `{ code: string }` | R1/R3/R10 — to one socket only |

`ArenaDescriptor` carries the **fixed camera** (`eye`, `look`, `fov`) and the static
geometry as primitive descriptors — `{k:'box', pos, size, colour}` etc. The client
builds meshes from these; there is no asset (RD-005).

## Quantization (R8, P3)

`qpos = round(metres * 100)` as an integer; `qang = round(rad / (2π) * 255)`. Decoded
client-side. **P3**: `dequant(quant(x))` is within 5 mm of `x` for |x| < 100 m.

## Match state machine (`src/server/src/match.ts`)

```
LOBBY ──start──▶ ROUND_INTRO ──4s──▶ ROUND_PLAY ──isOver|timeout──▶ ROUND_RESULT
  ▲                    ▲                                                  │
  └──── MATCH_RESULT ◀─┴──────────── rounds remaining? ───────────────────┘
```

Transitions are evaluated once per tick in the room's `update(dt)`. **P1**: no
transition is reachable from a client message; `start` only sets a flag the machine
reads. **P2**: `ROUND_PLAY` always leaves within `maxDurationMs` regardless of input
(R5) — the shell holds the deadline, not the minigame.

Selection (R4) uses a shuffled bag: shuffle the registry with the match seed, deal
without replacement, reshuffle when empty.

## Minigame contract (`src/shared/src/minigame.ts`)

```ts
export interface Minigame<S = unknown> {
  id: string; displayName: string; rule: string;
  input: 'stick' | 'stick+button' | 'tap';
  maxDurationMs: number;
  init(ctx: InitCtx): S;
  tick(s: S, ctx: TickCtx): void;
  isOver(s: S, ctx: TickCtx): boolean;
  scores(s: S): Record<number, number>;
  snapshot(s: S): MinigameSnapshot;
  arena(s: S): ArenaDescriptor;
}
export interface TickCtx {
  dt: number;                              // fixed, 1/20
  elapsed: number;
  rng: Rng;                                // seeded, server-only (R7)
  players: PlayerRuntime[];                // slot, pos, vel, height, alive, connected
  input(slot: number): InputState;         // last input this tick; zeroed if disconnected
}
```

**P4** (R6): the shell imports minigames only through
`src/server/src/minigames/index.ts`. A minigame imports nothing from `match.ts`,
`room.ts` or the transport — enforced by a test that greps the module graph.

## Simulation primitives (`src/shared/src/sim/`)

- `rng.ts` — mulberry32. **P5**: identical seed → identical sequence, cross-run.
- `vec.ts` — 2D X/Z vectors. Pure.
- `move.ts` — `stepMovement(p, input, dt, arena)`:
  1. clamp input to the unit disc (R9, never reject)
  2. accelerate toward `input * MAX_SPEED`, apply friction
  3. integrate, then resolve circle-vs-AABB against arena solids
  4. integrate height: `vy -= GRAVITY*dt`, land at floor height

  **P6**: resolution is idempotent. **P7**: no tunnelling — the swept distance per
  tick (`MAX_SPEED/20` ≈ 0.4 m) is under the minimum solid thickness (0.5 m), asserted
  by a constant check so a future arena cannot silently violate it.

## Tick loop (R8)

Fixed timestep accumulator at 50 ms, max 5 catch-up steps per real frame. **P8**: a
1-second stall produces at most 5 simulation steps, never 20.

## Client (`src/client/src/`)

- `net.ts` — WebSocket, snapshot ring buffer (last 8), interpolation clock at
  `now - 100ms` (RD-004). **P9**: with snapshots at 20 Hz the interpolator never
  extrapolates; if it starves it holds the last frame rather than guessing.
- `kit/` — palette, primitive builders, procedural character animation
- `render.ts` — one Three.js scene; fixed camera from `ArenaDescriptor`
- `input.ts` — virtual stick (touch) + WASD/arrows (keyboard) → the same `InputState`
