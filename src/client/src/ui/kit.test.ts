import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
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

describe("the browser's chrome never covers anything (arena-framing T4, R4)", () => {
  // viewport-fit=cover only means content slides UNDER the notch and the URL bar. The
  // padding is what keeps it clear, and its absence is what the first phone playtest
  // photographed: the HUD sitting beneath Safari's address bar.
  it("insets the overlay on all four sides, not just the top", () => {
    // In landscape the notch is at the side, which is the orientation the game is
    // played in — a top-only inset would miss it entirely.
    const overlay = rule(".overlay");
    for (const side of ["top", "right", "bottom", "left"]) {
      expect(overlay, side).toContain(`var(--safe-${side})`);
    }
  });

  it("insets the HUD, which is pinned to the very edge", () => {
    const hud = rule("#hud");
    for (const side of ["top", "right", "left"]) {
      expect(hud, side).toContain(`var(--safe-${side})`);
    }
  });

  it("keeps the insets when the short-viewport layout tightens (T17)", () => {
    // The landscape squeeze re-declares .overlay's padding, and an inset dropped there
    // would fail exactly where it matters most: a phone on its side.
    const short = UI_CSS.slice(UI_CSS.indexOf("@media (max-height:430px)"));
    const overlay = short.slice(short.indexOf(".overlay{"), short.indexOf("}", short.indexOf(".overlay{")));
    for (const side of ["top", "right", "bottom", "left"]) {
      expect(overlay, side).toContain(`var(--safe-${side})`);
    }
  });

  it("still clears the 44px tap floor once padding is applied", () => {
    expect(UI.minTarget).toBeGreaterThanOrEqual(44);
    expect(UI_CSS).toContain(`min-height:${UI.minTarget}px`);
  });
});

describe("portrait says what to do and blocks nothing (arena-framing T5, R5, P4)", () => {
  it("is decided by a media query, not by code", () => {
    expect(UI_CSS).toContain("@media (orientation:portrait)");
    expect(UI_CSS).toContain("#rotate");
  });

  it("carries no state in the flow reducer", () => {
    // A cached orientation flag can disagree with the device; a media query cannot.
    // It also keeps `reduce` total — no sequence of rotations can strand a player.
    const flow = readFileSync(
      join(dirname(new URL(import.meta.url).pathname), "..", "flow.ts"), "utf8");
    for (const forbidden of ["orientation", "portrait", "landscape", "rotate"]) {
      expect(flow.toLowerCase(), forbidden).not.toContain(forbidden);
    }
  });

  it("never covers the arena — it is a nudge, not a wall", () => {
    const portrait = UI_CSS.slice(UI_CSS.indexOf("@media (orientation:portrait)"));
    const block = portrait.slice(0, portrait.indexOf("\n}"));
    // Pinned to one edge and untouchable: a player who cannot rotate keeps playing.
    expect(block).toContain("pointer-events:none");
    expect(block).toContain("bottom:");
    expect(block).not.toContain("inset:0");
    // And it clears the home indicator while it is down there.
    expect(block).toContain("var(--safe-bottom)");
  });

  it("keeps the message under reduced motion, and drops only the movement", () => {
    const reduced = UI_CSS.slice(UI_CSS.indexOf("@media (prefers-reduced-motion:reduce)"));
    const block = reduced.slice(0, reduced.indexOf("\n}"));
    expect(block).toContain("animation:none!important");
    expect(block).toContain("#rotate span");
    // The prompt is never hidden — that would remove information, not emphasis.
    expect(block).not.toContain("#rotate{display:none");
  });
});

describe("the canvas is sized by CSS, not by its drawing buffer (RD-031)", () => {
  it("gives the canvas an explicit width and height", () => {
    // A canvas is a replaced element: with width:auto its layout size is its INTRINSIC
    // size — the drawing-buffer attributes the renderer writes — and inset:0 does not
    // stretch it. At a 2x pixel ratio that laid the canvas out at twice the viewport,
    // anchored top-left, putting the arena's centre off the right edge. It looked like
    // a camera bug for three rounds of investigation; the camera was never wrong.
    const canvas = rule("canvas");
    expect(canvas).toContain("width:100%");
    expect(canvas).toContain("height:100%");
  });
});

