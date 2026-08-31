/**
 * Scramble — "Grab the most before time runs out."
 *
 * The fourth minigame, and the first that nobody loses. The other three all knock
 * players out and score by placement in the elimination order; this one runs a fixed
 * clock, never marks anyone dead, and scores by a quantity players accumulate.
 *
 * That makes it the friendliest round in the set and a deliberate change of pace — and
 * it is the round that proved the shared scoring helper had to take a key function
 * rather than a placement array (RD-015).
 */
import {
  PLAYER_RADIUS,
  type ArenaDescriptor,
  type InitCtx,
  type Minigame,
  type MinigameSnapshot,
  type Prim,
  type Rng,
  type Solid,
  type TickCtx,
  type Vec2,
  awardByRank,
  dist,
  minThicknessFor,
  stepMovement,
  vec,
} from "@ruckus/shared";

export const ARENA = 22;
export const WALL = 1.0;
export const ROUND_MS = 45_000;
export const MAX_DURATION_MS = 50_000;

export const PICKUP_RADIUS = 0.45;
export const START_PICKUPS = 6;
export const MAX_PICKUPS = 14;
export const SPAWN_INTERVAL_MS = 600;
export const MIN_SPAWN_GAP = 2.0;
/** Bounded so a crowded arena can never spin the tick looking for a free spot. */
export const SPAWN_TRIES = 12;

export const SHOVE_SPEED = 7.0;

/**
 * Identical to hot-potato's, deliberately re-stated rather than re-tuned: a dash that
 * feels different in each minigame is a worse game, not a richer one.
 */
export const DASH_MS = 220;
export const DASH_SPEED_MUL = 2.1;
export const DASH_COOLDOWN_MS = 1400;

const HALF = ARENA / 2;

/** Dashing is the fastest anything moves here, so the walls are sized for that. */
if (WALL < minThicknessFor(DASH_SPEED_MUL)) {
  throw new Error(
    `scramble walls are ${WALL}m but dashing at ${DASH_SPEED_MUL}x needs ` +
      `${minThicknessFor(DASH_SPEED_MUL).toFixed(3)}m`,
  );
}

export const WALLS: Solid[] = [
  { min: vec(-HALF - WALL, -HALF - WALL), max: vec(HALF + WALL, -HALF) },
  { min: vec(-HALF - WALL, HALF), max: vec(HALF + WALL, HALF + WALL) },
  { min: vec(-HALF - WALL, -HALF - WALL), max: vec(-HALF, HALF + WALL) },
  { min: vec(HALF, -HALF - WALL), max: vec(HALF + WALL, HALF + WALL) },
];

export interface Pickup {
  id: number;
  pos: Vec2;
  /** Seeded bob phase, so a still frame does not look like a frozen game. */
  phase: number;
}

export interface ScrambleState {
  pickups: Pickup[];
  nextId: number;
  nextSpawnAt: number;
  counts: Map<number, number>;
  dashUntil: Map<number, number>;
  dashReadyAt: Map<number, number>;
  prevBtn: Set<number>;
  roster: number[];
  elapsed: number;
}

/** A spawn point clear of the walls and of every existing pickup, or null if crowded. */
function findSpawn(rng: Rng, pickups: readonly Pickup[]): Vec2 | null {
  const inset = HALF - PICKUP_RADIUS - 0.5;
  for (let i = 0; i < SPAWN_TRIES; i++) {
    const p = vec(rng.range(-inset, inset), rng.range(-inset, inset));
    if (pickups.every((q) => dist(p, q.pos) >= MIN_SPAWN_GAP)) return p;
  }
  return null; // the arena is busy; try again next interval rather than looping
}

function spawn(s: ScrambleState, rng: Rng): void {
  const pos = findSpawn(rng, s.pickups);
  if (!pos) return;
  s.pickups.push({ id: s.nextId++, pos, phase: rng.range(0, Math.PI * 2) });
}

