/**
 * Hot Potato — "Pass the bomb before it goes off."
 *
 * The second minigame, chosen to exercise everything Falling Floor left untouched:
 * `stick+button` input, a walled arena (`solids`), player-to-player contact, and a
 * dynamic visual. It needs **no client code** — the bomb rides the generic `prims`
 * channel (RD-009) — which is the property that makes minigame #3 cheap.
 */
import {
  type ArenaDescriptor,
  type InitCtx,
  type Minigame,
  type MinigameSnapshot,
  type Prim,
  type Solid,
  type TickCtx,
  type Vec2,
  dist,
  minThicknessFor,
  stepMovement,
  vec,
} from "@ruckus/shared";

export const ARENA = 18;
export const WALL = 1.0;
export const FUSE_START_MS = 9000;
export const FUSE_STEP_MS = 1000;
export const FUSE_MIN_MS = 4000;
export const PASS_LOCK_MS = 600;
export const CONTACT = 0.8; // 2 * PLAYER_RADIUS
export const DASH_MS = 220;
export const DASH_SPEED_MUL = 2.1;
export const DASH_COOLDOWN_MS = 1400;
export const MAX_DURATION_MS = 90_000;

const HALF = ARENA / 2;

/**
 * The arena's walls must clear the tunnelling budget for the DASHING speed, not the
 * base one — `minThicknessFor` exists because a single global constant would have
 * hidden exactly this (see move.ts). Asserted at module load so a future retune of
 * DASH_SPEED_MUL cannot quietly make the walls permeable.
 */
if (WALL < minThicknessFor(DASH_SPEED_MUL)) {
  throw new Error(
    `hot-potato walls are ${WALL}m but dashing at ${DASH_SPEED_MUL}x needs ` +
      `${minThicknessFor(DASH_SPEED_MUL).toFixed(3)}m to be un-tunnellable`,
  );
}

/** Four walls just outside the play area, thick enough to be uncrossable. */
export const WALLS: Solid[] = [
  { min: vec(-HALF - WALL, -HALF - WALL), max: vec(HALF + WALL, -HALF) }, // back
  { min: vec(-HALF - WALL, HALF), max: vec(HALF + WALL, HALF + WALL) }, // front
  { min: vec(-HALF - WALL, -HALF - WALL), max: vec(-HALF, HALF + WALL) }, // left
  { min: vec(HALF, -HALF - WALL), max: vec(HALF + WALL, HALF + WALL) }, // right
];

export interface HotPotatoState {
  holder: number;
  fuseMs: number;
  fuseLength: number;
  /**
   * Elapsed ms until the bomb may move again (P1).
   *
   * ONE gate, not two. The design originally called for a symmetric lock — the new
   * holder cannot pass, *and* the previous holder cannot receive — but implementing
   * it showed the second half is unreachable: the first already blocks every pass for
   * the whole window, so "the previous holder may not receive" can only ever be
   * evaluated when nobody may receive anyway (RD-010).
   */
  lockUntil: number;
  dashUntil: Map<number, number>;
  dashReadyAt: Map<number, number>;
  prevBtn: Set<number>;
  alive: Set<number>;
  roster: number[];
  placement: number[];
  elimAt: Map<number, number>;
  elapsed: number;
  /** Explosions so far, for the snapshot and the tests. */
  blasts: number;
  /**
   * The holder's position, cached each tick.
   *
   * `snapshot(state)` deliberately receives no `TickCtx`, so the state has to carry
   * everything the wire needs. That constraint is a feature: it keeps the snapshot a
   * pure projection of state, which is what makes the determinism test meaningful.
   */
  holderPos: Vec2 | null;
}

const livingSlots = (s: HotPotatoState): number[] =>
  s.roster.filter((slot) => s.alive.has(slot));