describe("the count is emphasis, not the message (round-brief R3)", () => {
  it("lands with the same overshoot the rest of the UI uses", () => {
    expect(UI_CSS).toContain("@keyframes countIn");
    expect(rule(".count.pulse")).toContain("countIn");
  });

  it("keeps the number under reduced motion, and drops only the movement", () => {
    // The blanket rule removes every animation; the number itself is text and stays.
    const reduced = UI_CSS.slice(UI_CSS.indexOf("@media (prefers-reduced-motion:reduce)"));
    const block = reduced.slice(0, reduced.indexOf("\n}"));
    expect(block).toContain("animation:none!important");
    expect(block).not.toContain(".count{display:none");
  });

  it("reserves its line, so the card does not jump when the number appears", () => {
    expect(rule(".count")).toContain("min-height");
  });
});

describe("eight rows fit a landscape phone (lobby-flow T18, R13)", () => {
  it("bounds the card and scrolls inside it rather than growing off screen", () => {
    // A results card now lists everyone, so on a short landscape phone it is eight
    // rows rather than two. The card must stay on screen and scroll within itself.
    const short = UI_CSS.slice(UI_CSS.indexOf("@media (max-height:430px)"));
    const card = short.slice(short.indexOf(".card{"), short.indexOf("}", short.indexOf(".card{")));
    expect(card).toContain("overflow-y:auto");
    // Bounded by the OVERLAY, never the viewport. This test used to say only
    // `toContain("max-height")`, which `94vh` satisfied — and 94vh lets the card claim
    // the overlay's padding and the safe insets on top of its own space, so the last
    // row was sliced by the screen edge on the real device (RD-055).
    expect(card).toContain("max-height:100%");
    expect(card).not.toMatch(/max-height:[\d.]+v[hw]/);
    // A flex item will not shrink below its content without this, so the max-height
    // above would be quietly ignored.
    expect(card).toContain("min-height:0");
  });

  it("marks the local player's row distinctly from a disconnected one", () => {
    expect(rule(".row.me")).toContain("var(--card-dim)");
    expect(rule(".row.gone")).toContain("opacity");
  });
});

describe("the insets are spent by name, so they can be replayed (RD-055)", () => {
  it("defines all four variables from env(), once", () => {
    // Every rule says var(--safe-*); exactly one place says env(). That one place is
    // what an override can replace, and a desktop browser cannot be told otherwise.
    for (const side of ["top", "right", "bottom", "left"]) {
      expect(UI_CSS, side).toContain(`--safe-${side}:env(safe-area-inset-${side})`);
    }
  });

  it("leaves no rule calling env() directly", () => {
    // A single stray call site is a control that ignores the override and lands
    // somewhere no phone would put it — the exact failure this exists to prevent.
    const declarations = UI_CSS.replace(/--safe-\w+:env\(safe-area-inset-\w+\);/g, "");
    expect(declarations).not.toContain("env(safe-area-inset");
  });
});

describe("the room code and its copy button share a line (lobby-flow T19, R13)", () => {
  it("lays the code block out in two columns", () => {
    // Stacked, the button cost a whole 44px row — and on a landscape phone with eight
    // players that was the row that pushed the footer off the bottom of the card.
    const block = rule(".codeblock");
    expect(block).toContain("display:grid");
    expect(block).toContain("grid-template-columns:auto auto");
    expect(block).not.toContain("flex-direction:column");
  });

  it("spans the label and the link box, so only the code and button share the row", () => {
    // Auto-placement puts the code in column 1 and the button in column 2. Anything
    // that must not join them has to say so.
    expect(rule(".codelabel")).toContain("grid-column:1/-1");
    expect(rule(".linkbox")).toContain("grid-column:1/-1");
  });
});
