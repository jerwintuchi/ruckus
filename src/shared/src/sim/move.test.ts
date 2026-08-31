import { describe, expect, it } from "vitest";
import { makeBody, resolveCircleAabb, stepMovement, type Solid } from "./move.ts";
import { dist, len, vec } from "./vec.ts";
import { makeRng } from "./rng.ts";
import {
  MAX_SPEED,
  MIN_SOLID_THICKNESS,
  PLAYER_RADIUS,
  TICK_DT,
  TICK_HZ,
  minThicknessFor,
} from "../constants.ts";

const flat = () => 0;
const nowhere = () => null;
const box = (x0: number, z0: number, x1: number, z1: number): Solid => ({
  min: vec(x0, z0),
  max: vec(x1, z1),
});

describe("resolveCircleAabb (T3, P6)", () => {
  it("leaves a circle that is already clear untouched", () => {
    const p = vec(10, 10);
    expect(resolveCircleAabb(p, 0.4, box(0, 0, 1, 1))).toEqual(p);
  });

  it("is idempotent — re-resolving a resolved position changes nothing", () => {
    const r = makeRng(3);
    const s = box(-1, -1, 1, 1);
    for (let i = 0; i < 1000; i++) {
      const p = vec(r.range(-3, 3), r.range(-3, 3));
      const once = resolveCircleAabb(p, PLAYER_RADIUS, s);
      const twice = resolveCircleAabb(once, PLAYER_RADIUS, s);
      expect(dist(once, twice)).toBeLessThan(1e-9);
    }
  });

  it("pushes a fully-interior centre out through the nearest face", () => {
    const s = box(-1, -1, 1, 1);
    // Just inside the +x face, so +x is the shallowest exit.
    const out = resolveCircleAabb(vec(0.9, 0), PLAYER_RADIUS, s);
    expect(out.x).toBeCloseTo(1 + PLAYER_RADIUS, 10);
    expect(out.z).toBeCloseTo(0, 10);
  });

  it("resolves an exactly-centred circle rather than dividing by zero", () => {
    const out = resolveCircleAabb(vec(0, 0), PLAYER_RADIUS, box(-1, -1, 1, 1));
    expect(Number.isFinite(out.x) && Number.isFinite(out.z)).toBe(true);
  });
});

describe("stepMovement (T3, R9)", () => {
  it("clamps a wild input instead of rejecting it (I2)", () => {
    const wild = makeBody(vec(0, 0));
    const sane = makeBody(vec(0, 0));
    for (let i = 0; i < 40; i++) {
      stepMovement(wild, { axis: vec(9, 0), jump: false }, TICK_DT, [], flat);
      stepMovement(sane, { axis: vec(1, 0), jump: false }, TICK_DT, [], flat);
    }
    expect(wild.pos.x).toBeCloseTo(sane.pos.x, 8);
    expect(wild.pos.x).toBeGreaterThan(0);
  });

  it("never exceeds MAX_SPEED", () => {
    const b = makeBody(vec(0, 0));
    for (let i = 0; i < 300; i++) {
      stepMovement(b, { axis: vec(1, 1), jump: false }, TICK_DT, [], flat);
      expect(len(b.vel)).toBeLessThanOrEqual(MAX_SPEED + 1e-6);
    }
  });

  it("comes to rest when input stops", () => {
    const b = makeBody(vec(0, 0));
    for (let i = 0; i < 20; i++) stepMovement(b, { axis: vec(1, 0), jump: false }, TICK_DT, [], flat);
    for (let i = 0; i < 200; i++) stepMovement(b, { axis: vec(0, 0), jump: false }, TICK_DT, [], flat);
    expect(len(b.vel)).toBeCloseTo(0, 6);
  });

  it("cannot tunnel through the thinnest legal solid (P7)", () => {
    // The guard itself: one tick of travel must stay under the thinnest wall.
    expect(MAX_SPEED / TICK_HZ).toBeLessThan(MIN_SOLID_THICKNESS);

    const wall = box(2, -10, 2 + MIN_SOLID_THICKNESS, 10);
    const r = makeRng(9);
    for (let trial = 0; trial < 200; trial++) {
      const b = makeBody(vec(r.range(-2, 1), r.range(-1, 1)));
      b.vel = vec(MAX_SPEED, 0);
      for (let i = 0; i < 60; i++) {
        stepMovement(b, { axis: vec(1, 0), jump: false }, TICK_DT, [wall], flat);
        expect(b.pos.x).toBeLessThan(2 + MIN_SOLID_THICKNESS + PLAYER_RADIUS + 1e-6);
      }
    }
  });

  it("lands exactly on the ground and stays grounded", () => {
    const b = makeBody(vec(0, 0));
    b.y = 5;
    b.grounded = false;
    for (let i = 0; i < 200; i++) stepMovement(b, { axis: vec(0, 0), jump: false }, TICK_DT, [], flat);
    expect(b.y).toBe(0);
    expect(b.vy).toBe(0);
    expect(b.grounded).toBe(true);
  });

  it("falls without limit where there is no ground (P3 — how elimination works)", () => {
    const b = makeBody(vec(0, 0));
    for (let i = 0; i < 40; i++) stepMovement(b, { axis: vec(0, 0), jump: false }, TICK_DT, [], nowhere);
    expect(b.y).toBeLessThan(-3);
    expect(b.grounded).toBe(false);
  });

  it("jumps only when grounded and only when a jump speed is offered", () => {
    const b = makeBody(vec(0, 0));
    stepMovement(b, { axis: vec(0, 0), jump: true }, TICK_DT, [], flat, 9);
    expect(b.y).toBeGreaterThan(0);

    const noJump = makeBody(vec(0, 0));
    stepMovement(noJump, { axis: vec(0, 0), jump: true }, TICK_DT, [], flat, 0);
    expect(noJump.y).toBe(0);
  });

  it("is deterministic — identical state and input give identical output", () => {
    const r = makeRng(21);
    for (let i = 0; i < 300; i++) {
      const start = vec(r.range(-5, 5), r.range(-5, 5));
      const axis = vec(r.range(-2, 2), r.range(-2, 2));
      const a = makeBody({ ...start });
      const b = makeBody({ ...start });
      for (let k = 0; k < 10; k++) {
        stepMovement(a, { axis, jump: false }, TICK_DT, [], flat);
        stepMovement(b, { axis, jump: false }, TICK_DT, [], flat);
      }
      expect(a.pos).toEqual(b.pos);
      expect(a.vel).toEqual(b.vel);
    }
  });
});

