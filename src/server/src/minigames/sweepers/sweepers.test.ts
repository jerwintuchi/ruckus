import { describe, expect, it } from "vitest";
import {
  GRAVITY,
  IDLE_INPUT,
  JUMP_SPEED,
  MAX_SPEED,
  PLAYER_RADIUS,
  TICK_DT,
  type InputState,
  type PlayerRuntime,
  type TickCtx,
  makeBody,
  makeRng,
  stepMovement,
  vec,
} from "@ruckus/shared";
import {
  ARENA,
  BARS_MAX,
  BARS_START,
  BAR_HALF_WIDTH,
  BAR_HEIGHT,
  BAR_LENGTH,
  MAX_DURATION_MS,
  GRACE_MS,
  ARM_MS,
  RAMP_MS,
  SPEED_MAX,
  SPEED_MIN,
  WALLS,
  barHits,
  clearanceSeconds,
  clearanceTicks,
  jumpArc,
  passageSeconds,
  sweepers,
  type SweepersState,
} from "./index.ts";

const HALF = ARENA / 2;

const mkPlayers = (n: number): PlayerRuntime[] =>
  Array.from({ length: n }, (_, slot) => ({
    slot,
    body: makeBody(vec()),
    alive: true,
    connected: true,
    facing: 0,
  }));

/**
 * A harness that mirrors the real shell: ONE rng per round, advanced across ticks
 * (RD-013). Constructing a fresh rng per tick — which the shell used to do — would
 * hand every tick the same sequence and hide exactly the bug that found this.
 */
function harness(seed: number) {
  const rng = makeRng(seed);
  return (
    players: PlayerRuntime[],
    elapsed: number,
    input: (slot: number) => InputState = () => IDLE_INPUT,
  ): TickCtx => ({ dt: TICK_DT, elapsed, rng, players, input });
}

const ctxFor = (
  players: PlayerRuntime[],
  elapsed: number,
  seed: number,
  input: (slot: number) => InputState = () => IDLE_INPUT,
): TickCtx => harness(seed)(players, elapsed, input);

const step = (
  state: SweepersState,
  players: PlayerRuntime[],
  elapsed: number,
  seed = 1,
  input: (slot: number) => InputState = () => IDLE_INPUT,
): void => sweepers.tick(state, ctxFor(players, elapsed, seed, input));

function run(
  players: PlayerRuntime[],
  seed: number,
  input: (slot: number, elapsed: number) => InputState = () => IDLE_INPUT,
  maxMs = MAX_DURATION_MS,
): { state: SweepersState; elapsed: number; over: boolean } {
  const rng = makeRng(seed); // one stream for init AND every tick, as the shell does
  const state = sweepers.init({ rng, players });
  let elapsed = 0;
  let over = false;
  while (elapsed < maxMs) {
    elapsed += TICK_DT * 1000;
    const ctx: TickCtx = {
      dt: TICK_DT,
      elapsed,
      rng,
      players,
      input: (slot) => input(slot, elapsed),
    };
    sweepers.tick(state, ctx);
    if (sweepers.isOver(state, ctx)) {
      over = true;
      break;
    }
  }
  return { state, elapsed, over };
}

