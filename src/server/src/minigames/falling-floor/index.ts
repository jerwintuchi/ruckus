/**
 * Falling Floor — "The floor is falling. Don't be on it."
 *
 * The first minigame, and the proof that the plugin contract is sufficient: it
 * touches no shell file except the registry, and it adds no asset (RD-005).
 *
 * Deliberately the simplest rule that is still fun. Movement only, no button. It has
 * to be legible from one glance at the arena (vision pillar 1), and a crumbling floor
 * is about as legible as a rule gets.
 */
import {
  type ArenaDescriptor,
  type InitCtx,
  type Minigame,
  type MinigameSnapshot,
  type TickCtx,
  TICK_DT,
  stepMovement,
  vec,
  type Vec2,
  awardByRank,
} from "@ruckus/shared";

export const GRID = 11;
export const TILE = 2.0;
export const CRACK_MS = 1100;
export const FALL_MS = 500;
export const SHRINK_START_MS = 25_000;
export const SHRINK_INTERVAL_MS = 2200;
export const KILL_Y = -3;
export const MAX_DURATION_MS = 75_000;

const HALF = (GRID * TILE) / 2;

export type TileState = 0 | 1 | 2; // solid | cracking | gone

export interface Tile {
  state: TileState;
  crack: number;
  fallAt: number;
}

export interface FallingFloorState {
  tiles: Tile[];
  /** Every slot that started the round — survivors are roster minus eliminated. */
  roster: number[];
  /** Elimination order, first out first. */
  placement: number[];
  /** slot -> the elapsed ms at which they fell, so same-tick ties are detectable. */
  elimAt: Map<number, number>;
  eliminated: Set<number>;
  /** The outermost ring not yet condemned; counts inward (R4). */
  ring: number;
  nextShrinkAt: number;
  elapsed: number;
  /** Tile indices whose state changed this tick, for the snapshot delta (P5). */
  changed: number[];
  firstSnapshotSent: boolean;
}

const idx = (col: number, row: number): number => row * GRID + col;

/** Grid cell under a world position, or null if outside the grid entirely. */
export function cellAt(p: Vec2): { col: number; row: number } | null {
  const col = Math.floor((p.x + HALF) / TILE);
  const row = Math.floor((p.z + HALF) / TILE);
  if (col < 0 || col >= GRID || row < 0 || row >= GRID) return null;
  return { col, row };
}

export function tileCentre(col: number, row: number): Vec2 {
  return vec(col * TILE - HALF + TILE / 2, row * TILE - HALF + TILE / 2);
}

/** How far a cell is from the edge — ring 0 is the outermost band. */
const ringOf = (col: number, row: number): number =>
  Math.min(col, row, GRID - 1 - col, GRID - 1 - row);

