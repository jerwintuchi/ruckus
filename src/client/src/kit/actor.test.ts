import { describe, expect, it } from "vitest";
import { MAX_FLIP, MAX_LEAN, poseFor } from "./actor.ts";

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

describe("paper hinges, it does not deform (visual-direction T11, R9, P4)", () => {
  it("swings legs and arms in counter-phase", () => {
    const p = poseFor(6, 8, 0, 0, 0.14);
    expect(Math.sign(p.legSwing)).toBe(-Math.sign(p.armSwing));
    expect(Math.abs(p.legSwing)).toBeGreaterThan(0);
  });

  it("snaps toward the extremes rather than gliding like a sinusoid", () => {
    // Paper has no inertia: a limb reaches its pose fast and holds it. Sampled early
    // in the swing, a sharpened curve is already further along than a sine would be.
    const early = Math.abs(poseFor(8, 8, 0, 0, 0.02).legSwing);
    const sine = Math.abs(Math.sin(0.02 * 2.4 * Math.PI * 2)) * 0.62;
    expect(early).toBeGreaterThan(sine);
  });

  it("holds still at rest, however long the clock runs", () => {
    for (const t of [0, 1.7, 99, 1e5]) {
      const p = poseFor(0, 8, 0, 0, t);
      // toBeCloseTo, not toBe: the arm swing is negated, so a zero gait yields -0,
      // which Object.is separates from 0. Identical on screen, different to ===.
      expect(p.legSwing, `t=${t}`).toBeCloseTo(0, 12);
      expect(p.armSwing, `t=${t}`).toBeCloseTo(0, 12);
    }
  });

  it("scales the swing with speed", () => {
    const slow = Math.abs(poseFor(2, 8, 0, 0, 0.14).legSwing);
    const fast = Math.abs(poseFor(8, 8, 0, 0, 0.14).legSwing);
    expect(fast).toBeGreaterThan(slow);
  });

  it("poses the air differently from every point of the ground cycle", () => {
    const air = poseFor(6, 8, 1.4, -3, 0.2);
    for (let t = 0; t < 2; t += 0.02) {
      const ground = poseFor(6, 8, 0, 0, t);
      expect([ground.legSwing, ground.armSwing]).not.toEqual([air.legSwing, air.armSwing]);
    }
  });

  it("flips to show the ink edge on a turn, and clamps how far", () => {
    expect(poseFor(6, 8, 0, 0, 0.2, 0).flip).toBe(0);
    expect(poseFor(6, 8, 0, 0, 0.2, 1).flip).toBeGreaterThan(0.2);
    // However hard the turn, the slab never spins past readable.
    for (const turning of [1, 5, 1e6, -3]) {
      expect(Math.abs(poseFor(6, 8, 0, 0, 0.2, turning).flip)).toBeLessThanOrEqual(MAX_FLIP);
    }
  });

  it("stays finite for every extreme input", () => {
    for (const args of [
      [1e9, 8, 0, 0, 1e9, 1e9], [-5, 0, -5, 1e6, -3, -1], [0, 0, 0, 0, 0, 0],
    ] as const) {
      const p = poseFor(...(args as unknown as [number, number, number, number, number, number]));
      for (const v of Object.values(p)) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("is a pure function of its arguments", () => {
    expect(poseFor(5, 8, 0.3, -2, 1.23, 0.4)).toEqual(poseFor(5, 8, 0.3, -2, 1.23, 0.4));
  });
});
