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
  type WireActions,
  ACTION_VERBS,
  dist,
  minThicknessFor,
  stepMovement,
  vec,
  PLAYER_RADIUS,
  awardByRank,
} from "@ruckus/shared";

export const ARENA = 18;
export const WALL = 1.0;
export const FUSE_START_MS = 9000;
export const FUSE_STEP_MS = 1000;
export const FUSE_MIN_MS = 4000;
export const PASS_LOCK_MS = 600;
/**
 * How close counts as touching, for the pass.
 *
 * Deliberately a little more than `2 * PLAYER_RADIUS`. Player collision now holds two
 * bodies at *exactly* two radii, so an equality comparison would decide the round's
 * central mechanic on the last bit of a square root — resting against someone would
 * pass the bomb or not depending on floating-point noise. The tolerance means "resting
 * against them" reliably counts as touching, which is what the rule means (RD-040).
 */
export const CONTACT = PLAYER_RADIUS * 2 + 0.06;
export const TUMBLE_MS = 220;
export const TUMBLE_SPEED_MUL = 2.1;
export const TUMBLE_COOLDOWN_MS = 1400;

/**
 * The throw (action-button T4, R3).
 *
 * The holder's button throws the bomb along their facing instead of tumbling: one
 * button, two meanings by role (non-negotiable 2). A thrown bomb always ends with a
 * holder — caught by the first living player it reaches, and otherwise taken by the
 * nearest when it lands — because a bomb nobody can reach is not a fuse anyone can
 * beat, and a round that waits on one would never end (I8).
 */
export const THROW_SPEED = 14;
export const THROW_MS = 700;
/** How close the flying bomb must pass to a player to be caught. */
export const CATCH_RADIUS = PLAYER_RADIUS + 0.35;
export const MAX_DURATION_MS = 90_000;

const HALF = ARENA / 2;

/**
 * The arena's walls must clear the tunnelling budget for the TUMBLING speed, not the
 * base one — `minThicknessFor` exists because a single global constant would have
 * hidden exactly this (see move.ts). Asserted at module load so a future retune of
 * TUMBLE_SPEED_MUL cannot quietly make the walls permeable.
 */
