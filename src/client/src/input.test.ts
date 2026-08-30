import { describe, expect, it } from "vitest";
import { DEAD_ZONE_PX, STICK_RADIUS, keyVector, stickVector } from "./input.ts";

describe("stickVector (T17, R10)", () => {
  it("is zero inside the dead zone, so a resting thumb does not drift", () => {
    expect(stickVector(0, 0)).toEqual({ ax: 0, ay: 0 });
    expect(stickVector(DEAD_ZONE_PX - 1, 0)).toEqual({ ax: 0, ay: 0 });
  });

  it("reaches exactly 1 at the stick radius and never exceeds it", () => {
    const at = stickVector(STICK_RADIUS, 0);
    expect(Math.hypot(at.ax, at.ay)).toBeCloseTo(1, 10);
    for (const d of [STICK_RADIUS + 1, STICK_RADIUS * 3, 5000]) {
      const v = stickVector(d, d);
      expect(Math.hypot(v.ax, v.ay)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it("scales linearly between the dead zone and the rim", () => {
    const half = stickVector(STICK_RADIUS / 2, 0);
    expect(half.ax).toBeCloseTo(0.5, 10);
  });

  it("preserves direction", () => {
    const v = stickVector(-30, 40);
    expect(Math.atan2(v.ay, v.ax)).toBeCloseTo(Math.atan2(40, -30), 10);
  });
});

describe("keyVector (T17)", () => {
  it("maps WASD and arrows to the same axes", () => {
    expect(keyVector(new Set(["w"]))).toEqual(keyVector(new Set(["arrowup"])));
    expect(keyVector(new Set(["a"]))).toEqual(keyVector(new Set(["arrowleft"])));
    expect(keyVector(new Set(["d"]))).toEqual({ ax: 1, ay: 0 });
    expect(keyVector(new Set(["s"]))).toEqual({ ax: 0, ay: 1 });
  });

  it("normalizes the diagonal — no free 41% speed in the corners", () => {
    const diag = keyVector(new Set(["w", "d"]));
    expect(Math.hypot(diag.ax, diag.ay)).toBeCloseTo(1, 10);
  });

  it("cancels opposing keys", () => {
    expect(keyVector(new Set(["a", "d"]))).toEqual({ ax: 0, ay: 0 });
    expect(keyVector(new Set(["w", "s"]))).toEqual({ ax: 0, ay: 0 });
  });

  it("is zero with nothing held", () => {
    expect(keyVector(new Set())).toEqual({ ax: 0, ay: 0 });
  });

  it("agrees in shape with the touch path, so nothing downstream can tell them apart", () => {
    expect(Object.keys(keyVector(new Set(["w"]))).sort()).toEqual(
      Object.keys(stickVector(0, -STICK_RADIUS)).sort(),
    );
  });
});