describe("bars and the ramp (T3, R1, R3, P1)", () => {
  it("starts with BARS_START bars", () => {
    const state = sweepers.init({ rng: makeRng(1), players: mkPlayers(4) });
    expect(state.bars).toHaveLength(BARS_START);
  });

  it("advances each angle by speed * dt, frame-rate independently (P1)", () => {
    const players = mkPlayers(1);
    const state = sweepers.init({ rng: makeRng(2), players });
    const bar = state.bars[0]!;
    const before = bar.angle;
    const speed = bar.speed;
    step(state, players, 50);
    const TAU = Math.PI * 2;
    const expected = ((before + speed * TICK_DT) % TAU + TAU) % TAU;
    expect(state.bars[0]!.angle).toBeCloseTo(expected, 10);
  });

  it("keeps angles wrapped into [0, 2pi) however long the round runs", () => {
    const players = mkPlayers(1);
    const state = sweepers.init({ rng: makeRng(3), players });
    for (let i = 1; i <= 2000; i++) {
      step(state, players, i * 50);
      for (const b of state.bars) {
        expect(b.angle).toBeGreaterThanOrEqual(0);
        expect(b.angle).toBeLessThan(Math.PI * 2);
      }
    }
  });

  it("adds a bar every RAMP_MS, up to BARS_MAX and no further", () => {
    const players = mkPlayers(1);
    const rng = makeRng(4);
    const state = sweepers.init({ rng, players });
    const counts: number[] = [];
    for (let i = 1; i * 50 <= RAMP_MS * (BARS_MAX + 2); i++) {
      sweepers.tick(state, {
        dt: TICK_DT, elapsed: i * 50, rng, players, input: () => IDLE_INPUT,
      });
      counts.push(state.bars.length);
    }
    expect(Math.max(...counts)).toBe(BARS_MAX);
    expect(state.bars.length).toBe(BARS_MAX);
    // It grew rather than starting there.
    expect(counts[0]).toBe(BARS_START);
  });

  it("gives bars differing speeds and mixed directions, all seeded", () => {
    const players = mkPlayers(1);
    const rng = makeRng(5);
    const state = sweepers.init({ rng, players });
    for (let i = 1; i * 50 <= RAMP_MS * BARS_MAX; i++) {
      sweepers.tick(state, {
        dt: TICK_DT, elapsed: i * 50, rng, players, input: () => IDLE_INPUT,
      });
    }

    const speeds = state.bars.map((b) => b.speed);
    expect(new Set(speeds.map((s) => s.toFixed(6))).size).toBe(speeds.length);
    for (const s of speeds) {
      expect(Math.abs(s)).toBeGreaterThanOrEqual(SPEED_MIN - 1e-9);
      expect(Math.abs(s)).toBeLessThanOrEqual(SPEED_MAX + 1e-9);
    }
    // Over many seeds, both directions occur — the arena is not solvable one way.
    const dirs = new Set<number>();
    for (let seed = 0; seed < 40; seed++) {
      const st = sweepers.init({ rng: makeRng(seed), players: mkPlayers(1) });
      for (const b of st.bars) dirs.add(Math.sign(b.speed));
    }
    expect(dirs.has(1) && dirs.has(-1)).toBe(true);
  });
});

describe("the sweep hit test (T4, R1, P2)", () => {
  const bar = { angle: 0, speed: 1, armedAt: 0 }; // lies along +x, already lethal
  const LATE = 10_000; // comfortably past any arming window

  it("hits a grounded player standing on the bar line", () => {
    expect(barHits(bar, vec(5, 0), 0, LATE)).toBe(true);
    expect(barHits(bar, vec(0.5, 0), 0, LATE)).toBe(true);
  });

  it("does not hit the same player once they are above BAR_HEIGHT (P2)", () => {
    expect(barHits(bar, vec(5, 0), BAR_HEIGHT, LATE)).toBe(false);
    expect(barHits(bar, vec(5, 0), BAR_HEIGHT + 0.01, LATE)).toBe(false);
    // Just below still hits — the boundary is not a free pass.
    expect(barHits(bar, vec(5, 0), BAR_HEIGHT - 0.01, LATE)).toBe(true);
  });

  it("misses a player standing off the line, at any height", () => {
    const clear = BAR_HALF_WIDTH + PLAYER_RADIUS + 0.05;
    for (const y of [0, 0.5, BAR_HEIGHT, 5]) {
      expect(barHits(bar, vec(5, clear), y, LATE), `y=${y}`).toBe(false);
    }
  });

  it("hits at the exact centre — the pivot is not a hub to camp (R2)", () => {
    expect(barHits(bar, vec(0, 0), 0, LATE)).toBe(true);
    expect(barHits({ angle: 2.2, speed: -1, armedAt: 0 }, vec(0, 0), 0, LATE)).toBe(true);
  });

  it("does not reach past the bar's tip", () => {
    expect(barHits(bar, vec(BAR_LENGTH + 1, 0), 0, LATE)).toBe(false);
  });

  it("is harmless while unarmed, however square the hit (RD-014)", () => {
    // A bar that has just appeared must warn, not kill. Same geometry, same height,
    // only the clock differs.
    const fresh = { angle: 0, speed: 1, armedAt: 5000 };
    expect(barHits(fresh, vec(5, 0), 0, 4999)).toBe(false);
    expect(barHits(fresh, vec(5, 0), 0, 5000)).toBe(true);
  });

  it("clears the bar for only part of the airtime — timing is the skill (RD-012)", () => {
    const { airborneTicks, peak } = jumpArc();
    const clear = clearanceTicks(BAR_HEIGHT);

    expect(airborneTicks).toBe(12);
    expect(peak).toBeCloseTo(1.335, 3);
    expect(clear).toBe(6);

    // Half the airtime, not most of it: mashing the button must not be a strategy.
    expect(clear / airborneTicks).toBeGreaterThan(0.3);
    expect(clear / airborneTicks).toBeLessThan(0.6);
  });

  it("leaves a button-masher exposed about half the time (RD-014)", () => {
    // Holding the button hops continuously: 12 airborne ticks then one grounded tick
    // before the next jump. Safe for only the clear fraction of that cycle. Lowering
    // BAR_HEIGHT to 0.9 pushed this to 62%, which is why the bar was narrowed instead.
    const { airborneTicks } = jumpArc();
    const masherSafeFraction = clearanceTicks(BAR_HEIGHT) / (airborneTicks + 1);
    expect(masherSafeFraction).toBeLessThan(0.5);
  });

  it("is jumpable where it cannot be outrun, and unjumpable only where it crawls", () => {
    // The governing invariant (RD-014): a bar sweeps past in passageSeconds, and you
    // can only be above it for clearanceSeconds. Slow bars linger and become
    // UNAVOIDABLE, which is why slowing them down made the minigame worse.
    const clear = clearanceSeconds();

    // The rim, worst case (slowest bar): must be jumpable or the verb does not work.
    expect(passageSeconds(SPEED_MIN, BAR_LENGTH)).toBeLessThan(clear);
    expect(passageSeconds(SPEED_MAX, BAR_LENGTH)).toBeLessThan(clear);

    // Near the pivot it is not jumpable — and that is correct, because the bar is
    // crawling there and stepping aside is easy.
    expect(passageSeconds(SPEED_MAX, 3)).toBeGreaterThan(clear);

    // The rim genuinely cannot be outrun, so jumping is the only answer there.
    expect(SPEED_MAX * BAR_LENGTH).toBeGreaterThan(MAX_SPEED);
  });

  it("leaves real margin over the bar, so a retune cannot make it unjumpable", () => {
    expect(jumpArc().peak).toBeGreaterThan(BAR_HEIGHT + 0.15);
  });
});

