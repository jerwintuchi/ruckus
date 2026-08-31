/**
 * The stick and the button (touch-controls T3, T4, T6, R1–R5).
 *
 * The thing being pinned is that these are *drawn at all*. `stickView` computed exactly
 * where to put the stick from the day it was written and nothing ever read it, so the
 * first playtester moved and passed the bomb by discovering unmarked screen regions.
 * A control nobody can see is not a control.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUTTON_MIN_PX, CONTROLS_CSS, CONTROLS_HTML, GUIDE_OPACITY, STICK_BASE_PX,
  STICK_REST_OPACITY, guessSurface,
} from "./controls.ts";
import { STICK_RADIUS } from "../input.ts";
import { UI } from "./kit.ts";

/**
 * One rule body out of the stylesheet, so a claim can be made about it.
 *
 * Anchored to a line start: `#stickKnob{` also occurs inside `#stickBase,#stickKnob{`,
 * and a plain indexOf silently returns the wrong rule.
 */
const rule = (selector: string): string => {
  const i = CONTROLS_CSS.indexOf("\n" + selector + "{");
  if (i < 0) throw new Error(`no rule for ${selector}`);
  return CONTROLS_CSS.slice(i, CONTROLS_CSS.indexOf("}", i));
};

describe("the stick is visible before it is touched (T3, R1)", () => {
  it("draws a resting base and knob, not just a live one", () => {
    // A first-time player at a party has no idea the left half is a stick unless
    // something is there to see. This is the whole point of the task.
    expect(CONTROLS_HTML).toContain('id="stickBase"');
    expect(CONTROLS_HTML).toContain('id="stickKnob"');
    expect(rule("#stickBase")).toContain(`opacity:${STICK_REST_OPACITY}`);
  });

  it("is translucent at rest and solid once held", () => {
    expect(STICK_REST_OPACITY).toBeGreaterThan(0.2); // findable
    expect(STICK_REST_OPACITY).toBeLessThan(0.6); // not fighting the arena
    expect(CONTROLS_CSS).toContain("#controls.live #stickBase");
    expect(rule("#controls.live #stickBase,#controls.live #stickKnob")).toContain("opacity:1");
  });

  it("is big enough for the throw the input actually uses", () => {
    // The base has to contain STICK_RADIUS of travel or the picture lies about the
    // range: the knob would leave its own base before the axis reached full tilt.
    expect(STICK_BASE_PX / 2).toBeGreaterThanOrEqual(STICK_RADIUS);
  });

  it("belongs to the game's own ink-and-paper vocabulary (R2)", () => {
    // Same outline width and palette tokens as a card, so it reads as one world.
    expect(rule("#stickBase,#stickKnob")).toContain("var(--outline) solid var(--ink)");
    expect(rule("#stickBase")).toContain("var(--card)");
    expect(rule("#stickKnob")).toContain("var(--highlight)");
    // No hex literals anywhere: colours come from the palette (kit-rules.md).
    expect(CONTROLS_CSS).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });
});

describe("the button says what it does, and only exists when there is one (T4, R3, R4)", () => {
  it("renders a button element, hidden until a round asks for it", () => {
    expect(CONTROLS_HTML).toContain('id="actionBtn"');
    expect(CONTROLS_HTML).toContain("hidden");
    expect(rule("#actionBtn[hidden]")).toContain("display:none");
  });

  it("is comfortably over the tap floor — it is pressed under pressure (R5)", () => {
    expect(BUTTON_MIN_PX).toBeGreaterThanOrEqual(UI.minTarget);
    expect(BUTTON_MIN_PX).toBeGreaterThanOrEqual(64);
    const btn = rule("#actionBtn");
    expect(btn).toContain(`min-width:${BUTTON_MIN_PX}px`);
    expect(btn).toContain(`min-height:${BUTTON_MIN_PX}px`);
  });

  it("takes its own touches, so drawn region and hit region are one region (P2)", () => {
    // The controls layer is inert; only the button itself accepts input. That is what
    // makes the honest hit area possible — see input.ts's attachButton.
    expect(rule("#controls")).toContain("pointer-events:none");
    expect(rule("#actionBtn")).toContain("pointer-events:auto");
  });
});

describe("controls sit inside the safe area (T6, R5)", () => {
  it("keeps the button clear of the home indicator and the notch", () => {
    const btn = rule("#actionBtn");
    expect(btn).toContain("env(safe-area-inset-right)");
    expect(btn).toContain("env(safe-area-inset-bottom)");
  });

  it("homes the resting stick inside the safe area too", () => {
    const src = readFileSync(join(dirname(new URL(import.meta.url).pathname), "controls.ts"), "utf8");
    const home = src.slice(src.indexOf("private home()"), src.indexOf("\n  }", src.indexOf("private home()")));
    expect(home).toContain("safe-area-inset-");
  });
});

