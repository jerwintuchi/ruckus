import { beforeEach, describe, expect, it } from "vitest";
import { ClampToEdgeWrapping } from "three";
import { PLAYER_COLOURS } from "@ruckus/shared";
import {
  FACE_RANGES, FACE_SIZE, MOUTHS, disposeFaces, faceCount, faceFor, faceSpec,
} from "./face.ts";
import { PAPER } from "./palette.ts";

const texels = (t: { image: { data: ArrayLike<number> } }): number[] =>
  Array.from(t.image.data as ArrayLike<number>);
const SLOTS = [0, 1, 2, 3, 4, 5, 6, 7];

beforeEach(() => disposeFaces());

describe("every parameter stays inside its declared range (T3)", () => {
  it("holds for all eight slots", () => {
    for (const slot of SLOTS) {
      const s = faceSpec(slot);
      expect(s.spacing, `slot ${slot}`).toBeGreaterThanOrEqual(FACE_RANGES.spacing[0]);
      expect(s.spacing, `slot ${slot}`).toBeLessThanOrEqual(FACE_RANGES.spacing[1]);
      expect(s.eye, `slot ${slot}`).toBeGreaterThanOrEqual(FACE_RANGES.eye[0]);
      expect(s.eye, `slot ${slot}`).toBeLessThanOrEqual(FACE_RANGES.eye[1]);
      expect(Number.isInteger(s.eye), `slot ${slot}`).toBe(true);
      expect(s.brow, `slot ${slot}`).toBeGreaterThanOrEqual(FACE_RANGES.brow[0]);
      expect(s.brow, `slot ${slot}`).toBeLessThanOrEqual(FACE_RANGES.brow[1]);
      expect(MOUTHS, `slot ${slot}`).toContain(s.mouth);
    }
  });

  it("holds for slots far outside the roster, so a stray index cannot throw", () => {
    for (const slot of [-5, 99, 1000, 2 ** 20]) {
      const s = faceSpec(slot);
      expect(Number.isFinite(s.spacing)).toBe(true);
      expect(MOUTHS).toContain(s.mouth);
    }
  });
});

describe("the eight faces are different (T3, P3, R8)", () => {
  it("produces eight pairwise-distinct texel arrays", () => {
    // Asserted by comparison rather than by eye — this is the second identity channel
    // RD-007 named and could not fix from the palette side.
    const faces = SLOTS.map((s) => texels(faceFor(s, PLAYER_COLOURS[s]!)));
    for (let i = 0; i < faces.length; i++) {
      for (let j = i + 1; j < faces.length; j++) {
        expect(faces[i], `slots ${i} and ${j} are identical`).not.toEqual(faces[j]);
      }
    }
  });

  it("differs in the drawing, not merely in the fill colour", () => {
    // The strong version: draw every slot on the SAME colour and they must still differ.
    const faces = SLOTS.map((s) => texels(faceFor(s, "#888888")));
    const unique = new Set(faces.map((f) => f.join(",")));
    expect(unique.size).toBe(SLOTS.length);
  });

  it("uses more than one mouth across the roster", () => {
    const mouths = new Set(SLOTS.map((s) => faceSpec(s).mouth));
    expect(mouths.size).toBeGreaterThan(1);
  });
});

describe("generation is deterministic (T3)", () => {
  it("gives byte-identical texels for the same slot and colour", () => {
    for (const slot of SLOTS) {
      const a = texels(faceFor(slot, PLAYER_COLOURS[slot]!));
      disposeFaces();
      const b = texels(faceFor(slot, PLAYER_COLOURS[slot]!));
      expect(b, `slot ${slot}`).toEqual(a);
    }
  });

  it("caches one texture per slot and colour", () => {
    const a = faceFor(3, PLAYER_COLOURS[3]!);
    expect(faceFor(3, PLAYER_COLOURS[3]!)).toBe(a);
    expect(faceCount()).toBe(1);
    faceFor(3, "#123456");
    expect(faceCount()).toBe(2);
  });
});

describe("the linework lands on the face (T3)", () => {
  const INK = [0x1b, 0x1a, 0x17];
  const at = (t: { image: { data: ArrayLike<number> } }, x: number, y: number): number[] => {
    const i = (y * FACE_SIZE + x) * 4;
    return [t.image.data[i]!, t.image.data[i + 1]!, t.image.data[i + 2]!];
  };

  it("draws ink inside the bounds for every slot", () => {
    for (const slot of SLOTS) {
      const tex = faceFor(slot, "#ffffff");
      const d = tex.image.data;
      let inked = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] === INK[0] && d[i + 1] === INK[1] && d[i + 2] === INK[2]) inked++;
      }
      // Enough to be a face, nowhere near enough to be a blot.
      expect(inked, `slot ${slot}`).toBeGreaterThan(40);
      expect(inked, `slot ${slot}`).toBeLessThan(FACE_SIZE * FACE_SIZE * 0.35);
    }
  });

  it("leaves a clear margin, so nothing runs off an edge", () => {
    for (const slot of SLOTS) {
      const tex = faceFor(slot, "#ffffff");
      for (let i = 0; i < FACE_SIZE; i++) {
        for (const [x, y] of [[i, 0], [i, FACE_SIZE - 1], [0, i], [FACE_SIZE - 1, i]]) {
          expect(at(tex, x!, y!), `slot ${slot} edge (${x},${y})`).toEqual([255, 255, 255]);
        }
      }
    }
  });

  it("puts both eyes above the mouth, for every slot", () => {
    for (const slot of SLOTS) {
      const tex = faceFor(slot, "#ffffff");
      const d = tex.image.data;
      let topInk = FACE_SIZE;
      let bottomInk = 0;
      for (let y = 0; y < FACE_SIZE; y++) {
        for (let x = 0; x < FACE_SIZE; x++) {
          const i = (y * FACE_SIZE + x) * 4;
          if (d[i] === INK[0] && d[i + 1] === INK[1] && d[i + 2] === INK[2]) {
            topInk = Math.min(topInk, y);
            bottomInk = Math.max(bottomInk, y);
          }
        }
      }
      expect(topInk, `slot ${slot}`).toBeLessThan(FACE_SIZE * 0.45);   // brows and eyes
      expect(bottomInk, `slot ${slot}`).toBeGreaterThan(FACE_SIZE * 0.6); // the mouth
    }
  });

  it("is opaque, and fills the rest with the player's colour", () => {
    const tex = faceFor(0, PAPER.card);
    const d = tex.image.data;
    for (let i = 3; i < d.length; i += 4) expect(d[i]).toBe(255);
    expect(at(tex, 1, 1)).toEqual([0xfd, 0xf8, 0xee]);
  });

  it("clamps rather than tiling — an eye must not wrap around the head", () => {
    const tex = faceFor(0, "#ffffff");
    expect(tex.wrapS).toBe(ClampToEdgeWrapping);
    expect(tex.wrapT).toBe(ClampToEdgeWrapping);
  });
});
