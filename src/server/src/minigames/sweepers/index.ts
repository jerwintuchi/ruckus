/**
 * Sweepers — "Jump the sweepers."
 *
 * The third minigame, and the first to use the **jump**. `stepMovement` has carried a
 * `jumpSpeed` parameter since the shell shipped and every minigame until now passed
 * `jump: false` — an untested path in the most-used function in the game.
 *
 * Like Hot Potato it needs no client code: the bars ride the generic `prims` channel
 * (RD-009), which is the claim that channel was added to make good on.
 */
import {
  JUMP_SPEED,
  PLAYER_RADIUS,
  type ArenaDescriptor,
  type InitCtx,
  type Minigame,
  type MinigameSnapshot,
  type Prim,
  type Solid,
  type TickCtx,
  type Vec2,
  TICK_DT,
  distPointSegment,
  makeBody,
  minThicknessFor,
  stepMovement,
  vec,
  awardByRank,
  ACTION_VERBS,
  type WireActions,
} from "@ruckus/shared";

export const ARENA = 20;
export const WALL = 0.5;
export const BAR_HALF_WIDTH = 0.2;
export const BAR_HEIGHT = 1.1;
export const BARS_START = 1;
export const BARS_MAX = 4;
export const RAMP_MS = 10_000;
/**
 * Angular speeds, tuned by measurement against the jumpability invariant (RD-014).
 *
 * The counterintuitive part: **a slower bar is harder, not easier.** A bar sweeps past
 * you in `2*(BAR_HALF_WIDTH + PLAYER_RADIUS) / (omega * r)` seconds, and you can only
 * be above it for the clearance window of a jump. Slow it down and the passage
 * outlasts the jump, so the bar becomes literally unavoidable.
 *
 * The first pass (0.5–1.25) was unoutrunnable at the rim; the correction to 0.25–0.6
 * made 8 of 10 sampled radius/speed pairs UNJUMPABLE, which is worse. The fix is a
 * NARROWER bar rather than a lower one: dropping BAR_HEIGHT to 0.9 also restored
 * jumpability, but it left a button-masher airborne 62% of the time instead of 46%,
 * which trades away the timing skill the minigame is made of.
 *
 * The result is a real gradient rather than one answer everywhere. Out at the rim a
 * bar cannot be outrun and must be jumped, and can be. Near the pivot it cannot be
 * jumped at all — but it is crawling there, so walking aside is easy. Two strategies,
 * chosen by where you stand.
 */
export const SPEED_MIN = 0.5;
export const SPEED_MAX = 0.9;

/**
 * A bar does not kill until it is armed.
 *
 * Two unfairnesses this removes, both found by measuring round length (RD-014): a
 * player could spawn already inside a bar and die in 0.1 s, and a bar added by the
 * ramp could appear on top of someone with no warning. An unarmed bar is drawn dimmed,
 * so "this one is about to matter" is readable rather than something you learn by
 * dying to it.
 */
export const GRACE_MS = 1500;
export const ARM_MS = 1500;
export const MAX_DURATION_MS = 75_000;

const HALF = ARENA / 2;
/** Reaches every corner, so there is no unswept spot to camp (R2, P3). */
export const BAR_LENGTH = Math.hypot(HALF, HALF);
export const CENTRE: Vec2 = { x: 0, z: 0 };

/** Nothing here boosts, so the base-speed floor is the right budget. */
if (WALL < minThicknessFor(1)) {
  throw new Error(`sweepers walls are ${WALL}m, under the ${minThicknessFor(1)}m floor`);
}

export const WALLS: Solid[] = [
  { min: vec(-HALF - WALL, -HALF - WALL), max: vec(HALF + WALL, -HALF) },
  { min: vec(-HALF - WALL, HALF), max: vec(HALF + WALL, HALF + WALL) },
  { min: vec(-HALF - WALL, -HALF - WALL), max: vec(-HALF, HALF + WALL) },
  { min: vec(HALF, -HALF - WALL), max: vec(HALF + WALL, HALF + WALL) },
];

export interface Bar {
  angle: number;
  /** Radians per second. Signed: the sign is the direction of sweep. */
  speed: number;
  /** Elapsed ms at which this bar becomes lethal. Before it, it is a warning. */
  armedAt: number;
}

export interface SweepersState {
  bars: Bar[];
  nextBarAt: number;
  alive: Set<number>;
  roster: number[];
  placement: number[];
  elimAt: Map<number, number>;
  elapsed: number;
}

/** The outer tip of a bar. The inner end is always the centre, so nothing can camp it. */
export function barTip(bar: Bar): Vec2 {
  return { x: Math.cos(bar.angle) * BAR_LENGTH, z: Math.sin(bar.angle) * BAR_LENGTH };
}

