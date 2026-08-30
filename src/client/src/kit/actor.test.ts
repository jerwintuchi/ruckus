import { describe, expect, it } from "vitest";
import { MAX_LEAN, poseFor } from "./actor.ts";

describe("poseFor (T15, RD-005)", () => {
  it("is a pure function of its arguments", () => {
    const a = poseFor(4, 8, 0, 0, 1.23);
    const b = poseFor(4, 8, 0, 0, 1.23);
    expect(a).toEqual(b);
  });

  it("clamps lean, however fast the input claims to be", () => {
    for (const speed of [0, 8, 80, 1e6]) {
      const p = poseFor(speed, 8, 0, 0, 0.4);
      expect(Math.abs(p.lean)).toBeLessThanOrEqual(MAX_LEAN + 1e-9);
    }
  });

  it("does not bob or swing while airborne — a mid-air gait reads as a glitch", () => {
    const air = poseFor(8, 8, 2, -4, 0.3);
    expect(air.bob).toBe(0);
    expect(air.swing).toBe(0.3);
  });

  it("stretches on the way up and squashes on the way down", () => {
    const up = poseFor(0, 8, 2, 6, 0);
    const down = poseFor(0, 8, 2, -6, 0);
    expect(up.squash).toBeGreaterThan(1);
    expect(down.squash).toBeLessThan(1);
  });

  it("keeps squash inside a sane band for absurd velocities", () => {
    for (const vy of [-1000, -50, 0, 50, 1000]) {
      const p = poseFor(0, 8, 5, vy, 0);
      expect(p.squash).toBeGreaterThanOrEqual(0.7);
      expect(p.squash).toBeLessThanOrEqual(1.3);
    }
  });

  it("is finite for every extreme input, including a zero max speed", () => {
    const cases = [
      poseFor(0, 0, 0, 0, 0),
      poseFor(1e9, 8, 0, 0, 1e9),
      poseFor(-5, 8, -5, 0, -3),
      poseFor(Number.MAX_SAFE_INTEGER, 1, 0, 0, 0),
    ];
    for (const p of cases) {
      for (const v of Object.values(p)) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("scales the gait with speed, and stands still at zero", () => {
    const still = poseFor(0, 8, 0, 0, 0.25);
    const running = poseFor(8, 8, 0, 0, 0.25);
    expect(still.bob).toBe(0);
    expect(still.lean).toBe(0);
    expect(running.bob).toBeGreaterThan(0);
    expect(running.lean).toBeGreaterThan(0);
  });
});
