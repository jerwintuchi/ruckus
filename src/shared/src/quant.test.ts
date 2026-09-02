import { describe, expect, it } from "vitest";
import { dequantAngle, dequantPos, quantAngle, quantPos, quantPrim } from "./quant.ts";
import { makeRng } from "./sim/rng.ts";

describe("position quantization (T4, P3)", () => {
  it("round-trips within 5 mm for anything inside 100 m", () => {
    const r = makeRng(4);
    for (let i = 0; i < 20_000; i++) {
      const m = r.range(-100, 100);
      expect(Math.abs(dequantPos(quantPos(m)) - m)).toBeLessThanOrEqual(0.005);
    }
  });

  it("emits integers, so the wire stays compact", () => {
    const r = makeRng(6);
    for (let i = 0; i < 1000; i++) expect(Number.isInteger(quantPos(r.range(-50, 50)))).toBe(true);
  });
});

describe("angle quantization (T4, P3)", () => {
  it("round-trips within one step of 1/255 of a turn", () => {
    const step = (Math.PI * 2) / 255;
    const r = makeRng(8);
    for (let i = 0; i < 20_000; i++) {
      const a = r.range(0, Math.PI * 2);
      const back = dequantAngle(quantAngle(a));
      const err = Math.min(Math.abs(back - a), Math.PI * 2 - Math.abs(back - a));
      expect(err).toBeLessThanOrEqual(step);
    }
  });

  it("wraps negative and over-turn angles into a byte", () => {
    for (const a of [-Math.PI, -0.001, 0, Math.PI * 2, Math.PI * 7.5]) {
      const q = quantAngle(a);
      expect(Number.isInteger(q)).toBe(true);
      expect(q).toBeGreaterThanOrEqual(0);
      expect(q).toBeLessThanOrEqual(255);
    }
  });
});

describe("prims are quantized before they go on the wire (RD-082, I5)", () => {
  // `scramble` shipped one sphere per pickup at full float precision, and 30% of its
  // snapshots exceeded the 1240-byte TCP payload of a 1280-MTU path — split across two
  // packets, where losing either stalls the whole stream until retransmission. Every
  // other minigame already fitted inside one packet.
  it("rounds a position to centimetres and keeps it in metres", () => {
    // Metres, not integer centimetres: the renderer reads prims straight off the wire,
    // so the units cannot change — only the number of digits.
    const p = quantPrim({ k: "sphere", pos: [-4.123456789012345, 0.6234567890123, 7.98765432109876], r: 0.35, colour: "#fff" });
    expect(p.pos).toEqual([-4.12, 0.62, 7.99]);
  });

  it("rounds every numeric field a prim can carry", () => {
    const box = quantPrim({
      k: "box", pos: [1.111111, 2.222222, 3.333333], size: [4.444444, 5.555555, 6.666666],
      colour: "#fff", rotY: 1.2345678,
    });
    expect(box.size).toEqual([4.44, 5.56, 6.67]);
    expect(box.rotY).toBe(1.235);
    const cyl = quantPrim({ k: "cyl", pos: [0, 0, 0], r: 0.123456, h: 2.987654, colour: "#fff" });
    expect(cyl.r).toBe(0.12);
    expect(cyl.h).toBe(2.99);
  });

  it("leaves everything that is not a number alone", () => {
    const p = quantPrim({ k: "sphere", pos: [1.005, 0, 0], r: 1, colour: "#ffd23f" });
    expect(p.k).toBe("sphere");
    expect(p.colour).toBe("#ffd23f");
  });

  it("does not mutate the prim it was given", () => {
    // The minigame's own state holds these; rounding in place would quietly quantize
    // the simulation itself, which is exactly the kind of drift I3 exists to prevent.
    const original = { k: "sphere" as const, pos: [1.23456, 0, 0] as [number, number, number], r: 0.35, colour: "#fff" };
    quantPrim(original);
    expect(original.pos[0]).toBe(1.23456);
  });

  it("actually shrinks the payload it was added for", () => {
    const pickups = Array.from({ length: 15 }, (_, i) => ({
      k: "sphere" as const,
      pos: [i * 1.3456789012345, 0.5512345678901234, i * -2.98765432109876] as [number, number, number],
      r: 0.35,
      colour: "#ffd23f",
    }));
    const before = JSON.stringify(pickups).length;
    const after = JSON.stringify(pickups.map(quantPrim)).length;
    // Measured at 34% off (1543 -> 1015), not the 38% first guessed. The bound is the
    // measurement, loosened only enough not to be brittle.
    expect(after).toBeLessThan(before * 0.70);
    // The number that matters: fifteen pickups must fit a 1240-byte TCP payload.
    expect(after).toBeLessThan(1240);
  });
});
