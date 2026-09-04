import { describe, expect, it } from "vitest";
import { PLAYER_COLOURS as SHARED_COLOURS } from "@ruckus/shared";
import {
  PALETTE, PAPER, PLAYER_COLOURS, contrast, hexToInt, luminance, readableInk, statusColour, tint,
} from "./palette.ts";

/* sRGB -> CIE Lab, then CIE76 deltaE. Enough to catch "these two look the same". */

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = hexToInt(hex);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function toLab(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear) as [number, number, number];
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.9505;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.089;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

const deltaE = (a: string, b: string): number => {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
};

/**
 * Brettel-style LMS simulation of the two common dichromacies. Approximate, but the
 * failure it catches — a red/green pair that collapses to one colour — is gross, not
 * subtle, and an approximation catches gross failures fine.
 */
function simulate(hex: string, kind: "deuter" | "prot"): string {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear) as [number, number, number];
  const l = 0.31399 * r + 0.63951 * g + 0.04649 * b;
  const m = 0.15537 * r + 0.75789 * g + 0.08670 * b;
  const s = 0.01775 * r + 0.10944 * g + 0.87262 * b;

  let l2 = l;
  let m2 = m;
  if (kind === "deuter") m2 = 0.494207 * l + 1.24827 * s;
  else l2 = 2.02344 * m - 2.52581 * s;

  const rr = 5.47221 * l2 - 4.6419 * m2 + 0.16963 * s;
  const gg = -1.1252 * l2 + 2.29317 * m2 - 0.1678 * s;
  const bb = 0.02998 * l2 - 0.19318 * m2 + 1.16364 * s;

  const back = (c: number): number => {
    const v = Math.max(0, Math.min(1, c));
    const srgb = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.round(srgb * 255);
  };
  return `#${[back(rr), back(gg), back(bb)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

describe("player colours (T14, RD-005)", () => {
  it("provides exactly eight, matching MAX_PLAYERS", () => {
    expect(PLAYER_COLOURS).toHaveLength(8);
    expect(new Set(PLAYER_COLOURS).size).toBe(8);
  });

  it("comes from shared, so the server and client cannot disagree by construction", () => {
    // Previously this asserted two copies matched. One definition is better than two
    // and a test, so the copies were merged into @ruckus/shared.
    expect(PLAYER_COLOURS).toBe(SHARED_COLOURS);
  });

  it("keeps every pair distinct to normal colour vision", () => {
    for (let i = 0; i < PLAYER_COLOURS.length; i++) {
      for (let j = i + 1; j < PLAYER_COLOURS.length; j++) {
        const d = deltaE(PLAYER_COLOURS[i]!, PLAYER_COLOURS[j]!);
        expect(d, `${PLAYER_COLOURS[i]} vs ${PLAYER_COLOURS[j]}`).toBeGreaterThan(25);
      }
    }
  });

  it("keeps every pair distinct under deuteranopia and protanopia", () => {
    for (const kind of ["deuter", "prot"] as const) {
      for (let i = 0; i < PLAYER_COLOURS.length; i++) {
        for (let j = i + 1; j < PLAYER_COLOURS.length; j++) {
          const d = deltaE(simulate(PLAYER_COLOURS[i]!, kind), simulate(PLAYER_COLOURS[j]!, kind));
          // 25, not a token 10: the palette clears 32, so this leaves room to retune
          // colours without letting a genuine collapse back in (RD-007).
          expect(d, `${kind}: ${PLAYER_COLOURS[i]} vs ${PLAYER_COLOURS[j]}`).toBeGreaterThan(25);
        }
      }
    }
  });

  it("reads clearly against the arena, not just against each other", () => {
    for (const c of PLAYER_COLOURS) {
      expect(deltaE(c, PALETTE.floor), `${c} vs floor`).toBeGreaterThan(25);
      expect(deltaE(c, PALETTE.sky), `${c} vs sky`).toBeGreaterThan(25);
    }
  });
});

describe("palette hygiene (T14)", () => {
  it("is all well-formed six-digit hex", () => {
    for (const [name, hex] of Object.entries(PALETTE)) {
      expect(hex, name).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("converts to the integers three.js wants", () => {
    expect(hexToInt("#ffffff")).toBe(0xffffff);
    expect(hexToInt("#000000")).toBe(0);
    expect(hexToInt("#2f9bff")).toBe(0x2f9bff);
  });
});

describe("the arena moved to paper stock (visual-direction T4, R3)", () => {
  it("leaves the eight player colours untouched", () => {
    // RD-007's dichromacy search has nothing to do with style, so a change of look
    // must not disturb it. The tests above still hold; this pins the intent.
    expect(PLAYER_COLOURS).toEqual([
      "#1ab0ff", "#ff3f18", "#ffef14", "#69f982",
      "#b013b0", "#875e35", "#08865a", "#870909",
    ]);
  });

  it("makes the arena light rather than a void", () => {
    const luma = (hex: string): number => {
      const n = hexToInt(hex);
      return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
    };
    for (const token of ["sky", "floor", "floorEdge", "panel"] as const) {
      expect(luma(PALETTE[token]), token).toBeGreaterThan(140);
    }
  });

  it("keeps ink legible on every paper ground it outlines", () => {
    // WCAG contrast: ink must stay readable on anything it is drawn against.
    const lum = (hex: string): number => {
      const n = hexToInt(hex);
      const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
    };
    const ratio = (a: string, b: string): number => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x! + 0.05) / (y! + 0.05);
    };
    for (const ground of [PAPER.card, PAPER.cardDim, PAPER.ground, PALETTE.floor]) {
      expect(ratio(PAPER.ink, ground), ground).toBeGreaterThan(7);
    }
  });

  it("still declares every token as well-formed hex", () => {
    for (const [name, hex] of Object.entries({ ...PALETTE, ...PAPER })) {
      expect(hex, name).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("your colour is readable, measured not hoped (ui-identity T6, R5)", () => {
  it("computes real WCAG luminance, checked against known values", () => {
    // The maths itself, pinned first — every claim below rests on it, so a test that
    // compared these functions to themselves would prove nothing.
    expect(luminance("#ffffff")).toBeCloseTo(1, 4);
    expect(luminance("#000000")).toBeCloseTo(0, 4);
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 1);
  });

  it("gives every player a readable label on a tinted button", () => {
    // 4.5:1 is the text threshold. Raw maroon is 1.72:1, which is why the tint exists.
    for (const c of PLAYER_COLOURS) {
      expect(contrast(tint(c), PAPER.ink), c).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("gives every player a readable glyph on a full-strength icon button", () => {
    // 3:1 is the threshold for a graphical object, which a thick icon is.
    for (const c of PLAYER_COLOURS) {
      expect(contrast(c, readableInk(c)), c).toBeGreaterThanOrEqual(3);
    }
  });

  it("pins the failures that make the rule necessary", () => {
    // Regression, not trivia. If someone later decides the tint is fussy and drops it,
    // these are the numbers that say why it was there.
    const maroon = PLAYER_COLOURS[7]!;
    expect(contrast(maroon, PAPER.ink)).toBeLessThan(2);
    const forest = PLAYER_COLOURS[6]!;
    expect(contrast(forest, PAPER.ink)).toBeLessThan(4.5);
    expect(contrast(forest, PAPER.card)).toBeLessThan(4.5);
  });

  it("leaves the palette itself alone", () => {
    // Load-bearing for colour-blindness and for distinctness at phone size. A button
    // fill is not worth retuning them for.
    expect(PLAYER_COLOURS).toHaveLength(8);
    expect(PLAYER_COLOURS[7]).toBe("#870909");
    expect(PLAYER_COLOURS[6]).toBe("#08865a");
  });

  it("tints toward paper, never away from it", () => {
    for (const c of PLAYER_COLOURS) {
      expect(luminance(tint(c)), c).toBeGreaterThan(luminance(c));
      expect(tint(c, 1)).toBe(PAPER.card.toLowerCase());
      expect(tint(c, 0)).toBe(c.toLowerCase());
    }
  });
});

describe("statusColour is the one urgency ramp (round-countdown R3, round-status R1)", () => {
  it("walks ok -> warn -> caution -> hazard as time runs out", () => {
    expect(statusColour(1)).toBe(PALETTE.ok);
    expect(statusColour(0.4)).toBe(PALETTE.warn);
    expect(statusColour(0.2)).toBe(PALETTE.caution);
    expect(statusColour(0)).toBe(PALETTE.hazard);
  });

  it("is total: every input in [0,1] returns a PALETTE colour, never undefined", () => {
    const named = new Set(Object.values(PALETTE));
    for (let i = 0; i <= 1000; i++) {
      const c = statusColour(i / 1000);
      expect(named.has(c as never), String(i / 1000)).toBe(true);
    }
  });

  it("clamps rather than trusting its caller", () => {
    // A fraction out of range is a bug upstream, and it must not become a blank ring.
    for (const bad of [-1, 2, Infinity, -Infinity, NaN]) {
      expect(Object.values(PALETTE)).toContain(statusColour(bad));
    }
  });

  it("goes red only at the very end, so it means something when it does", () => {
    expect(statusColour(0.2)).not.toBe(PALETTE.hazard);
    expect(statusColour(0.05)).toBe(PALETTE.hazard);
  });
});
