import { describe, expect, it } from "vitest";
import {
  add,
  clampUnit,
  distPointSegment,
  len,
  moveToward,
  normalize,
  scale,
  sub,
  vec,
} from "./vec.ts";
import { makeRng } from "./rng.ts";

describe("clampUnit (T2, R9)", () => {
  it("leaves a vector inside the unit disc untouched", () => {
    const v = vec(0.3, -0.4);
    expect(clampUnit(v)).toEqual(v);
  });

  it("maps anything outside to exactly length 1", () => {
    const r = makeRng(5);
    for (let i = 0; i < 1000; i++) {
      const v = vec(r.range(-50, 50), r.range(-50, 50));
      const c = clampUnit(v);
      if (len(v) > 1) expect(len(c)).toBeCloseTo(1, 10);
      else expect(c).toEqual(v);
    }
  });

  it("clamps rather than rejecting — a wild axis still moves you (I2)", () => {
    const c = clampUnit(vec(9, 0));
    expect(c.x).toBeCloseTo(1, 10);
    expect(c.z).toBeCloseTo(0, 10);
  });

  it("survives a zero vector without dividing by zero", () => {
    expect(clampUnit(vec(0, 0))).toEqual(vec(0, 0));
  });
});

describe("vector algebra (T2)", () => {
  it("obeys the identities we rely on", () => {
    const r = makeRng(11);
    for (let i = 0; i < 500; i++) {
      const a = vec(r.range(-9, 9), r.range(-9, 9));
      const b = vec(r.range(-9, 9), r.range(-9, 9));
      expect(sub(add(a, b), b).x).toBeCloseTo(a.x, 10);
      expect(len(scale(a, 2))).toBeCloseTo(len(a) * 2, 10);
      if (len(a) > 1e-6) expect(len(normalize(a))).toBeCloseTo(1, 10);
    }
  });

  it("normalize(0) is 0, not NaN", () => {
    expect(normalize(vec(0, 0))).toEqual(vec(0, 0));
  });
});

describe("moveToward (T2)", () => {
  it("arrives exactly when the step covers the gap", () => {
    expect(moveToward(vec(0, 0), vec(3, 4), 5)).toEqual(vec(3, 4));
    expect(moveToward(vec(0, 0), vec(3, 4), 99)).toEqual(vec(3, 4));
  });

  it("steps by exactly maxDelta when it does not", () => {
    const out = moveToward(vec(0, 0), vec(10, 0), 2);
    expect(out.x).toBeCloseTo(2, 10);
  });
});

describe("distPointSegment (sweepers T1, R1)", () => {
  const a = vec(0, 0);
  const b = vec(10, 0);

  it("is the perpendicular distance when the projection lands inside", () => {
    expect(distPointSegment(vec(5, 3), a, b)).toBeCloseTo(3, 10);
    expect(distPointSegment(vec(5, -4), a, b)).toBeCloseTo(4, 10);
  });

  it("is zero on the segment, including at both endpoints", () => {
    expect(distPointSegment(vec(5, 0), a, b)).toBeCloseTo(0, 10);
    expect(distPointSegment(a, a, b)).toBeCloseTo(0, 10);
    expect(distPointSegment(b, a, b)).toBeCloseTo(0, 10);
  });

  it("clamps to an endpoint when the projection falls outside", () => {
    // Past b: distance is to b itself, not to the infinite line.
    expect(distPointSegment(vec(14, 3), a, b)).toBeCloseTo(5, 10);
    // Before a, likewise.
    expect(distPointSegment(vec(-3, 4), a, b)).toBeCloseTo(5, 10);
  });

  it("treats a zero-length segment as a point, without dividing by zero", () => {
    const p = vec(3, 4);
    expect(distPointSegment(p, a, a)).toBeCloseTo(5, 10);
    expect(Number.isFinite(distPointSegment(a, a, a))).toBe(true);
  });

  it("is symmetric in the segment's endpoints", () => {
    const r = makeRng(17);
    for (let i = 0; i < 500; i++) {
      const p = vec(r.range(-20, 20), r.range(-20, 20));
      const s0 = vec(r.range(-10, 10), r.range(-10, 10));
      const s1 = vec(r.range(-10, 10), r.range(-10, 10));
      expect(distPointSegment(p, s0, s1)).toBeCloseTo(distPointSegment(p, s1, s0), 9);
    }
  });

  it("never exceeds the distance to either endpoint", () => {
    const r = makeRng(23);
    for (let i = 0; i < 500; i++) {
      const p = vec(r.range(-20, 20), r.range(-20, 20));
      const s0 = vec(r.range(-10, 10), r.range(-10, 10));
      const s1 = vec(r.range(-10, 10), r.range(-10, 10));
      const d = distPointSegment(p, s0, s1);
      expect(d).toBeLessThanOrEqual(Math.min(len(sub(p, s0)), len(sub(p, s1))) + 1e-9);
    }
  });
});
