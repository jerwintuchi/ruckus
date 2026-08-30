import { describe, expect, it } from "vitest";
import { makeRng } from "@ruckus/shared";
import { Bag } from "./select.ts";

describe("Bag (T9, R4)", () => {
  it("never repeats before the bag empties", () => {
    const items = ["a", "b", "c", "d", "e"];
    for (let seed = 0; seed < 100; seed++) {
      const bag = new Bag(items, makeRng(seed));
      const drawn = Array.from({ length: items.length }, () => bag.next());
      expect(new Set(drawn).size).toBe(items.length);
    }
  });

  it("refills and keeps dealing past the first cycle", () => {
    const bag = new Bag(["a", "b"], makeRng(1));
    const drawn = Array.from({ length: 20 }, () => bag.next());
    expect(drawn).toHaveLength(20);
    expect(new Set(drawn)).toEqual(new Set(["a", "b"]));
  });

  it("gives the same order for the same seed", () => {
    const items = [1, 2, 3, 4, 5, 6];
    const a = new Bag(items, makeRng(42));
    const b = new Bag(items, makeRng(42));
    for (let i = 0; i < 30; i++) expect(a.next()).toBe(b.next());
  });

  it("works with a single item — the case on day one", () => {
    const bag = new Bag(["only"], makeRng(7));
    expect([bag.next(), bag.next(), bag.next()]).toEqual(["only", "only", "only"]);
  });

  it("refuses an empty pool rather than returning undefined later", () => {
    expect(() => new Bag([], makeRng(1))).toThrow();
  });
});
