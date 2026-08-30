import { describe, expect, it } from "vitest";
import { PLAYER_COLOURS } from "@ruckus/shared";
import { FONT_LINK, UI, UI_CSS, colourFor, escapeHtml } from "./kit.ts";

/** Pull one rule body out of the stylesheet so a claim can be made about it. */
const rule = (selector: string): string => {
  const i = UI_CSS.indexOf(selector + "{");
  if (i < 0) throw new Error(`no rule for ${selector}`);
  return UI_CSS.slice(i, UI_CSS.indexOf("}", i));
};

describe("a panel is a slab (visual-direction T13, R10)", () => {
  it("has a heavy ink outline and a HARD offset shadow", () => {
    const card = rule(".card");
    expect(card).toContain("var(--outline) solid var(--ink)");
    expect(card).toContain("box-shadow:var(--shadow)");
    // The zero is the whole point: a blurred shadow reads as a web modal, a hard one
    // reads as a printed card sitting on a surface.
    expect(UI_CSS).toContain(`--shadow:${UI.shadowOffset}px ${UI.shadowOffset}px 0 var(--ink)`);
  });

  it("uses no blurred shadows anywhere", () => {
    // Every box-shadow must be `x y 0 colour` — a third length would be a blur radius.
    // Stop at `}` as well as `;`, or a declaration missing its trailing semicolon
    // swallows the next rule and the assertion becomes nonsense.
    for (const m of UI_CSS.matchAll(/box-shadow:\s*([^;}]+)[;}]/g)) {
      const value = m[1]!;
      if (value.includes("var(--shadow)") || value === "none") continue;
      const lengths = value.match(/-?\d+px/g) ?? [];
      expect(lengths.length, value).toBeLessThanOrEqual(2);
      expect(value, value).toMatch(/\b0\s+var\(--ink\)|\b0\s+#/);
    }
  });

  it("matches the character slab's construction: flat fill, ink edge", () => {
    expect(rule(".card")).toContain("background:var(--card)");
    expect(UI_CSS).toContain("--ink:#1b1a17");   // the same printed black the slabs use
  });
});

describe("everything tappable is big enough (R11)", () => {
  it("gives buttons and inputs at least 44px on their shortest side", () => {
    expect(UI.minTarget).toBeGreaterThanOrEqual(44);
    expect(rule("button,input")).toContain(`min-height:${UI.minTarget}px`);
  });

  it("keeps that floor even on a short landscape viewport", () => {
    const short = UI_CSS.slice(UI_CSS.indexOf("@media (max-height:430px)"));
    expect(short).toContain(`min-height:${UI.minTarget}px`);
  });

  it("puts the HUD at the top, out of both thumb corners", () => {
    const hud = rule("#hud");
    expect(hud).toContain("top:0");
    expect(hud).not.toContain("bottom:0");
  });
});

describe("motion overshoots, and gives way (T14, R10)", () => {
  it("entrances scale past their target and settle — nothing simply fades", () => {
    expect(UI_CSS).toContain("@keyframes deal");
    expect(UI_CSS).toContain("scale(1.04)");   // the overshoot
    expect(UI_CSS).toContain("scale(1)");      // the settle
  });

  it("removes every animation and transition under prefers-reduced-motion", () => {
    const block = UI_CSS.slice(UI_CSS.indexOf("@media (prefers-reduced-motion:reduce)"));
    expect(block).toContain("animation:none!important");
    expect(block).toContain("transition:none!important");
  });

  it("keeps the settled tilt when motion is off, so nothing lands askew", () => {
    const block = UI_CSS.slice(UI_CSS.indexOf("@media (prefers-reduced-motion:reduce)"));
    expect(block).toContain(`rotate(-${UI.tilt}deg)`);
  });
});

describe("colour comes from the game's own palette (R10)", () => {
  it("resolves a slot to a player colour, and never throws on a stray slot", () => {
    for (let slot = 0; slot < PLAYER_COLOURS.length; slot++) {
      expect(colourFor(slot)).toBe(PLAYER_COLOURS[slot]);
    }
    expect(PLAYER_COLOURS).toContain(colourFor(99));
    expect(PLAYER_COLOURS).toContain(colourFor(-3));
  });

  it("paints its own ground rather than inheriting one", () => {
    expect(rule("html,body")).toContain("background:var(--ground)");
  });
});

describe("hygiene", () => {
  it("loads its typefaces from the one font host, with a fallback declared", () => {
    expect(FONT_LINK).toContain("fonts.googleapis.com");
    expect(rule("html,body")).toContain("ui-rounded");   // the fallback stack
  });

  it("escapes anything a player typed", () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).not.toContain("<img");
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  it("declares no asset url anywhere — the Kit is closed (RD-001)", () => {
    expect(UI_CSS).not.toMatch(/url\(/);
  });
});
