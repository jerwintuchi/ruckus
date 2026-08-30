import { describe, expect, it } from "vitest";
import { PLAYER_COLOURS as SHARED_COLOURS } from "@ruckus/shared";
import { PALETTE, PLAYER_COLOURS, hexToInt } from "./palette.ts";

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
