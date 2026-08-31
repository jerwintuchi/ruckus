import { describe, expect, it } from "vitest";
import { INTERP_DELAY_MS, TICK_MS, quantAngle, quantPos, type SnapPlayer } from "@ruckus/shared";
import { SnapshotBuffer, lerpAngle } from "./net.ts";

const snap = (slot: number, x: number, z: number, y = 0, a = 0): SnapPlayer => ({
  slot,
  x: quantPos(x),
  z: quantPos(z),
  y: quantPos(y),
  a: quantAngle(a),
  alive: true,
});

describe("SnapshotBuffer (T13, RD-004, P9)", () => {
  it("samples at now - INTERP_DELAY_MS, halfway between two frames", () => {
    const b = new SnapshotBuffer();
    b.push([snap(0, 0, 0)], null, 1000);
    b.push([snap(0, 10, 0)], null, 1100);
    // Render clock 1050 sits exactly between the two frames.
    const out = b.sample(1050 + INTERP_DELAY_MS);
    expect(out[0]!.x).toBeCloseTo(5, 6);
  });

  it("never extrapolates past the newest frame — it holds (P9)", () => {
    const b = new SnapshotBuffer();
    b.push([snap(0, 0, 0)], null, 1000);
    b.push([snap(0, 10, 0)], null, 1100);
    // Far beyond anything we have: a predictor would keep running; we must not.
    const out = b.sample(9999 + INTERP_DELAY_MS);
    expect(out[0]!.x).toBeCloseTo(10, 6);
  });

  it("holds the oldest frame when the render clock is behind everything", () => {
    const b = new SnapshotBuffer();
    b.push([snap(0, 4, 0)], null, 5000);
    b.push([snap(0, 9, 0)], null, 5100);
    const out = b.sample(0);
    expect(out[0]!.x).toBeCloseTo(4, 6);
  });

  it("returns nothing before any snapshot has arrived", () => {
    expect(new SnapshotBuffer().sample(1000)).toEqual([]);
  });

  it("keeps the buffer bounded so a long match cannot grow it", () => {
    const b = new SnapshotBuffer();
    for (let i = 0; i < 500; i++) b.push([snap(0, i, 0)], null, i * 50);
    expect(b.size).toBeLessThanOrEqual(8);
    expect(b.newest?.at).toBe(499 * 50);
  });

  it("drops a player who is absent from the later frame rather than freezing a ghost", () => {
    const b = new SnapshotBuffer();
    b.push([snap(0, 0, 0), snap(1, 5, 5)], null, 1000);
    b.push([snap(0, 2, 0)], null, 1100);
    const out = b.sample(1050 + INTERP_DELAY_MS);
    expect(out.map((p) => p.slot)).toEqual([0]);
  });

  it("derives a speed the animation can use, without simulating anything", () => {
    const b = new SnapshotBuffer();
    b.push([snap(0, 0, 0)], null, 1000);
    b.push([snap(0, 1, 0)], null, 1100); // 1 m in 100 ms
    const out = b.sample(1050 + INTERP_DELAY_MS);
    expect(out[0]!.speed).toBeCloseTo(10, 4);
  });

  it("carries the alive flag from the later frame, so death is not delayed a frame", () => {
    const b = new SnapshotBuffer();
    b.push([{ ...snap(0, 0, 0), alive: true }], null, 1000);
    b.push([{ ...snap(0, 1, 0), alive: false }], null, 1100);
    expect(b.sample(1050 + INTERP_DELAY_MS)[0]!.alive).toBe(false);
  });
});

describe("lerpAngle (T13)", () => {
  it("takes the short way round a wrap", () => {
    const out = lerpAngle(0.1, Math.PI * 2 - 0.1, 0.5);
    // The short path crosses zero, so the midpoint is near 0 (or 2pi), never near pi.
    const norm = ((out % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const distToZero = Math.min(norm, Math.PI * 2 - norm);
    expect(distToZero).toBeLessThan(0.05);
  });

  it("is the identity at t=0 and reaches the target at t=1", () => {
    expect(lerpAngle(1.2, 2.4, 0)).toBeCloseTo(1.2, 10);
    expect(lerpAngle(1.2, 2.4, 1)).toBeCloseTo(2.4, 10);
  });
});

describe("the buffer covers more than one late packet (responsiveness T2, R2, P2)", () => {
  it("holds at least two snapshots' worth, as a relationship not a number", () => {
    // The buffer's job is to survive a late packet, and that is a COUNT of snapshots,
    // not a duration. Pinning the ratio is what makes the two constants safe to retune
    // together and unsafe to retune apart: 70ms alone at 20Hz covered only 1.4.
    expect(INTERP_DELAY_MS / TICK_MS).toBeGreaterThanOrEqual(2);
  });

  it("does not buffer so far ahead that the input feels distant", () => {
    // The other side of the same trade. Somewhere above three snapshots the latency
    // costs more than the jitter tolerance is worth.
    expect(INTERP_DELAY_MS / TICK_MS).toBeLessThanOrEqual(3);
  });

  it("still holds the newest frame when starved, and never extrapolates (P2)", () => {
    const b = new SnapshotBuffer();
    b.push([{ slot: 0, x: 100, y: 0, z: 200, facing: 0, speed: 0, vy: 0, alive: true }] as never, {}, 0);
    const held = b.sample(10_000); // render clock far past everything we have
    expect(held).toHaveLength(1);
    const again = b.sample(50_000);
    // A guess would keep moving; a hold does not.
    expect(again[0]!.x).toBe(held[0]!.x);
    expect(again[0]!.z).toBe(held[0]!.z);
  });
});
