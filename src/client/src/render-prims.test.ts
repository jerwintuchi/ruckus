import { describe, expect, it } from "vitest";
import type { Prim } from "@ruckus/shared";
import { buildPrim } from "./render.ts";
import { GEO, materialCount } from "./kit/prims.ts";

const ALL: Prim[] = [
  { k: "box", pos: [1, 2, 3], size: [2, 3, 4], colour: "#112233" },
  { k: "cyl", pos: [-1, 0, 2], r: 0.7, h: 3, colour: "#445566" },
  { k: "sphere", pos: [0, 5, 0], r: 1.25, colour: "#778899" },
  { k: "plane", pos: [0, 0, 0], size: [8, 6], colour: "#aabbcc" },
];

describe("generic prims channel (hot-potato T2, R8)", () => {
  it("builds a mesh for every kind in the closed union", () => {
    for (const p of ALL) {
      const m = buildPrim(p);
      expect(m, p.k).toBeTruthy();
      expect(m.geometry, p.k).toBeTruthy();
      expect(m.material, p.k).toBeTruthy();
    }
  });

  it("places each mesh where the descriptor says", () => {
    for (const p of ALL) {
      const m = buildPrim(p);
      expect([m.position.x, m.position.y, m.position.z], p.k).toEqual(p.pos);
    }
  });

  it("reuses the Kit's cached geometries rather than allocating per prim", () => {
    // The mobile budget lives or dies on this: a minigame publishing prims every
    // tick at 20 Hz must not allocate geometry 20 times a second.
    const shared = new Set<object>(Object.values(GEO));
    for (const p of ALL) expect(shared.has(buildPrim(p).geometry)).toBe(true);
  });

  it("reuses cached materials, so repeated prims cost nothing new", () => {
    // Warm the cache, then assert a thousand more of the same colour add none.
    for (const p of ALL) buildPrim(p);
    const before = materialCount();
    for (let i = 0; i < 1000; i++) for (const p of ALL) buildPrim(p);
    expect(materialCount()).toBe(before);
  });

  it("scales from the unit geometries, so size is in the transform not the mesh", () => {
    const b = buildPrim({ k: "box", pos: [0, 0, 0], size: [2, 3, 4], colour: "#fff" });
    expect([b.scale.x, b.scale.y, b.scale.z]).toEqual([2, 3, 4]);

    const s = buildPrim({ k: "sphere", pos: [0, 0, 0], r: 1.5, colour: "#fff" });
    expect(s.scale.x).toBeCloseTo(3, 10); // unit sphere has radius 0.5
  });

  it("gives a distinct colour its own material, so prims are not silently merged", () => {
    const a = buildPrim({ k: "box", pos: [0, 0, 0], size: [1, 1, 1], colour: "#010203" });
    const b = buildPrim({ k: "box", pos: [0, 0, 0], size: [1, 1, 1], colour: "#040506" });
    expect(a.material).not.toBe(b.material);
  });
});