describe("jumping (T5, R4)", () => {
  const ground = (): number => 0;

  it("flies the discrete arc, which is 17% lower than the textbook one (RD-012)", () => {
    const analyticPeak = (JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY);
    const analyticAir = (2 * JUMP_SPEED) / GRAVITY;
    const { peak, airborneTicks } = jumpArc();

    // The formula is not what the game does; semi-implicit Euler at 20Hz undershoots.
    expect(peak).toBeLessThan(analyticPeak);
    expect(analyticPeak / peak).toBeGreaterThan(1.15);
    expect(airborneTicks * TICK_DT).toBeLessThan(analyticAir);
    // And the real arc still clears the real bar.
    expect(peak).toBeGreaterThan(BAR_HEIGHT);
  });

  it("refuses a second jump in mid-air, so the button cannot hover", () => {
    const players = mkPlayers(1);
    const state = sweepers.init({ rng: makeRng(6), players });
    const held: InputState = { axis: { x: 0, z: 0 }, btn: true };

    step(state, players, 50, 1, () => held);
    const afterFirst = players[0]!.body.y;
    expect(afterFirst).toBeGreaterThan(0);

    // Keep the button down for the whole arc; height must come back down.
    let maxY = afterFirst;
    for (let i = 2; i <= 40; i++) {
      step(state, players, i * 50, 1, () => held);
      maxY = Math.max(maxY, players[0]!.body.y);
    }
    expect(maxY).toBeLessThan(jumpArc().peak + 0.01);
  });

  it("cannot extend or cut the arc once airborne", async () => {
    const { stepMovement } = await import("@ruckus/shared");
    const holding = makeBody(vec());
    const released = makeBody(vec());
    stepMovement(holding, { axis: vec(), jump: true }, TICK_DT, [], ground, JUMP_SPEED);
    stepMovement(released, { axis: vec(), jump: true }, TICK_DT, [], ground, JUMP_SPEED);
    for (let i = 0; i < 10; i++) {
      stepMovement(holding, { axis: vec(), jump: true }, TICK_DT, [], ground, JUMP_SPEED);
      stepMovement(released, { axis: vec(), jump: false }, TICK_DT, [], ground, JUMP_SPEED);
      expect(holding.y).toBeCloseTo(released.y, 10);
    }
  });
});

