/**
 * Generated faces (visual-direction T3, R8).
 *
 * A paper face is dot eyes, a brow and a mouth — a handful of drawing primitives, not a
 * painting. That is what made the one part of the design that looked like it needed a
 * hand-drawn asset turn out not to (RD-021).
 *
 * `faceFor(slot)` varies four parameters from the slot seed, so the eight players get
 * eight *different* faces. One drawn texture could never do that, which makes this
 * strictly better than the thing the Kit forbids — and it finally builds the second
 * identity channel RD-007 named and could not fix from the palette side.
 */
import { DataTexture, LinearFilter, RGBAFormat, ClampToEdgeWrapping, UnsignedByteType } from "three";
import { makeRng } from "@ruckus/shared";
import { PAPER } from "./palette.ts";

/** Small on purpose: a face is read at arm's length on a phone, not inspected. */
export const FACE_SIZE = 40;

export const MOUTHS = ["line", "oh", "smile", "grimace"] as const;
export type Mouth = (typeof MOUTHS)[number];

/** The declared ranges. Tests hold every parameter inside them. */
export const FACE_RANGES = {
  /**
   * Eye separation, as a fraction of the width.
   *
   * Capped at 0.30 because the brow extends past the eye: at the old 0.44 the outer
   * brow reached x=44 on a 40px face and was silently clipped, so wide-set faces came
   * out with their eyebrows sliced off. A test holds the margin now.
   */
  spacing: [0.20, 0.30] as const,
  eye: [3, 5] as const,           // eye radius in pixels
  brow: [-13, 13] as const,       // degrees; cross to surprised
};

export interface FaceSpec {
  spacing: number;
  eye: number;
  brow: number;
  mouth: Mouth;
}

/** The parameters for a slot, without drawing anything — so they can be asserted. */
export function faceSpec(slot: number): FaceSpec {
  const r = makeRng(Math.imul(slot, 2654435761) + 11);
  const [sLo, sHi] = FACE_RANGES.spacing;
  const [eLo, eHi] = FACE_RANGES.eye;
  const [bLo, bHi] = FACE_RANGES.brow;
  return {
    spacing: r.range(sLo, sHi),
    eye: eLo + Math.floor(r.next() * (eHi - eLo + 1)),
    brow: r.range(bLo, bHi),
    mouth: MOUTHS[r.int(MOUTHS.length)]!,
  };
}

const hexToRgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const cache = new Map<string, DataTexture>();

/**
 * A face, inked on the player's colour.
 *
 * Clamped rather than repeating: a face is a decal on one slab face, and tiling it
 * would wrap an eye around the edge of the head.
 */
export function faceFor(slot: number, fill: string): DataTexture {
  const key = `${slot}:${fill}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const spec = faceSpec(slot);
  const base = hexToRgb(fill);
  const ink = hexToRgb(PAPER.ink);
  const px = new Uint8Array(FACE_SIZE * FACE_SIZE * 4);

  const put = (x: number, y: number, c: [number, number, number]): void => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    // Clipped, not wrapped: linework that ran off an edge would reappear on the other
    // side of the face. A test asserts every mark lands inside the bounds anyway.
    if (xi < 0 || yi < 0 || xi >= FACE_SIZE || yi >= FACE_SIZE) return;
    const i = (yi * FACE_SIZE + xi) * 4;
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
    px[i + 3] = 255;
  };

  for (let y = 0; y < FACE_SIZE; y++) for (let x = 0; x < FACE_SIZE; x++) put(x, y, base);

  const disc = (cx: number, cy: number, r: number): void => {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) put(cx + x, cy + y, ink);
    }
  };

  const cx = FACE_SIZE / 2;
  const ex = spec.spacing * FACE_SIZE;
  const ey = FACE_SIZE * 0.40;
  disc(cx - ex, ey, spec.eye);
  disc(cx + ex, ey, spec.eye);

  // Brows: a short run tilted by the brow angle, mirrored so they meet or part.
  const rad = (spec.brow * Math.PI) / 180;
  for (const side of [-1, 1]) {
    // No overhang past the eye: the outer end is already close to the edge.
    for (let t = -spec.eye; t <= spec.eye; t++) {
      const bx = cx + side * ex + t;
      const by = ey - spec.eye - 4 + Math.tan(rad) * t * side;
      put(bx, by, ink);
      put(bx, by + 1, ink);
    }
  }

  const my = FACE_SIZE * 0.68;
  if (spec.mouth === "line") {
    for (let x = -6; x <= 6; x++) { put(cx + x, my, ink); put(cx + x, my + 1, ink); }
  } else if (spec.mouth === "oh") {
    disc(cx, my + 1, 4);
  } else if (spec.mouth === "smile") {
    for (let x = -7; x <= 7; x++) {
      const y = my + Math.round(Math.cos((x / 7) * 1.35) * -3) + 3;
      put(cx + x, y, ink);
      put(cx + x, y + 1, ink);
    }
  } else {
    for (let x = -7; x <= 7; x++) { put(cx + x, my, ink); put(cx + x, my + 4, ink); }
    for (let x = -7; x <= 7; x += 3) for (let y = 0; y <= 4; y++) put(cx + x, my + y, ink);
  }

  const tex = new DataTexture(px, FACE_SIZE, FACE_SIZE, RGBAFormat, UnsignedByteType);
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}

export function faceCount(): number {
  return cache.size;
}

export function disposeFaces(): void {
  for (const tex of cache.values()) tex.dispose();
  cache.clear();
}