/** Nearest living player to `from`, excluding `from`. Ties break on slot, so seeded. */
function nearestLiving(
  s: HotPotatoState,
  ctx: TickCtx,
  from: number,
  exclude: Set<number> = new Set(),
): number | null {
  const origin = ctx.players.find((p) => p.slot === from);
  let best: number | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const p of ctx.players) {
    if (p.slot === from || !s.alive.has(p.slot) || exclude.has(p.slot)) continue;
    const d = origin ? dist(origin.body.pos, p.body.pos) : 0;
    if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && (best === null || p.slot < best))) {
      best = p.slot;
      bestD = d;
    }
  }
  return best;
}

export const hotPotato: Minigame<HotPotatoState> = {
  id: "hot-potato",
  displayName: "Hot Potato",
  rule: "Pass the bomb before it goes off.",
  input: "stick+button",
  maxDurationMs: MAX_DURATION_MS,

  init(ctx: InitCtx): HotPotatoState {
    // Spread players around a ring so nobody starts in contact — an instant pass on
    // tick one would read as a bug even though it is legal.
    const n = Math.max(1, ctx.players.length);
    const radius = Math.min(HALF - 2, 2 + n * 0.6);
    const spin = ctx.rng.next() * Math.PI * 2;
    ctx.players.forEach((p, i) => {
      const a = spin + (i / n) * Math.PI * 2;
      p.body.pos = vec(Math.cos(a) * radius, Math.sin(a) * radius);
      p.body.vel = vec();
      p.body.y = 0;
      p.body.vy = 0;
      p.body.grounded = true;
      p.alive = true;
      p.facing = a + Math.PI;
    });

    const roster = ctx.players.map((p) => p.slot);
    const holder = roster.length ? roster[ctx.rng.int(roster.length)]! : -1;

    return {
      holder,
      fuseMs: FUSE_START_MS,
      fuseLength: FUSE_START_MS,
      lockUntil: 0,
      dashUntil: new Map(),
      dashReadyAt: new Map(),
      prevBtn: new Set(),
      alive: new Set(roster),
      roster,
      placement: [],
      elimAt: new Map(),
      elapsed: 0,
      blasts: 0,
      holderPos: null,
    };
  },

  tick(s: HotPotatoState, ctx: TickCtx): void {
    s.elapsed = ctx.elapsed;

    // 1. Dash edges (R4, P2). Edge-triggered, so holding the button is one dash.
    for (const p of ctx.players) {
      if (!s.alive.has(p.slot)) continue;
      const held = ctx.input(p.slot).btn;
      const wasHeld = s.prevBtn.has(p.slot);
      if (held && !wasHeld && s.elapsed >= (s.dashReadyAt.get(p.slot) ?? 0)) {
        s.dashUntil.set(p.slot, s.elapsed + DASH_MS);
        s.dashReadyAt.set(p.slot, s.elapsed + DASH_COOLDOWN_MS);
      }
      if (held) s.prevBtn.add(p.slot);
      else s.prevBtn.delete(p.slot);
    }

    // 2. Move. The floor is solid everywhere; there is nothing to fall through.
    const ground = (): number => 0;
    for (const p of ctx.players) {
      if (!s.alive.has(p.slot)) continue;
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

    // 3. Passing (R1, R2, P1). Only the NEAREST eligible toucher takes it, so a
    //    three-way pile-up resolves by geometry rather than by array order.
    if (s.elapsed >= s.lockUntil && s.alive.size > 1) {
      const holderBody = ctx.players.find((p) => p.slot === s.holder)?.body;
      if (holderBody) {
        let taker: number | null = null;
        let takerD = Number.POSITIVE_INFINITY;
        for (const p of ctx.players) {
          if (p.slot === s.holder || !s.alive.has(p.slot)) continue;
          const d = dist(holderBody.pos, p.body.pos);
          if (d > CONTACT) continue;
          if (d < takerD - 1e-9 || (Math.abs(d - takerD) <= 1e-9 && (taker === null || p.slot < taker))) {
            taker = p.slot;
            takerD = d;
          }
        }
        if (taker !== null) {
          s.holder = taker;
          s.lockUntil = s.elapsed + PASS_LOCK_MS;
        }
      }
    }

    // 4. Fuse (R3). An expiry always removes exactly one player, which is what
    //    bounds the round (P3) — including when everyone has disconnected (I8).
    s.fuseMs -= ctx.dt * 1000;
    if (s.fuseMs <= 0 && s.alive.size > 1) {
      const victim = s.holder;
      const next = nearestLiving(s, ctx, victim);

      s.alive.delete(victim);
      s.placement.push(victim);
      s.elimAt.set(victim, s.elapsed);
      const vp = ctx.players.find((p) => p.slot === victim);
      if (vp) vp.alive = false;

      s.blasts += 1;
      s.fuseLength = Math.max(FUSE_MIN_MS, s.fuseLength - FUSE_STEP_MS);
      s.fuseMs = s.fuseLength;
      s.lockUntil = s.elapsed + PASS_LOCK_MS;
      s.holder = next ?? livingSlots(s)[0] ?? -1;
    }

    // 5. Cache what the snapshot needs, since it does not get a ctx.
    const hp = ctx.players.find((p) => p.slot === s.holder);
    s.holderPos = hp ? { x: hp.body.pos.x, z: hp.body.pos.z } : null;
  },

  isOver(s: HotPotatoState): boolean {
    return s.alive.size <= 1;
  },

  /** Placement scoring, identical in shape to falling-floor's (RD-006). */
  scores(s: HotPotatoState): Record<number, number> {
    const survivors = s.roster.filter((slot) => s.alive.has(slot));
    const fallen = [...s.placement].reverse();

    const groups: number[][] = [];
    if (survivors.length) groups.push(survivors);
    for (const slot of fallen) {
      const at = s.elimAt.get(slot)!;
      const last = groups[groups.length - 1];
      const lastAt = last && s.elimAt.has(last[0]!) ? s.elimAt.get(last[0]!) : undefined;
      if (last && lastAt === at) last.push(slot);
      else groups.push([slot]);
    }

    const points = [3, 2, 1];
    const out: Record<number, number> = {};
    let rank = 0;
    for (const group of groups) {
      const award = points[rank] ?? 0;
      for (const slot of group) out[slot] = award;
      rank += group.length;
    }
    for (const slot of s.roster) out[slot] ??= 0;
    return out;
  },

  /**
   * The bomb, as one primitive on the generic channel (R8). Its colour ramps toward
   * the hazard red and it pulses faster as the fuse shortens — the entire tension
   * read, procedural, no asset.
   */
  snapshot(s: HotPotatoState): MinigameSnapshot {
    const t = Math.max(0, Math.min(1, 1 - s.fuseMs / s.fuseLength)); // 0 fresh, 1 out
    const pulse = 1 + Math.sin((s.elapsed / 1000) * (4 + t * 18)) * 0.12 * (0.4 + t);
    const prims: Prim[] = [];
    if (s.holderPos) {
      prims.push({
        k: "sphere",
        pos: [s.holderPos.x, 2.15, s.holderPos.z],
        r: 0.3 * pulse,
        colour: rampToHazard(t),
      });
    }
    return { holder: s.holder, fuse: Math.max(0, s.fuseMs), fuseLength: s.fuseLength, blasts: s.blasts, prims };
  },

  arena(): ArenaDescriptor {
    const statics: Prim[] = [
      { k: "box", pos: [0, -0.25, 0], size: [ARENA, 0.5, ARENA], colour: "#3b4152" },
    ];
    for (const w of WALLS) {
      statics.push({
        k: "box",
        pos: [(w.min.x + w.max.x) / 2, 0.6, (w.min.z + w.max.z) / 2],
        size: [w.max.x - w.min.x, 1.2, w.max.z - w.min.z],
        colour: "#2a2f3c",
      });
    }
    return {
      camera: { eye: [0, 24, 20], look: [0, 0, 0], fov: 45 },
      solids: WALLS,
      statics,
      sky: "#0e1014",
    };
  },
};

/** Pickup yellow to hazard red, as the fuse burns down. */
function rampToHazard(t: number): string {
  const lerp = (a: number, b: number): number => Math.round(a + (b - a) * t);
  const r = lerp(0xff, 0xe6);
  const g = lerp(0xef, 0x48);
  const b = lerp(0x14, 0x4d);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
