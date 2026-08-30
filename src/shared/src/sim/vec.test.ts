import { describe, expect, it } from "vitest";
import { add, clampUnit, len, moveToward, normalize, scale, sub, vec } from "./vec.ts";
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