export const fallingFloor: Minigame<FallingFloorState> = {
  id: "falling-floor",
  displayName: "Falling Floor",
  rule: "The floor is falling, so keep moving.",
  input: "stick",
  maxDurationMs: MAX_DURATION_MS,

  init(ctx: InitCtx): FallingFloorState {
    const tiles: Tile[] = Array.from({ length: GRID * GRID }, () => ({
      state: 0 as TileState,
      crack: 0,
      fallAt: 0,
    }));

    // Spawn on distinct cells in the inner region, so nobody starts on an edge that
    // is about to be condemned and nobody starts inside anybody else (R5).
    const inner: number[] = [];
    for (let row = 1; row < GRID - 1; row++) {
      for (let col = 1; col < GRID - 1; col++) inner.push(idx(col, row));
    }
    ctx.rng.shuffle(inner);

    ctx.players.forEach((p, i) => {
      const cell = inner[i % inner.length]!;
      const centre = tileCentre(cell % GRID, Math.floor(cell / GRID));
      p.body.pos = { ...centre };
      p.body.vel = vec();
      p.body.y = 0;
      p.body.vy = 0;
      p.body.grounded = true;
      p.alive = true;
    });

    return {
      tiles,
      roster: ctx.players.map((p) => p.slot),
      placement: [],
      elimAt: new Map(),
      eliminated: new Set(),
      ring: 0,
      nextShrinkAt: SHRINK_START_MS,
      elapsed: 0,
      changed: [],
      firstSnapshotSent: false,
    };
  },

  tick(s: FallingFloorState, ctx: TickCtx): void {
    s.elapsed = ctx.elapsed;
    s.changed = [];

    const condemn = (i: number): void => {
      const t = s.tiles[i]!;
      if (t.state !== 0) return;
      t.state = 1;
      t.fallAt = s.elapsed + FALL_MS;
      s.changed.push(i);
    };

    // 1. Occupancy. Two players on one tile crack it twice as fast (R1, P1).
    for (const p of ctx.players) {
      if (!p.alive) continue;
      const cell = cellAt(p.body.pos);
      if (!cell) continue;
      const t = s.tiles[idx(cell.col, cell.row)]!;
      if (t.state !== 0) continue;
      t.crack += ctx.dt * 1000;
      if (t.crack >= CRACK_MS) condemn(idx(cell.col, cell.row));
    }

    // 2. Cracked tiles fall on their own clock.
    for (let i = 0; i < s.tiles.length; i++) {
      const t = s.tiles[i]!;
      if (t.state === 1 && s.elapsed >= t.fallAt) {
        t.state = 2;
        s.changed.push(i);
      }
    }

    // 3. Shrink (R4, P2). The ring schedule alone clears the grid well inside
    //    maxDurationMs, so the no-input termination property holds by construction.
    while (s.elapsed >= s.nextShrinkAt && s.ring < Math.ceil(GRID / 2)) {
      for (let row = 0; row < GRID; row++) {
        for (let col = 0; col < GRID; col++) {
          if (ringOf(col, row) === s.ring) condemn(idx(col, row));
        }
      }
      s.ring++;
      s.nextShrinkAt += SHRINK_INTERVAL_MS;
    }

    // 4. Move, and 5. fall. Ground is present only where a tile is not gone — which
    //    is the whole elimination mechanism, expressed as an absence (P3).
    const groundAt = (p: Vec2): number | null => {
      const cell = cellAt(p);
      if (!cell) return null;
      return s.tiles[idx(cell.col, cell.row)]!.state === 2 ? null : 0;
    };

    for (const p of ctx.players) {
      if (!p.alive) continue;
      const input = ctx.input(p.slot);
      stepMovement(p.body, { axis: input.axis, jump: false }, ctx.dt, [], groundAt);
      if (input.axis.x !== 0 || input.axis.z !== 0) {
        p.facing = Math.atan2(input.axis.x, input.axis.z);
      }
      if (p.body.y <= KILL_Y) {
        p.alive = false;
        s.eliminated.add(p.slot);
        s.elimAt.set(p.slot, s.elapsed);
        s.placement.push(p.slot);
      }
    }
  },

  isOver(s: FallingFloorState, ctx: TickCtx): boolean {
    const alive = ctx.players.filter((p) => p.alive);
    return alive.length <= 1;
  },

  /**
   * Placement scoring, through the shared `awardByRank` (RD-015).
   *
   * The key is elimination time — later is better — with survivors taking Infinity so
   * they rank above everyone who went out. Players eliminated on the same tick share
   * an elimination time and therefore a rank, which is the tie behaviour the round
   * wants and which used to be hand-rolled here.
   */
  scores(s: FallingFloorState): Record<number, number> {
    return awardByRank(s.roster, (slot) =>
      s.elimAt.has(slot) ? s.elimAt.get(slot)! : Number.POSITIVE_INFINITY,
    );
  },

  snapshot(s: FallingFloorState): MinigameSnapshot {
    // Tiles change rarely, so send the full array once and deltas thereafter (P5).
    if (!s.firstSnapshotSent) {
      s.firstSnapshotSent = true;
      return { full: s.tiles.map((t) => t.state), grid: GRID, tile: TILE };
    }
    return { changed: s.changed.map((i) => [i, s.tiles[i]!.state] as const) };
  },

  /**
   * Someone just started watching: send the whole grid again (RD-052).
   *
   * The delta channel assumes every client has the base frame, and a mid-round joiner
   * does not. Everyone gets one full frame — 121 numbers, once — which is far cheaper
   * than a protocol that tracks who has seen what.
   */
  resync(s: FallingFloorState): void {
    s.firstSnapshotSent = false;
  },

  arena(): ArenaDescriptor {
    // A high three-quarter view that fits the whole 22 m grid with no occlusion.
    // Fixed, and with no field a client could use to move it (RD-005).
    return {
      camera: {
        eye: [0, 26, 21],
        look: [0, 0, 0],
        fov: 45,
        // Half the grid's width. Declared from the constants rather than from
        // `statics`, because the tiles are not in `statics` at all — they arrive via
        // `setTiles` (arena-framing R2).
        extent: (GRID * TILE) / 2,
      },
      solids: [],
      statics: [],
      sky: "#cfe4f2",
    };
  },
};