if (WALL < minThicknessFor(TUMBLE_SPEED_MUL)) {
  throw new Error(
    `hot-potato walls are ${WALL}m but tumbling at ${TUMBLE_SPEED_MUL}x needs ` +
      `${minThicknessFor(TUMBLE_SPEED_MUL).toFixed(3)}m to be un-tunnellable`,
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
  tumbleUntil: Map<number, number>;
  tumbleReadyAt: Map<number, number>;
  prevBtn: Set<number>;
  /** The bomb in flight, or null when someone is holding it. */
  flight: { pos: Vec2; dir: Vec2; endsAt: number; from: number } | null;
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
  buttonLabel: "TUMBLE",
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
      tumbleUntil: new Map(),
      tumbleReadyAt: new Map(),
      flight: null,
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

    // 1. The button, which means different things to different people (R3).
    //
    // The holder throws; everyone else tumbles. One button, two verbs by role, so the
    // input budget is unchanged (non-negotiable 2). Edge-triggered either way, so
    // holding it is one action rather than a stream of them.
    for (const p of ctx.players) {
      if (!s.alive.has(p.slot)) continue;
      const held = ctx.input(p.slot).btn;
      const wasHeld = s.prevBtn.has(p.slot);
      const pressed = held && !wasHeld;

      if (pressed && p.slot === s.holder && s.flight === null && s.elapsed >= s.lockUntil) {
        // Throw along the facing. The bomb leaves the hand, so there is no holder
        // until it is caught or it lands.
        s.flight = {
          pos: vec(p.body.pos.x, p.body.pos.z),
          dir: vec(Math.sin(p.facing), Math.cos(p.facing)),
          endsAt: s.elapsed + THROW_MS,
          from: p.slot,
        };
      } else if (pressed && s.elapsed >= (s.tumbleReadyAt.get(p.slot) ?? 0)) {
        s.tumbleUntil.set(p.slot, s.elapsed + TUMBLE_MS);
        s.tumbleReadyAt.set(p.slot, s.elapsed + TUMBLE_COOLDOWN_MS);
      }

      if (held) s.prevBtn.add(p.slot);
      else s.prevBtn.delete(p.slot);
    }

    // 2. Move. The floor is solid everywhere; there is nothing to fall through.
    const ground = (): number => 0;
    for (const p of ctx.players) {
      if (!s.alive.has(p.slot)) continue;
      const input = ctx.input(p.slot);
      const tumbling = s.elapsed < (s.tumbleUntil.get(p.slot) ?? 0);
      stepMovement(
        p.body,
        { axis: input.axis, jump: false },
        ctx.dt,
        WALLS,
        ground,
        0,
        tumbling ? TUMBLE_SPEED_MUL : 1,
      );
      if (input.axis.x !== 0 || input.axis.z !== 0) {
        p.facing = Math.atan2(input.axis.x, input.axis.z);
      }
    }

    // 2b. The bomb in flight (R3, P3).
    //
    // It always ends with a holder: caught by the nearest living player it passes, and
    // otherwise taken by the nearest when it lands. A bomb that could come to rest
    // unheld would be a fuse nobody can beat, and a round that never ends (I8).
    if (s.flight !== null) {
      const f = s.flight;
      f.pos = vec(
        f.pos.x + f.dir.x * THROW_SPEED * ctx.dt,
        f.pos.z + f.dir.z * THROW_SPEED * ctx.dt,
      );

      const living = ctx.players.filter((p) => s.alive.has(p.slot) && p.slot !== f.from);
      let taker: number | null = null;
      let takerD = Number.POSITIVE_INFINITY;
      for (const p of living) {
        const d = dist(f.pos, p.body.pos);
        if (d <= CATCH_RADIUS && (d < takerD || (d === takerD && p.slot < (taker ?? Infinity)))) {
          taker = p.slot;
          takerD = d;
        }
      }

      const landed = s.elapsed >= f.endsAt;
      if (taker === null && landed) {
        // Nobody was in the way. The nearest living player picks it up — including the
        // thrower, if they are the only one left.
        const pool = living.length > 0 ? living : ctx.players.filter((p) => s.alive.has(p.slot));
        for (const p of pool) {
          const d = dist(f.pos, p.body.pos);
          if (d < takerD || (d === takerD && p.slot < (taker ?? Infinity))) {
            taker = p.slot;
            takerD = d;
          }
        }
      }

      if (taker !== null) {
        s.holder = taker;
        s.lockUntil = s.elapsed + PASS_LOCK_MS;
        s.flight = null;
      }
    }

    // 3. Passing (R1, R2, P1). Only the NEAREST eligible toucher takes it, so a
    //    three-way pile-up resolves by geometry rather than by array order.
    if (s.flight === null && s.elapsed >= s.lockUntil && s.alive.size > 1) {
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
    //
    // A bomb in flight is drawn where it is, not on whoever last held it — otherwise
    // the throw would be invisible and the picture would lie about where the fuse is.
    const hp = ctx.players.find((p) => p.slot === s.holder);
    s.holderPos = s.flight !== null
      ? { x: s.flight.pos.x, z: s.flight.pos.z }
      : hp ? { x: hp.body.pos.x, z: hp.body.pos.z } : null;
  },

  isOver(s: HotPotatoState): boolean {
    return s.alive.size <= 1;
  },

  /**
   * Placement scoring, through the shared `awardByRank` (RD-015).
   *
   * The key is elimination time — later is better — with survivors taking Infinity so
   * they rank above everyone who went out. Players eliminated on the same tick share
   * an elimination time and therefore a rank, which is the tie behaviour the round
   * wants and which used to be hand-rolled in three places.
   */
  scores(s: HotPotatoState): Record<number, number> {
    return awardByRank(s.roster, (slot) =>
      s.elimAt.has(slot) ? s.elimAt.get(slot)! : Number.POSITIVE_INFINITY,
    );
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
    // What each player's button does right now (action-button R4). The holder throws
    // and everyone else tumbles, so this genuinely differs per player.
    const actions: WireActions = {};
    for (const slot of s.roster) {
      if (!s.alive.has(slot)) continue;
      if (slot === s.holder && s.flight === null) {
        actions[slot] = { v: ACTION_VERBS.indexOf("pass") };
      } else {
        const readyIn = Math.max(0, ((s.tumbleReadyAt.get(slot) ?? 0) - s.elapsed) / 1000);
        actions[slot] = readyIn > 0
          ? { v: ACTION_VERBS.indexOf("tumble"), r: Math.round(readyIn * 10) / 10 }
          : { v: ACTION_VERBS.indexOf("tumble") };
      }
    }
    return {
      holder: s.holder, fuse: Math.max(0, s.fuseMs), fuseLength: s.fuseLength,
      blasts: s.blasts, prims, actions,
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
        eye: [0, 24, 20],
        look: [0, 0, 0],
        fov: 45,
        /** Out to the outer wall — the walls are part of the picture, not just collision. */
        extent: ARENA / 2 + WALL,
      },
      solids: WALLS,
      statics,
      sky: "#cfe4f2",
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
