import { describe, expect, it } from "vitest";
import { makeRng, seedFrom } from "./rng.ts";

describe("makeRng (T1, R7, P5)", () => {
  it("gives an identical sequence for the same seed", () => {
    const a = makeRng(12345);
    const b = makeRng(12345);
    let mismatches = 0;
    for (let i = 0; i < 100_000; i++) if (a.next() !== b.next()) mismatches++;
    expect(mismatches).toBe(0);
  });

  it("diverges quickly for different seeds", () => {
    const a = makeRng(1);
    const b = makeRng(2);
    const draws = Array.from({ length: 4 }, () => [a.next(), b.next()]);
    expect(draws.some(([x, y]) => x !== y)).toBe(true);
  });

  it("stays in [0, 1)", () => {
    // Collect and assert once rather than calling expect() per draw: 100k matcher
    // invocations cost seconds and report the same single fact.
    const r = makeRng(999);
    let outOfRange = 0;
    let min = 1;
    let max = 0;
    for (let i = 0; i < 200_000; i++) {
      const v = r.next();
      if (!(v >= 0 && v < 1)) outOfRange++;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    expect(outOfRange).toBe(0);
    // Also assert it actually spans the range, so a constant 0.5 would not pass.
    expect(min).toBeLessThan(0.01);
    expect(max).toBeGreaterThan(0.99);
  });

  it("handles a negative or fractional seed without diverging from its own repeat", () => {
    expect(makeRng(-7).next()).toBe(makeRng(-7).next());
    expect(makeRng(3.7).next()).toBe(makeRng(3.7).next());
  });

  it("int(n) covers [0, n) and never returns n", () => {
    const r = makeRng(42);
    const seen = new Set<number>();
    let bad = 0;
    for (let i = 0; i < 20_000; i++) {
      const v = r.int(6);
      if (!Number.isInteger(v) || v < 0 || v >= 6) bad++;
      seen.add(v);
    }
    expect(bad).toBe(0);
    expect(seen.size).toBe(6);
  });

  it("shuffles as a permutation, deterministically", () => {
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = makeRng(77).shuffle([...src]);
    const b = makeRng(77).shuffle([...src]);
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(src);
  });

  it("pick throws on an empty list rather than returning undefined", () => {
    expect(() => makeRng(1).pick([])).toThrow();
  });
});

describe("seedFrom", () => {
  it("is stable per (code, round) and differs across both", () => {
    expect(seedFrom("ABCD", 0)).toBe(seedFrom("ABCD", 0));
    expect(seedFrom("ABCD", 0)).not.toBe(seedFrom("ABCD", 1));
    expect(seedFrom("ABCD", 0)).not.toBe(seedFrom("ABCE", 0));
  });

  it("returns a uint32", () => {
    const s = seedFrom("ZZZZ", 3);
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(2 ** 32);
  });
});