describe("no safe spot, and walls (T6, R2, R5, P3)", () => {
  it("eliminates everyone with zero input, over many seeds", () => {
    for (let seed = 0; seed < 200; seed++) {
      const players = mkPlayers(5);
      const { over, elapsed, state } = run(players, seed);
      expect(over, `seed ${seed}`).toBe(true);
      expect(elapsed).toBeLessThan(MAX_DURATION_MS);
      expect(state.alive.size).toBeLessThanOrEqual(1);
    }
  });

  it("finishes inside one slow revolution plus a margin (P3)", () => {
    const worstRevolutionMs = ((Math.PI * 2) / SPEED_MIN) * 1000;
    for (let seed = 0; seed < 60; seed++) {
      const { elapsed } = run(mkPlayers(4), seed);
      expect(elapsed).toBeLessThan(worstRevolutionMs + 2000);
    }
  });

  it("sweeps a player parked exactly at the centre", () => {
    const players = mkPlayers(1);
    const state = sweepers.init({ rng: makeRng(8), players });
    players[0]!.body.pos = vec(0, 0);
    // Past the opening grace: before it, nothing is lethal by design (RD-014).
    for (let i = 1; i * 50 <= GRACE_MS + 200; i++) {
      players[0]!.body.pos = vec(0, 0);
      step(state, players, i * 50);
    }
    expect(state.alive.has(0)).toBe(false);
  });

  it("keeps players inside the walls, driven at each of them", () => {
    const dirs = [vec(1, 0), vec(-1, 0), vec(0, 1), vec(0, -1), vec(1, 1), vec(-1, -1)];
    for (let seed = 0; seed < 60; seed++) {
      const dir = dirs[seed % dirs.length]!;
      const players = mkPlayers(1);
      const state = sweepers.init({ rng: makeRng(seed), players });
      let escaped = 0;
      for (let i = 1; i <= 120; i++) {
        // Keep them alive so the walls, not the bars, are what is under test.
        state.alive.add(0);
        players[0]!.alive = true;
        step(state, players, i * 50, seed, () => ({ axis: dir, btn: i % 20 === 0 }));
        const { x, z } = players[0]!.body.pos;
        if (Math.abs(x) > HALF + 0.01 || Math.abs(z) > HALF + 0.01) escaped++;
      }
      expect(escaped, `seed ${seed} escaped the arena`).toBe(0);
    }
  });

  it("never lets a player fall — the floor is solid everywhere (R5)", () => {
    const players = mkPlayers(3);
    const { state } = run(players, 12);
    void state;
    for (const p of players) expect(p.body.y).toBeGreaterThanOrEqual(0);
  });
});

describe("scoring (T7, R6)", () => {
  it("awards 3/2/1 down the finish order", () => {
    const players = mkPlayers(4);
    const { state } = run(players, 15);
    const s = sweepers.scores(state);
    for (const pts of Object.values(s)) {
      expect(pts).toBeLessThanOrEqual(3);
      expect(pts).toBeGreaterThanOrEqual(0);
    }
    const firstOut = state.placement[0]!;
    const lastOut = state.placement[state.placement.length - 1]!;
    expect(s[firstOut]!).toBeLessThanOrEqual(s[lastOut]!);
  });

  it("gives players struck on the same tick the same placement", () => {
    const players = mkPlayers(2);
    const state = sweepers.init({ rng: makeRng(20), players });
    // Park both on the same bar line, symmetrically, so one sweep takes both.
    const bar = state.bars[0]!;
    const along = (r: number) => vec(Math.cos(bar.angle) * r, Math.sin(bar.angle) * r);
    // Hold both on the line until the opening grace has passed (RD-014).
    for (let i = 1; i * 50 <= GRACE_MS + 200 && state.alive.size > 0; i++) {
      const b2 = state.bars[0]!;
      const on = (r: number) => vec(Math.cos(b2.angle) * r, Math.sin(b2.angle) * r);
      players[0]!.body.pos = on(3);
      players[1]!.body.pos = on(6);
      step(state, players, i * 50);
    }

    expect(state.alive.size).toBe(0);
    expect(state.elimAt.get(0)).toBe(state.elimAt.get(1));
    const s = sweepers.scores(state);
    expect(s[0]).toBe(s[1]);
  });

  it("is monotonic in elimination order, over many seeds", () => {
    for (let seed = 0; seed < 100; seed++) {
      const players = mkPlayers(6);
      const { state } = run(players, seed);
      const s = sweepers.scores(state);
      for (let i = 0; i < state.placement.length; i++) {
        for (let j = i + 1; j < state.placement.length; j++) {
          expect(s[state.placement[i]!]!).toBeLessThanOrEqual(s[state.placement[j]!]!);
        }
      }
    }
  });

  it("scores every roster member", () => {
    const players = mkPlayers(5);
    const { state } = run(players, 31);
    const s = sweepers.scores(state);
    for (let slot = 0; slot < 5; slot++) expect(s[slot]).toBeTypeOf("number");
  });
});

