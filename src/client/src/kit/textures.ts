/**
 * Procedural paper textures (visual-direction T1, R1–R2).
 *
 * Every texture in the game is written here into a `DataTexture` — no file, no loader,
 * so `kit_check.py` stays green **by construction** rather than by exemption (RD-001).
 *
 * Paper is a kinder subject for this than the PS1 direction would have been: PS1 wanted
 * texture *detail* — grime, panels, decals — which is exactly where hand-authoring
 * wins. Paper wants flat colour, a whisper of fibre and hard lines, which are cheaper
 * to write than to draw (RD-021).
 */
import { DataTexture, LinearFilter, RepeatWrapping, RGBAFormat, UnsignedByteType } from "three";
import { makeRng } from "@ruckus/shared";

/** PS1 textures were 64px and paper wants no more detail than that. */
export const TEX_SIZE = 64;

/**
 * How far `stock()` may stray from its tint.
 *
 * Visible at arm's length, invisible as noise. Push it up and the paper stops reading
 * as paper and starts reading as television static; a test holds the band.
 */
export const FIBRE_CONTRAST = 0.06;

type RGB = [number, number, number];

const hexToRgb = (hex: string): RGB => {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: RGB, b: RGB, t: number): RGB =>
  [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * Build a texture from a per-texel function.
 *
 * `LinearFilter` on purpose — paper is smooth. This is the one place the paper
 * direction inverts what the superseded PS1 spec asked for, which wanted hard texels.
 */
function build(fn: (x: number, y: number) => RGB): DataTexture {
  const px = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const c = fn(x, y);
      const i = (y * TEX_SIZE + x) * 4;
      px[i] = clamp255(c[0]);
      px[i + 1] = clamp255(c[1]);
      px[i + 2] = clamp255(c[2]);
      px[i + 3] = 255;
    }
  }
  const tex = new DataTexture(px, TEX_SIZE, TEX_SIZE, RGBAFormat, UnsignedByteType);
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Cache by argument signature.
 *
 * A minigame asking twice for the same surface gets the same GPU texture rather than a
 * second copy of identical bytes — and the Kit's rule is that nothing allocates per
 * frame (kit-rules.md).
 */
const cache = new Map<string, DataTexture>();
function cached(key: string, make: () => DataTexture): DataTexture {
  let tex = cache.get(key);
  if (!tex) {
    tex = make();
    cache.set(key, tex);
  }
  return tex;
}

/** Paper fibre — the base of every surface in the game. */
export function stock(tint: string, seed = 1): DataTexture {
  return cached(`stock:${tint}:${seed}`, () => {
    const base = hexToRgb(tint);
    const rng = makeRng(seed);
    const noise = Array.from({ length: TEX_SIZE * TEX_SIZE }, () => rng.next());
    return build((x, y) => {
      // Two samples a row apart, so the grain has a faint vertical bias like real pulp.
      const grain =
        noise[y * TEX_SIZE + x]! * 0.6 + noise[((y + 1) % TEX_SIZE) * TEX_SIZE + x]! * 0.4 - 0.5;
      const streak = Math.sin(y * 0.9 + noise[x]! * 6) * 0.25;
      const d = (grain + streak) * FIBRE_CONTRAST * 255;
      return [base[0] + d, base[1] + d, base[2] + d];
    });
  });
}

/** A fold: a soft valley with a lighter edge, along the surface's structural lines. */
export function crease(tint: string, dir: "h" | "v" | "cross" = "v"): DataTexture {
  return cached(`crease:${tint}:${dir}`, () => {
    const base = hexToRgb(tint);
    return build((x, y) => {
      const d = dir === "v" ? x : dir === "h" ? y : Math.min(x, y);
      const t = Math.abs((d % (TEX_SIZE / 2)) - TEX_SIZE / 4) / (TEX_SIZE / 4);
      const fold = Math.pow(1 - t, 8);
      const lit = fold > 0.6 ? 14 : 0;
      return [
        base[0] * (1 - fold * 0.14) + lit,
        base[1] * (1 - fold * 0.14) + lit,
        base[2] * (1 - fold * 0.14) + lit,
      ];
    });
  });
}

/**
 * A torn edge rather than a cut one.
 *
 * At least one element per arena uses this (R6), so the world is not uniformly
 * machine-cut — which is the difference between paper and plastic.
 */
export function deckle(tint: string, ground: string, seed = 1): DataTexture {
  return cached(`deckle:${tint}:${ground}:${seed}`, () => {
    const base = hexToRgb(tint);
    const bg = hexToRgb(ground);
    const rng = makeRng(seed);
    const edge = Array.from({ length: TEX_SIZE }, () => 6 + rng.next() * 7);
    return build((x, y) => {
      // Smoothed across neighbours so the tear is ragged, not spiky.
      const at = (i: number): number => edge[((i % TEX_SIZE) + TEX_SIZE) % TEX_SIZE]!;
      const line = (at(x - 1) + at(x) + at(x + 1)) / 3;
      if (y < line) return bg;
      if (y < line + 1.4) return mix(base, [0, 0, 0], 0.28); // the torn lip, in shadow
      return base;
    });
  });
}

/** Flat fill. The commonest surface there is, and worth having named. */
export function flat(tint: string): DataTexture {
  return cached(`flat:${tint}`, () => {
    const c = hexToRgb(tint);
    return build(() => c);
  });
}

export function checker(a: string, b: string, cells = 8): DataTexture {
  return cached(`checker:${a}:${b}:${cells}`, () => {
    const A = hexToRgb(a);
    const B = hexToRgb(b);
    const n = TEX_SIZE / cells;
    return build((x, y) => (((x / n) | 0) + ((y / n) | 0)) % 2 ? A : B);
  });
}

export function stripe(a: string, b: string, count = 6, diagonal = false): DataTexture {
  return cached(`stripe:${a}:${b}:${count}:${diagonal}`, () => {
    const A = hexToRgb(a);
    const B = hexToRgb(b);
    const n = TEX_SIZE / count;
    return build((x, y) => ((((diagonal ? x + y : x) / n) | 0) % 2 ? A : B));
  });
}

export function dot(a: string, ground: string, spacing = 16): DataTexture {
  return cached(`dot:${a}:${ground}:${spacing}`, () => {
    const D = hexToRgb(a);
    const G = hexToRgb(ground);
    const radius = spacing / 5;
    return build((x, y) =>
      Math.hypot((x % spacing) - spacing / 2, (y % spacing) - spacing / 2) < radius ? D : G,
    );
  });
}

export function grid(line: string, fill: string, cells = 8): DataTexture {
  return cached(`grid:${line}:${fill}:${cells}`, () => {
    const L = hexToRgb(line);
    const F = hexToRgb(fill);
    const n = TEX_SIZE / cells;
    return build((x, y) => (x % n === 0 || y % n === 0 ? L : F));
  });
}

/** How many distinct textures the kit has handed out. Asserted by the cache test. */
export function textureCount(): number {
  return cache.size;
}

/** Free every cached texture. Only for tests and teardown. */
export function disposeTextures(): void {
  for (const tex of cache.values()) tex.dispose();
  cache.clear();
}
