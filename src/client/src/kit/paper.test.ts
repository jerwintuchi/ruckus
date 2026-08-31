import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MeshBasicMaterial, MeshLambertMaterial, type Material, type Mesh } from "three";
import {
  BACK_FACE, EDGE_FACES, FACE_ORDER, FRONT_FACE, PIXEL_RATIO_CAP, SLAB_DEPTH,
  disposePaper, invertedHull, lit, materialCount, outlinedCylinder, slab, unlit,
} from "./paper.ts";
import { PAPER } from "./palette.ts";
import { faceFor } from "./face.ts";

const SRC = join(new URL(".", import.meta.url).pathname, "..");
const read = (rel: string): string => readFileSync(join(SRC, rel), "utf8");
const mats = (m: Mesh): Material[] => m.material as Material[];
const colourOf = (m: Material): number => (m as unknown as { color: { getHex(): number } }).color.getHex();
const INK = Number.parseInt(PAPER.ink.slice(1), 16);

beforeEach(() => disposePaper());

describe("a slab outlines itself (T8, R4, P1)", () => {
  it("paints its four edge faces ink and its front and back the colour", () => {
    // BoxGeometry's group order is +X -X +Y -Y +Z -Z. The whole trick depends on it.
    expect(FACE_ORDER).toEqual(["+X", "-X", "+Y", "-Y", "+Z", "-Z"]);
    const m = slab("#1ab0ff", 0.6, 0.7);
    const materials = mats(m);
    expect(materials).toHaveLength(6);
    for (const i of EDGE_FACES) expect(colourOf(materials[i]!), FACE_ORDER[i]).toBe(INK);
    expect(colourOf(materials[FRONT_FACE]!)).toBe(0x1ab0ff);
    expect(colourOf(materials[BACK_FACE]!)).toBe(0x1ab0ff);
  });

  it("puts size in the transform, so one geometry serves every slab", () => {
    const a = slab("#1ab0ff", 0.6, 0.7);
    const b = slab("#ff3f18", 0.2, 0.5);
    expect(a.geometry).toBe(b.geometry);
    expect([a.scale.x, a.scale.y, a.scale.z]).toEqual([0.6, 0.7, SLAB_DEPTH]);
  });

  it("takes a face texture on the front face only", () => {
    const face = faceFor(0, "#1ab0ff");
    const m = slab("#1ab0ff", 0.44, 0.44, SLAB_DEPTH, { front: face });
    const materials = mats(m);
    expect((materials[FRONT_FACE] as MeshBasicMaterial).map).toBe(face);
    expect((materials[BACK_FACE] as MeshBasicMaterial).map).toBeFalsy();
    for (const i of EDGE_FACES) expect((materials[i] as MeshBasicMaterial).map).toBeFalsy();
  });

  it("is thin enough to read as paper and thick enough to read as an outline", () => {
    expect(SLAB_DEPTH).toBeGreaterThan(0.03);
    expect(SLAB_DEPTH).toBeLessThan(0.15);
  });
});

describe("materials are unlit for paper, soft for the arena (T9, R5)", () => {
  it("gives characters unlit fill — paper does not receive light", () => {
    expect(unlit("#1ab0ff")).toBeInstanceOf(MeshBasicMaterial);
    for (const m of mats(slab("#1ab0ff", 1, 1))) expect(m).toBeInstanceOf(MeshBasicMaterial);
  });

  it("gives arena surfaces a lit material when asked", () => {
    expect(lit("#f2e9d6")).toBeInstanceOf(MeshLambertMaterial);
    const materials = mats(slab("#f2e9d6", 1, 1, SLAB_DEPTH, { shaded: true }));
    expect(materials[FRONT_FACE]).toBeInstanceOf(MeshLambertMaterial);
    expect(materials[BACK_FACE]).toBeInstanceOf(MeshLambertMaterial);
  });

  it("keeps the ink edge unlit even on a shaded slab", () => {
    // The outline must be a constant hard black. Shading it would make the outline
    // brighten and dim with the light, which is the one thing an ink line must not do.
    const materials = mats(slab("#f2e9d6", 1, 1, SLAB_DEPTH, { shaded: true }));
    for (const i of EDGE_FACES) {
      expect(materials[i], FACE_ORDER[i]).toBeInstanceOf(MeshBasicMaterial);
      expect(colourOf(materials[i]!), FACE_ORDER[i]).toBe(INK);
    }
  });

  it("caches materials, so a crowd of slabs is not a crowd of materials", () => {
    for (let i = 0; i < 200; i++) slab("#1ab0ff", 0.6, 0.7);
    // One colour plus ink.
    expect(materialCount()).toBe(2);
  });
});

describe("the outline costs nothing per frame (T8, P1)", () => {
  const renderSrc = read("render.ts");

  it("declares no fullscreen pass and no render target", () => {
    for (const forbidden of ["WebGLRenderTarget", "EffectComposer", "ShaderPass", "fullscreen"]) {
      expect(renderSrc, forbidden).not.toContain(forbidden);
    }
  });

  it("requires no depth texture — nothing edge-detects from a buffer", () => {
    for (const forbidden of ["DepthTexture", "depthTexture", "readRenderTargetPixels"]) {
      expect(renderSrc, forbidden).not.toContain(forbidden);
    }
  });

  it("never enables a shadow map, and never sets fog", () => {
    expect(renderSrc).toContain("shadowMap.enabled = false");
    expect(renderSrc).toContain("this.scene.fog = null");
    expect(renderSrc).not.toMatch(/new\s+(Fog|FogExp2)\b/);
  });

  it("caps the pixel ratio", () => {
    expect(PIXEL_RATIO_CAP).toBe(2);
    expect(renderSrc).toContain("PIXEL_RATIO_CAP");
  });
});

describe("the inverted hull is opt-in, never global (T8, R4)", () => {
  it("outlines only the mesh handed to it", () => {
    const source = slab("#1ab0ff", 1, 1);
    const hull = invertedHull(source);
    expect(hull.geometry).toBe(source.geometry);
    expect(colourOf(hull.material as Material)).toBe(INK);
    expect(hull.scale.x).toBeGreaterThan(source.scale.x);
    expect(hull.renderOrder).toBeLessThan(0); // drawn behind what it outlines
  });

  it("gives a cylinder its outline as a second mesh, not a shader", () => {
    const parts = outlinedCylinder(PAPER.card, 0.4, 1);
    expect(parts).toHaveLength(2);
    expect(colourOf(parts[0]!.material as Material)).toBe(INK); // the hull first
  });

  it("is not applied to slabs, which outline themselves for free", () => {
    const characterSrc = read("kit/character.ts");
    expect(characterSrc).not.toContain("invertedHull");
  });
});