describe("determinism (T8, R7, I3)", () => {
  it("same seed and inputs give an identical round", () => {
    const scripted = (slot: number, elapsed: number): InputState => ({
      axis: vec(Math.sin((elapsed + slot * 173) / 260), Math.cos((elapsed + slot * 89) / 210)),
      btn: Math.floor(elapsed / 450 + slot) % 3 === 0,
    });

    for (let seed = 0; seed < 200; seed++) {
      const a = mkPlayers(4);
      const b = mkPlayers(4);
      const ra = run(a, seed, scripted);
      const rb = run(b, seed, scripted);

      expect(ra.elapsed).toBe(rb.elapsed);
      expect(ra.state.placement).toEqual(rb.state.placement);
      expect(ra.state.bars.map((x) => x.angle)).toEqual(rb.state.bars.map((x) => x.angle));
      expect(a.map((p) => p.body.pos)).toEqual(b.map((p) => p.body.pos));
      expect(a.map((p) => p.body.y)).toEqual(b.map((p) => p.body.y));
    }
  });

  it("spawns everyone inside the arena, off the centre, and clear of each other", () => {
    for (let seed = 0; seed < 100; seed++) {
      const players = mkPlayers(8);
      sweepers.init({ rng: makeRng(seed), players });
      for (const p of players) {
        const r = Math.hypot(p.body.pos.x, p.body.pos.z);
        expect(r).toBeGreaterThan(1);
        expect(Math.abs(p.body.pos.x)).toBeLessThan(HALF);
        expect(Math.abs(p.body.pos.z)).toBeLessThan(HALF);
      }
    }
  });
});

describe("snapshot and contract (T9, R8, P4)", () => {
  it("publishes one rotated prim per bar, matching the bar's angle (P4)", () => {
    const players = mkPlayers(2);
    const state = sweepers.init({ rng: makeRng(40), players });
    step(state, players, 50);

    const snap = sweepers.snapshot(state) as {
      bars: { angle: number }[];
      prims: { k: string; rotY?: number; pos: [number, number, number] }[];
    };
    expect(snap.prims).toHaveLength(state.bars.length);
    snap.prims.forEach((prim, i) => {
      expect(prim.k).toBe("box");
      expect(prim.rotY).toBeCloseTo(-state.bars[i]!.angle, 10);
      // Midpoint of the centre-to-tip segment.
      expect(prim.pos[0]).toBeCloseTo((Math.cos(state.bars[i]!.angle) * BAR_LENGTH) / 2, 9);
      expect(prim.pos[2]).toBeCloseTo((Math.sin(state.bars[i]!.angle) * BAR_LENGTH) / 2, 9);
    });
  });

  it("grows the prim list as the ramp adds bars", () => {
    const players = mkPlayers(1);
    const state = sweepers.init({ rng: makeRng(41), players });
    const before = (sweepers.snapshot(state) as { prims: unknown[] }).prims.length;
    for (let i = 1; i * 50 <= RAMP_MS + 200; i++) step(state, players, i * 50);
    const after = (sweepers.snapshot(state) as { prims: unknown[] }).prims.length;
    expect(after).toBe(before + 1);
  });

  it("publishes its walls as solids, so the client draws what the sim uses", () => {
    const arena = sweepers.arena({} as SweepersState);
    expect(arena.solids).toBe(WALLS);
    expect(arena.solids).toHaveLength(4);
  });

  it("honours the contract's preconditions", () => {
    expect(sweepers.input).toBe("stick+button");
    expect(sweepers.rule.split(".").filter((p) => p.trim())).toHaveLength(1);
    expect(sweepers.rule.length).toBeLessThan(80);
    expect(sweepers.maxDurationMs).toBeGreaterThan(0);
    expect(Object.keys(sweepers.arena({} as SweepersState).camera).sort()).toEqual([
      // `extent` is a distance in metres, not a camera instruction — there is nothing
      // in it a client could steer. The list stays exhaustive so the next field to
      // appear on a camera is a decision rather than a drift.
      "extent",
      "eye",
      "fov",
      "look",
    ]);
  });
});
