import { describe, expect, it, beforeEach } from "vitest";
import { LinearFilter, RepeatWrapping } from "three";
import {
  FIBRE_CONTRAST, TEX_SIZE, checker, crease, deckle, disposeTextures, dot, flat,
  grid, stock, stripe, textureCount,
} from "./textures.ts";
import { PAPER } from "./palette.ts";

/** Every generator, with arguments, so each property can be asserted across all of them. */
const ALL = () => [
  ["stock", stock(PAPER.card, 3)],
  ["crease", crease(PAPER.card, "v")],
  ["deckle", deckle(PAPER.card, PAPER.ground, 5)],
  ["flat", flat(PAPER.card)],
  ["checker", checker(PAPER.card, PAPER.cardDim, 8)],
  ["stripe", stripe(PAPER.card, PAPER.cardDim, 6)],
  ["dot", dot(PAPER.ink, PAPER.card, 16)],
  ["grid", grid(PAPER.ink, PAPER.card, 8)],
] as const;

const texels = (t: { image: { data: ArrayLike<number> } }): number[] =>
  Array.from(t.image.data as ArrayLike<number>);

beforeEach(() => disposeTextures());

describe("every texture is built for paper (T1, R2)", () => {
  it("is 64x64 with an alpha channel", () => {
    for (const [name, tex] of ALL()) {
      expect(tex.image.width, name).toBe(TEX_SIZE);
      expect(tex.image.height, name).toBe(TEX_SIZE);
      expect(tex.image.data.length, name).toBe(TEX_SIZE * TEX_SIZE * 4);
    }
  });

  it("filters smoothly and tiles", () => {
    // LinearFilter is the one place this direction inverts the superseded PS1 spec,
    // which wanted hard texels. Paper is smooth.
    for (const [name, tex] of ALL()) {
      expect(tex.magFilter, name).toBe(LinearFilter);
      expect(tex.minFilter, name).toBe(LinearFilter);
      expect(tex.wrapS, name).toBe(RepeatWrapping);
      expect(tex.wrapT, name).toBe(RepeatWrapping);
    }
  });

  it("is fully opaque — nothing here is a cut-out mask", () => {
    for (const [name, tex] of ALL()) {
      const data = tex.image.data;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] !== 255) throw new Error(`${name} has a transparent texel at ${i}`);
      }
    }
  });

  it("produces something, never a blank sheet", () => {
    for (const [name, tex] of ALL()) {
      if (name === "flat") continue; // flat is meant to be uniform
      expect(new Set(texels(tex)).size, name).toBeGreaterThan(1);
    }
  });
});

describe("generation is deterministic (T1, P2)", () => {
  it("gives byte-identical texels for identical arguments", () => {
    for (let run = 0; run < 3; run++) {
      disposeTextures();
      const first = ALL().map(([name, tex]) => [name, texels(tex)] as const);
      disposeTextures();
      const second = ALL().map(([name, tex]) => [name, texels(tex)] as const);
      for (let i = 0; i < first.length; i++) {
        expect(second[i]![1], first[i]![0]).toEqual(first[i]![1]);
      }
    }
  });

  it("changes with the seed, so a second surface is not the first one again", () => {
    expect(texels(stock(PAPER.card, 1))).not.toEqual(texels(stock(PAPER.card, 2)));
    expect(texels(deckle(PAPER.card, PAPER.ground, 1)))
      .not.toEqual(texels(deckle(PAPER.card, PAPER.ground, 2)));
  });

  it("changes with the tint", () => {
    expect(texels(flat(PAPER.card))).not.toEqual(texels(flat(PAPER.cardDim)));
  });
});

describe("the cache hands back the same object (T1)", () => {
  it("returns one texture per argument signature", () => {
    const a = stock(PAPER.card, 3);
    const b = stock(PAPER.card, 3);
    expect(b).toBe(a);
    expect(textureCount()).toBe(1);
  });

  it("treats different arguments as different textures", () => {
    stock(PAPER.card, 3);
    stock(PAPER.card, 4);
    stock(PAPER.cardDim, 3);
    expect(textureCount()).toBe(3);
  });

  it("does not grow when a minigame asks a thousand times", () => {
    // The Kit's rule: nothing allocates per frame.
    for (let i = 0; i < 1000; i++) checker(PAPER.card, PAPER.cardDim, 8);
    expect(textureCount()).toBe(1);
  });
});