export const scramble: Minigame<ScrambleState> = {
  id: "scramble",
  displayName: "Scramble",
  rule: "Grab the most before time runs out.",
  input: "stick+button",
  maxDurationMs: MAX_DURATION_MS,

  init(ctx: InitCtx): ScrambleState {
    const n = Math.max(1, ctx.players.length);
    const radius = HALF * 0.5;
    const spin = ctx.rng.next() * Math.PI * 2;
    ctx.players.forEach((p, i) => {
      const a = spin + (i / n) * Math.PI * 2;
      p.body.pos = vec(Math.cos(a) * radius, Math.sin(a) * radius);
      p.body.vel = vec();
      p.body.y = 0;
      p.body.vy = 0;
      p.body.grounded = true;
      // Nobody is ever eliminated in this round (R5).
      p.alive = true;
      p.facing = a + Math.PI;
    });

    const state: ScrambleState = {
      pickups: [],
      nextId: 0,
      nextSpawnAt: SPAWN_INTERVAL_MS,
      counts: new Map(ctx.players.map((p) => [p.slot, 0])),
      dashUntil: new Map(),
      dashReadyAt: new Map(),
      prevBtn: new Set(),
      roster: ctx.players.map((p) => p.slot),
      elapsed: 0,
    };
    // The floor is never empty at the whistle.
    for (let i = 0; i < START_PICKUPS; i++) spawn(state, ctx.rng);
    return state;
  },

  tick(s: ScrambleState, ctx: TickCtx): void {
    s.elapsed = ctx.elapsed;

    // 1. Dash edges (P1), identical to hot-potato's.
    for (const p of ctx.players) {
      const held = ctx.input(p.slot).btn;
      const wasHeld = s.prevBtn.has(p.slot);
      if (held && !wasHeld && s.elapsed >= (s.dashReadyAt.get(p.slot) ?? 0)) {
        s.dashUntil.set(p.slot, s.elapsed + DASH_MS);
        s.dashReadyAt.set(p.slot, s.elapsed + DASH_COOLDOWN_MS);
      }
      if (held) s.prevBtn.add(p.slot);
      else s.prevBtn.delete(p.slot);
    }

    // 2. Move.
    const ground = (): number => 0;
    for (const p of ctx.players) {
      const input = ctx.input(p.slot);
      const dashing = s.elapsed < (s.dashUntil.get(p.slot) ?? 0);
      stepMovement(
        p.body,
        { axis: input.axis, jump: false },
        ctx.dt,
        WALLS,
        ground,
        0,
        dashing ? DASH_SPEED_MUL : 1,
      );
      if (input.axis.x !== 0 || input.axis.z !== 0) {
        p.facing = Math.atan2(input.axis.x, input.axis.z);
      }
    }

    // 3. Shove (P2). A dashing player displaces anyone they run into. Velocity only —
    //    no count is ever decremented, so there is no way to lose a banked point.
    for (const shover of ctx.players) {
      if (s.elapsed >= (s.dashUntil.get(shover.slot) ?? 0)) continue;
      const speed = Math.hypot(shover.body.vel.x, shover.body.vel.z);
      if (speed < 0.1) continue;
      const dir = { x: shover.body.vel.x / speed, z: shover.body.vel.z / speed };
      for (const target of ctx.players) {
        if (target.slot === shover.slot) continue;
        if (dist(shover.body.pos, target.body.pos) > PLAYER_RADIUS * 2) continue;
        target.body.vel = {
          x: dir.x * SHOVE_SPEED,
          z: dir.z * SHOVE_SPEED,
        };
      }
    }

    // 4. Spawn (R2). Draws from ctx.rng during tick — only correct since RD-013 gave
    //    the round one RNG stream instead of reseeding it every tick.
    while (s.elapsed >= s.nextSpawnAt) {
      if (s.pickups.length < MAX_PICKUPS) spawn(s, ctx.rng);
      s.nextSpawnAt += SPAWN_INTERVAL_MS;
    }

    // 5. Collect (P3). The NEAREST claimant takes it, ties break on slot, and the
    //    pickup is removed in the same pass so it can never be counted twice.
    const grab = PICKUP_RADIUS + PLAYER_RADIUS;
    s.pickups = s.pickups.filter((pickup) => {
      let taker: number | null = null;
      let bestD = Number.POSITIVE_INFINITY;
      for (const p of ctx.players) {
        const d = dist(p.body.pos, pickup.pos);
        if (d > grab) continue;
        if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && (taker === null || p.slot < taker))) {
          taker = p.slot;
          bestD = d;
        }
      }
      if (taker === null) return true;
      s.counts.set(taker, (s.counts.get(taker) ?? 0) + 1);
      return false;
    });
  },

  /** P4: a clock, not a body count. It does not consult the players at all. */
  isOver(s: ScrambleState): boolean {
    return s.elapsed >= ROUND_MS;
  },

  /**
   * Ranked by what each player collected (RD-015).
   *
   * Only players who actually collected something are ranked; everyone else takes
   * zero. Passing the whole roster would make five players who collected nothing tie
   * for second and take two points each — correct competition ranking, wrong round.
   */
  scores(s: ScrambleState): Record<number, number> {
    const scorers = s.roster.filter((slot) => (s.counts.get(slot) ?? 0) > 0);
    const zeros = Object.fromEntries(s.roster.map((slot) => [slot, 0]));
    return { ...zeros, ...awardByRank(scorers, (slot) => s.counts.get(slot) ?? 0) };
  },

  snapshot(s: ScrambleState): MinigameSnapshot {
    const prims: Prim[] = s.pickups.map((p) => ({
      k: "sphere" as const,
      pos: [
        p.pos.x,
        0.55 + Math.sin(s.elapsed / 260 + p.phase) * 0.12,
        p.pos.z,
      ] as [number, number, number],
      r: PICKUP_RADIUS,
      colour: "#ffd23f",
    }));
    return {
      counts: Object.fromEntries(s.counts),
      remaining: Math.max(0, ROUND_MS - s.elapsed),
      prims,
    };
  },

  arena(): ArenaDescriptor {
    const statics: Prim[] = [
      { k: "box", pos: [0, -0.25, 0], size: [ARENA, 0.5, ARENA], colour: "#f2e9d6" },
    ];
    for (const w of WALLS) {
      statics.push({
        k: "box",
        pos: [(w.min.x + w.max.x) / 2, 0.6, (w.min.z + w.max.z) / 2],
        size: [w.max.x - w.min.x, 1.2, w.max.z - w.min.z],
        colour: "#d9caa9",
      });
    }
    return {
      camera: {
        eye: [0, 28, 23],
        look: [0, 0, 0],
        fov: 45,
        /** The outer wall corner — the walls are part of the picture, not just collision. */
        extent: (ARENA / 2 + WALL) * Math.SQRT2,
      },
      solids: WALLS,
      statics,
      sky: "#cfe4f2",
    };
  },
};
