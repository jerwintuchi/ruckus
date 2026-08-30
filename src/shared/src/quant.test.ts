import { describe, expect, it } from "vitest";
import { dequantAngle, dequantPos, quantAngle, quantPos } from "./quant.ts";
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