describe("stock reads as paper, not as static (T1, R2)", () => {
  const luma = (t: { image: { data: ArrayLike<number> } }): number[] => {
    const out: number[] = [];
    const d = t.image.data;
    for (let i = 0; i < d.length; i += 4) out.push(0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!);
    return out;
  };

  it("stays inside the tonal band FIBRE_CONTRAST allows", () => {
    const tex = stock(PAPER.card, 9);
    const values = luma(tex);
    const spread = Math.max(...values) - Math.min(...values);
    // The whole point of the constant: a whisper, not a texture in its own right.
    expect(spread).toBeLessThan(FIBRE_CONTRAST * 255 * 2.2);
    expect(spread).toBeGreaterThan(2); // but not so faint it may as well be flat
  });

  it("holds that band for every seed", () => {
    for (let seed = 0; seed < 30; seed++) {
      disposeTextures();
      const values = luma(stock(PAPER.card, seed));
      const spread = Math.max(...values) - Math.min(...values);
      expect(spread, `seed ${seed}`).toBeLessThan(FIBRE_CONTRAST * 255 * 2.2);
    }
  });

  it("stays near its tint rather than drifting to another colour", () => {
    const tex = stock(PAPER.card, 4);
    const d = tex.image.data;
    const base = Number.parseInt(PAPER.card.slice(1), 16);
    const want = [(base >> 16) & 255, (base >> 8) & 255, base & 255];
    let worst = 0;
    for (let i = 0; i < d.length; i += 4) {
      for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(d[i + k]! - want[k]!));
    }
    expect(worst).toBeLessThan(FIBRE_CONTRAST * 255 * 1.6);
  });
});

describe("the patterned generators put ink where they say (T1)", () => {
  const px = (t: { image: { data: ArrayLike<number> } }, x: number, y: number): number[] => {
    const i = (y * TEX_SIZE + x) * 4;
    return [t.image.data[i]!, t.image.data[i + 1]!, t.image.data[i + 2]!];
  };
  const ink = [0x1b, 0x1a, 0x17];

  it("checker alternates on its cell grid", () => {
    const t = checker("#000000", "#ffffff", 8);
    const cell = TEX_SIZE / 8;
    expect(px(t, 0, 0)).not.toEqual(px(t, cell, 0));
    expect(px(t, 0, 0)).toEqual(px(t, cell * 2, 0));
  });

  it("grid draws lines on the cell boundaries and leaves the middle alone", () => {
    const t = grid(PAPER.ink, "#ffffff", 8);
    expect(px(t, 0, 5)).toEqual(ink);
    expect(px(t, 4, 5)).toEqual([255, 255, 255]);
  });

  it("dot puts a dot at each spacing centre and nothing between", () => {
    const t = dot(PAPER.ink, "#ffffff", 16);
    expect(px(t, 8, 8)).toEqual(ink);
    expect(px(t, 0, 0)).toEqual([255, 255, 255]);
  });

  it("stripe runs diagonally when asked", () => {
    const straight = stripe("#000000", "#ffffff", 8, false);
    const diagonal = stripe("#000000", "#ffffff", 8, true);
    expect(texels(straight)).not.toEqual(texels(diagonal));
  });

  it("deckle tears along the top and leaves the body intact", () => {
    const t = deckle(PAPER.card, PAPER.ground, 3);
    const ground = [0xcf, 0xe4, 0xf2];
    expect(px(t, 0, 0)).toEqual(ground);              // above the tear: the ground
    expect(px(t, 0, TEX_SIZE - 1)).not.toEqual(ground); // below it: paper
  });

  it("crease brightens along the fold and not away from it", () => {
    const t = crease("#808080", "v");
    const onFold = px(t, TEX_SIZE / 4, 10)[0]!;
    const away = px(t, 0, 10)[0]!;
    expect(onFold).not.toBe(away);
  });
});