describe("stepMovement speedMul (hot-potato T1, R4)", () => {
  const runFor = (ticks: number, mul: number): number => {
    const b = makeBody(vec(0, 0));
    for (let i = 0; i < ticks; i++) {
      stepMovement(b, { axis: vec(1, 0), jump: false }, TICK_DT, [], flat, 0, mul);
    }
    return b.pos.x;
  };

  it("a multiplier of 1 is identical to omitting the argument", () => {
    const explicit = makeBody(vec(0, 0));
    const implicit = makeBody(vec(0, 0));
    for (let i = 0; i < 50; i++) {
      stepMovement(explicit, { axis: vec(1, 0), jump: false }, TICK_DT, [], flat, 0, 1);
      stepMovement(implicit, { axis: vec(1, 0), jump: false }, TICK_DT, [], flat);
    }
    expect(explicit.pos).toEqual(implicit.pos);
    expect(explicit.vel).toEqual(implicit.vel);
  });

  it("doubles the terminal speed when doubled", () => {
    const b = makeBody(vec(0, 0));
    for (let i = 0; i < 200; i++) {
      stepMovement(b, { axis: vec(1, 0), jump: false }, TICK_DT, [], flat, 0, 2);
    }
    expect(len(b.vel)).toBeCloseTo(MAX_SPEED * 2, 4);
  });

  it("pins the player at zero", () => {
    const b = makeBody(vec(0, 0));
    for (let i = 0; i < 60; i++) {
      stepMovement(b, { axis: vec(1, 0), jump: false }, TICK_DT, [], flat, 0, 0);
    }
    expect(b.pos.x).toBeCloseTo(0, 6);
  });

  it("covers more ground over a fixed window than the base speed", () => {
    expect(runFor(20, 2.1)).toBeGreaterThan(runFor(20, 1) * 1.5);
  });

  it("minThicknessFor covers a tick of travel, and never less than the floor", () => {
    // The invariant is "thick enough that nothing crosses it in one tick, and never
    // below the global floor" — not "a dash always needs more". Those coincided at
    // 20Hz and stopped coinciding at 30Hz, where a tick of dashing is short enough
    // that the floor already covers it (RD-036). Faster ticks make tunnelling harder,
    // which is the right direction; the test now says the thing that is actually true.
    for (const mul of [1, 1.5, 2.1, 4, 10]) {
      expect(minThicknessFor(mul), `mul ${mul}`).toBeGreaterThanOrEqual(MIN_SOLID_THICKNESS);
      expect(minThicknessFor(mul), `mul ${mul}`).toBeGreaterThanOrEqual((MAX_SPEED * mul) / TICK_HZ);
    }
    // Monotone: a faster thing never needs a thinner wall.
    let previous = 0;
    for (const mul of [1, 1.5, 2.1, 4, 10]) {
      const t = minThicknessFor(mul);
      expect(t, `mul ${mul}`).toBeGreaterThanOrEqual(previous);
      previous = t;
    }
    // And once a tick of travel exceeds the floor, it is the travel that decides.
    expect(minThicknessFor(10)).toBeCloseTo((MAX_SPEED * 10) / TICK_HZ, 10);
  });

  it("still cannot tunnel a wall built to minThicknessFor its multiplier", () => {
    // A dash is the case most likely to break the guard, so it is the case tested.
    const MUL = 2.1;
    const thickness = minThicknessFor(MUL);
    const wall = box(2, -10, 2 + thickness, 10);
    const r = makeRng(31);
    for (let trial = 0; trial < 200; trial++) {
      const b = makeBody(vec(r.range(-2, 1), r.range(-1, 1)));
      b.vel = vec(MAX_SPEED * MUL, 0);
      for (let i = 0; i < 60; i++) {
        stepMovement(b, { axis: vec(1, 0), jump: false }, TICK_DT, [wall], flat, 0, MUL);
        expect(b.pos.x).toBeLessThan(2 + thickness + PLAYER_RADIUS + 1e-6);
      }
    }
  });
});