/**
 * Is this body inside a bar right now?
 *
 * P2: the height test reads the same `y` the integrator produced. There is no
 * separate "is jumping" flag that could disagree with the body's actual height —
 * a player is safe exactly when they are physically above the bar.
 */
export function barHits(bar: Bar, pos: Vec2, y: number, elapsed: number): boolean {
  if (elapsed < bar.armedAt) return false; // still warming up
  if (y >= BAR_HEIGHT) return false;
  return distPointSegment(pos, CENTRE, barTip(bar)) <= BAR_HALF_WIDTH + PLAYER_RADIUS;
}

function makeBar(
  rng: { range(a: number, b: number): number; next(): number },
  armedAt: number,
  angle?: number,
): Bar {
  const speed = rng.range(SPEED_MIN, SPEED_MAX);
  // Mixed directions, so the arena cannot be solved by running one way forever (R3).
  return {
    angle: angle ?? rng.range(0, Math.PI * 2),
    speed: rng.next() < 0.5 ? -speed : speed,
    armedAt,
  };
}

export const sweepers: Minigame<SweepersState> = {
  id: "sweepers",
  displayName: "Sweepers",
  rule: "Jump the sweepers.",
  input: "stick+button",
  buttonLabel: "JUMP",
  jumpSpeed: JUMP_SPEED,
  maxDurationMs: MAX_DURATION_MS,

  init(ctx: InitCtx): SweepersState {
    // Spawn on a ring at mid-radius: the centre is the most dangerous place on the
    // board (every bar passes through it) and the rim is where bars move fastest.
    const n = Math.max(1, ctx.players.length);
    const radius = HALF * 0.55;
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

    // Put the opening bar in the widest gap between spawn points, so nobody starts
    // inside it. With players evenly spaced, that is half a spacing off the ring spin.
    const bars: Bar[] = [];
    for (let i = 0; i < BARS_START; i++) {
      const gapAngle = spin + ((i + 0.5) / n) * Math.PI * 2;
      bars.push(makeBar(ctx.rng, GRACE_MS, gapAngle));
    }

    return {
      bars,
      nextBarAt: RAMP_MS,
      alive: new Set(ctx.players.map((p) => p.slot)),
      roster: ctx.players.map((p) => p.slot),
      placement: [],
      elimAt: new Map(),
      elapsed: 0,
    };
  },

  tick(s: SweepersState, ctx: TickCtx): void {
    s.elapsed = ctx.elapsed;

    // 1. Ramp (R3).
    while (s.elapsed >= s.nextBarAt && s.bars.length < BARS_MAX) {
      s.bars.push(makeBar(ctx.rng, s.elapsed + ARM_MS));
      s.nextBarAt += RAMP_MS;
    }

    // 2. Rotate. P1: the advance depends only on dt and speed, never on frame rate.
    const TAU = Math.PI * 2;
    for (const bar of s.bars) {
      bar.angle = ((bar.angle + bar.speed * ctx.dt) % TAU + TAU) % TAU;
    }

    // 3. Move. The first call site in the game to pass a real jump speed (R4).
    const ground = (): number => 0;
    for (const p of ctx.players) {
      if (!s.alive.has(p.slot)) continue;
      const input = ctx.input(p.slot);
      stepMovement(
        p.body,
        { axis: input.axis, jump: input.btn },
        ctx.dt,
        WALLS,
        ground,
        JUMP_SPEED,
      );
      if (input.axis.x !== 0 || input.axis.z !== 0) {
        p.facing = Math.atan2(input.axis.x, input.axis.z);
      }
    }

    // 4. Sweep. Everyone struck on this tick goes out together, so a same-tick pair
    //    shares a placement rather than being ordered by array position (R6).
    const struck: number[] = [];
    for (const p of ctx.players) {
      if (!s.alive.has(p.slot)) continue;
      if (s.bars.some((bar) => barHits(bar, p.body.pos, p.body.y, s.elapsed))) struck.push(p.slot);
    }
    for (const slot of struck) {
      s.alive.delete(slot);
      s.placement.push(slot);
      s.elimAt.set(slot, s.elapsed);
      const p = ctx.players.find((q) => q.slot === slot);
      if (p) p.alive = false;
    }
  },

  isOver(s: SweepersState): boolean {
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
  scores(s: SweepersState): Record<number, number> {
    return awardByRank(s.roster, (slot) =>
      s.elimAt.has(slot) ? s.elimAt.get(slot)! : Number.POSITIVE_INFINITY,
    );
  },

  /**
   * One rotated box per bar (P4). The prim and the hit-test segment are derived from
   * the same `angle` in the same tick, so what a player sees is what hits them.
   */
  snapshot(s: SweepersState): MinigameSnapshot {
    const prims: Prim[] = s.bars.map((bar) => ({
      k: "box" as const,
      // The box spans centre to tip, so its midpoint sits at half the length.
      pos: [
        (Math.cos(bar.angle) * BAR_LENGTH) / 2,
        BAR_HEIGHT / 2,
        (Math.sin(bar.angle) * BAR_LENGTH) / 2,
      ] as [number, number, number],
      size: [BAR_LENGTH, BAR_HEIGHT, BAR_HALF_WIDTH * 2] as [number, number, number],
      // A dimmed bar is not yet lethal — the warning is visual, not learned by dying.
      colour: s.elapsed < bar.armedAt ? "#6b3138" : "#e6484d",
      rotY: -bar.angle,
    }));
    // Everyone jumps here, always available (action-button R4).
    const actions: WireActions = {};
    for (const p of s.roster) {
      if (s.alive.has(p)) actions[p] = { v: ACTION_VERBS.indexOf("jump") };
    }
    return {
      bars: s.bars.map((b) => ({ angle: b.angle, speed: b.speed, armed: s.elapsed >= b.armedAt })),
      prims,
      actions,
    };
  },

  arena(): ArenaDescriptor {
    const statics: Prim[] = [
      { k: "box", pos: [0, -0.25, 0], size: [ARENA, 0.5, ARENA], colour: "#f2e9d6" },
      // The pivot, so the geometry of the sweep is readable at a glance.
      { k: "cyl", pos: [0, 0.05, 0], r: 0.6, h: 0.1, colour: "#d9caa9" },
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
        eye: [0, 27, 22],
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

/**
 * The jump arc as the game actually flies it (RD-012).
 *
 * Measured by running the real integrator, NOT by the textbook formula. Semi-implicit
 * Euler at 20 Hz undershoots the continuous arc badly: the analytic peak is 1.558 m
 * and the simulated one is 1.335 m, a 17% overstatement. The design of this minigame
 * was sized against the analytic figure and would have been wrong about its own
 * clearance window; the number that matters is the one the players get.
 */
export function jumpArc(): { airborneTicks: number; peak: number; heights: number[] } {
  const b = makeBody(vec());
  const ground = (): number => 0;
  stepMovement(b, { axis: vec(), jump: true }, TICK_DT, [], ground, JUMP_SPEED);
  const heights: number[] = [];
  while (!b.grounded) {
    heights.push(b.y);
    stepMovement(b, { axis: vec(), jump: false }, TICK_DT, [], ground, JUMP_SPEED);
  }
  return { airborneTicks: heights.length, peak: Math.max(...heights), heights };
}

/** How much of the airtime clears a bar of this height. */
export function clearanceTicks(height: number): number {
  return jumpArc().heights.filter((y) => y >= height).length;
}

/** Seconds a player is airborne above `BAR_HEIGHT` during one jump. */
export function clearanceSeconds(): number {
  return clearanceTicks(BAR_HEIGHT) * TICK_DT;
}

/**
 * Seconds a bar takes to sweep across a player standing at radius `r`.
 *
 * The governing quantity of the whole minigame. If this exceeds `clearanceSeconds()`
 * the bar cannot be jumped at that radius — no timing saves you — and the only answer
 * is to move. Near the pivot that is always true and always fine, because the bar is
 * crawling there and walking away is easy; out at the rim it must be false, or the
 * minigame has no verb.
 */
export function passageSeconds(omega: number, r: number): number {
  const band = 2 * (BAR_HALF_WIDTH + PLAYER_RADIUS);
  return band / (Math.abs(omega) * Math.max(r, 1e-6));
}

/**
 * A bar nobody can jump is not a minigame, it is a countdown. Asserted at module load
 * so a retune of JUMP_SPEED, GRAVITY, TICK_HZ or BAR_HEIGHT cannot quietly produce one
 * — the same discipline as hot-potato's wall-thickness check.
 */
{
  const { peak } = jumpArc();
  if (peak <= BAR_HEIGHT + 0.15) {
    throw new Error(
      `sweepers: the simulated jump peaks at ${peak.toFixed(3)}m but BAR_HEIGHT is ` +
        `${BAR_HEIGHT}m — too little margin to be jumpable in practice`,
    );
  }
  // The verb must work where players actually fight for space: the outer arena.
  // Checked against the SLOWEST bar at the rim, the hardest case to jump.
  if (passageSeconds(SPEED_MIN, BAR_LENGTH) >= clearanceSeconds()) {
    throw new Error(
      `sweepers: at the rim the slowest bar takes ` +
        `${passageSeconds(SPEED_MIN, BAR_LENGTH).toFixed(3)}s to pass but a jump only ` +
        `clears for ${clearanceSeconds().toFixed(3)}s — the bar would be unjumpable`,
    );
  }
}