describe("the drawn stick is stickView, verbatim (P1)", () => {
  const src = readFileSync(join(dirname(new URL(import.meta.url).pathname), "controls.ts"), "utf8");

  it("positions from the input's own view, with no second opinion", () => {
    // A control that lies about where it is, is worse than no control. The update path
    // reads stickView and writes those numbers; it computes no geometry of its own.
    const update = src.slice(src.indexOf("update(): void {"), src.indexOf("\n  }", src.indexOf("update(): void {")));
    expect(update).toContain("this.input.stickView");
    expect(update).toContain("view.ox");
    expect(update).toContain("view.kx");
    // No trigonometry, no radius maths — that all lives in stickVector.
    expect(update).not.toMatch(/Math\.(cos|sin|hypot|atan2)/);
  });

  it("returns the stick home when nothing is touching it", () => {
    const update = src.slice(src.indexOf("update(): void {"), src.indexOf("\n  }", src.indexOf("update(): void {")));
    expect(update).toContain("this.home()");
  });
});

describe("the resting stick is one stick, not two (RD-035)", () => {
  const src = readFileSync(join(dirname(new URL(import.meta.url).pathname), "controls.ts"), "utf8");
  const home = src.slice(src.indexOf("private home()"), src.indexOf("\n  }", src.indexOf("private home()")));

  it("positions base and knob by the same anchor, so their centres coincide", () => {
    // Both carry translate(-50%,-50%). Under a `bottom` anchor that puts an element's
    // centre at `bottom + its own height`, so the 132px base and the 61px knob rested
    // at different points and the stick looked broken in two.
    expect(home).toContain("top =");
    expect(home).not.toMatch(/bottom = `/);
    // Cleared explicitly, so a live frame's positioning cannot leak into rest.
    expect(home).toContain('bottom = ""');
  });

  it("uses the same coordinate system as the live update", () => {
    const update = src.slice(src.indexOf("update(): void {"), src.indexOf("\n  }", src.indexOf("update(): void {")));
    for (const prop of ["left", "top"]) {
      expect(home, prop).toContain(`${prop} =`);
      expect(update, prop).toContain(`style.${prop}`);
    }
  });
});

describe("the controls suit the device being held (T8, T9, R6)", () => {
  it("guesses touch from a coarse pointer, keyboard otherwise", () => {
    expect(guessSurface((q) => q === "(pointer: coarse)")).toBe("touch");
    expect(guessSurface(() => false)).toBe("keyboard");
  });

  it("names the keys that already work, and the round's own word", () => {
    // The guide is a reminder of bindings that have existed since input.ts was
    // written; it introduces no new input. The action word comes from the round.
    expect(CONTROLS_HTML).toContain('id="keyGuide"');
    expect(rule("#keyGuide")).toContain("pointer-events:none");
  });

  it("draws the guide quietly enough to ignore", () => {
    expect(GUIDE_OPACITY).toBeGreaterThan(0.2);
    expect(GUIDE_OPACITY).toBeLessThan(0.6);
    expect(rule("#keyGuide")).toContain(`opacity:${GUIDE_OPACITY}`);
  });

  it("keeps the guide inside the safe area, like every other control (R5)", () => {
    const guide = rule("#keyGuide");
    expect(guide).toContain("env(safe-area-inset-left)");
    expect(guide).toContain("env(safe-area-inset-bottom)");
  });

  it("only lets a real event switch surfaces", () => {
    // A synthetic event — a test, an extension, our own dispatch — must not flip the
    // controls out from under a player mid-round.
    const src = readFileSync(join(dirname(new URL(import.meta.url).pathname), "controls.ts"), "utf8");
    const settle = src.slice(src.indexOf("const settle ="), src.indexOf("window.addEventListener"));
    expect(settle).toContain("e.isTrusted");
  });

  it("switches idempotently, so repeated input does not thrash the DOM", () => {
    const src = readFileSync(join(dirname(new URL(import.meta.url).pathname), "controls.ts"), "utf8");
    const settle = src.slice(src.indexOf("const settle ="), src.indexOf("window.addEventListener"));
    expect(settle).toContain("this.surface === next");
  });

  it("mentions no minigame by name anywhere in the controls source (RD-009)", () => {
    const src = readFileSync(join(dirname(new URL(import.meta.url).pathname), "controls.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const id of ["hot-potato", "sweepers", "scramble", "falling-floor", "PASS", "JUMP", "GRAB"]) {
      expect(code, id).not.toContain(id);
    }
  });
});
