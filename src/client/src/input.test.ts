import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEAD_ZONE_PX, InputController, STICK_RADIUS, keyVector, stickVector } from "./input.ts";

describe("stickVector (T17, R10)", () => {
  it("is zero inside the dead zone, so a resting thumb does not drift", () => {
    expect(stickVector(0, 0)).toEqual({ ax: 0, ay: 0 });
    expect(stickVector(DEAD_ZONE_PX - 1, 0)).toEqual({ ax: 0, ay: 0 });
  });

  it("reaches exactly 1 at the stick radius and never exceeds it", () => {
    const at = stickVector(STICK_RADIUS, 0);
    expect(Math.hypot(at.ax, at.ay)).toBeCloseTo(1, 10);
    for (const d of [STICK_RADIUS + 1, STICK_RADIUS * 3, 5000]) {
      const v = stickVector(d, d);
      expect(Math.hypot(v.ax, v.ay)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it("scales linearly between the dead zone and the rim", () => {
    const half = stickVector(STICK_RADIUS / 2, 0);
    expect(half.ax).toBeCloseTo(0.5, 10);
  });

  it("preserves direction", () => {
    const v = stickVector(-30, 40);
    expect(Math.atan2(v.ay, v.ax)).toBeCloseTo(Math.atan2(40, -30), 10);
  });
});

describe("keyVector (T17)", () => {
  it("maps WASD and arrows to the same axes", () => {
    expect(keyVector(new Set(["w"]))).toEqual(keyVector(new Set(["arrowup"])));
    expect(keyVector(new Set(["a"]))).toEqual(keyVector(new Set(["arrowleft"])));
    expect(keyVector(new Set(["d"]))).toEqual({ ax: 1, ay: 0 });
    expect(keyVector(new Set(["s"]))).toEqual({ ax: 0, ay: 1 });
  });

  it("normalizes the diagonal — no free 41% speed in the corners", () => {
    const diag = keyVector(new Set(["w", "d"]));
    expect(Math.hypot(diag.ax, diag.ay)).toBeCloseTo(1, 10);
  });

  it("cancels opposing keys", () => {
    expect(keyVector(new Set(["a", "d"]))).toEqual({ ax: 0, ay: 0 });
    expect(keyVector(new Set(["w", "s"]))).toEqual({ ax: 0, ay: 0 });
  });

  it("is zero with nothing held", () => {
    expect(keyVector(new Set())).toEqual({ ax: 0, ay: 0 });
  });

  it("agrees in shape with the touch path, so nothing downstream can tell them apart", () => {
    expect(Object.keys(keyVector(new Set(["w"]))).sort()).toEqual(
      Object.keys(stickVector(0, -STICK_RADIUS)).sort(),
    );
  });
});

/**
 * The DOM binding, which had no test at all — which is why a phone-only, total UI
 * lockout shipped and survived a green suite (T19).
 *
 * A stub surface rather than jsdom: the binding's whole contract is "which touches do
 * you swallow", and that needs a target and a preventDefault spy, nothing more.
 */
function surfaceStub() {
  const listeners: Record<string, ((e: unknown) => void)[]> = {};
  const el = {
    addEventListener(ev: string, fn: (e: unknown) => void) {
      (listeners[ev] ??= []).push(fn);
    },
  } as unknown as HTMLElement;

  const touch = (x: number, y: number, id = 1) => ({ clientX: x, clientY: y, identifier: id });
  /** `target.closest` is the real API the guard uses, so the stub provides it. */
  const control = { closest: (sel: string) => (sel.includes("button") ? {} : null) };
  const bare = { closest: () => null };

  const fire = (ev: string, changedTouches: unknown[], target: unknown) => {
    let prevented = false;
    const e = { changedTouches, target, preventDefault: () => { prevented = true; } };
    for (const fn of listeners[ev] ?? []) fn(e);
    return prevented;
  };
  return { el, fire, touch, control, bare };
}

// The controller binds the keyboard to `window`. A stub is enough, and keeps these
// tests out of a DOM environment.
const g = globalThis as { window?: unknown };
beforeAll(() => {
  g.window = { addEventListener: () => {}, innerWidth: 800, innerHeight: 400 };
});
afterAll(() => { delete g.window; });

function elementStub() {
  const listeners: Record<string, ((e: unknown) => void)[]> = {};
  const el = {
    addEventListener(ev: string, fn: (e: unknown) => void) {
      (listeners[ev] ??= []).push(fn);
    },
    classList: { add: () => {}, remove: () => {} },
  } as unknown as HTMLElement;
  const fire = (ev: string, changedTouches: unknown[]): void => {
    const e = { changedTouches, target: el, preventDefault: () => {} };
    for (const fn of listeners[ev] ?? []) fn(e);
  };
  return { el, fire };
}

describe("the button is an element, not a screen fraction (touch-controls T5)", () => {
  it("keeps no innerWidth fraction in the touch source", () => {
    // The button used to be "everything right of innerWidth * 0.6" — a 40% invisible
    // slab that no drawn circle could honestly represent. Comments are stripped first:
    // the explanation above legitimately names what the code must not do.
    const src = readFileSync(join(dirname(new URL(import.meta.url).pathname), "input.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/innerWidth\s*\*/);
  });

  it("sets the button from a touch on the element it was handed", () => {
    const s = surfaceStub();
    const input = new InputController(s.el);
    const btn = elementStub();
    input.attachButton(btn.el);
    expect(input.read().btn).toBe(false);
    btn.fire("touchstart", [s.touch(700, 380, 9)]);
    expect(input.read().btn).toBe(true);
    btn.fire("touchend", [s.touch(700, 380, 9)]);
    expect(input.read().btn).toBe(false);
  });

  it("does not plant the stick when the button is pressed", () => {
    const s = surfaceStub();
    const input = new InputController(s.el);
    const btn = elementStub();
    input.attachButton(btn.el);
    btn.fire("touchstart", [s.touch(700, 380, 9)]);
    expect(input.stickView).toBeNull();
  });

  it("plants the stick on the right of the screen too, now nothing is reserved", () => {
    // The old 40% slab meant the right of the arena could not drive the stick at all.
    const s = surfaceStub();
    const input = new InputController(s.el);
    s.fire("touchstart", [s.touch(760, 300)], s.bare);
    expect(input.stickView).not.toBeNull();
  });
});

describe("touches on a control belong to the control (T19)", () => {

  it("does not swallow a tap that lands on a button", () => {
    // preventDefault on touchstart cancels the synthesized tap on iOS. Swallowing it
    // here made every button and input on the page inert on a phone, while the
    // desktop build — which fires no touch events — stayed perfect.
    const s = surfaceStub();
    new InputController(s.el);
    const prevented = s.fire("touchstart", [s.touch(20, 400)], s.control);
    expect(prevented).toBe(false);
  });

  it("does not plant the stick under a control either", () => {
    const s = surfaceStub();
    const input = new InputController(s.el);
    s.fire("touchstart", [s.touch(20, 400)], s.control);
    expect(input.stickView).toBeNull();
    expect(input.read()).toEqual({ ax: 0, ay: 0, btn: false });
  });

  it("still claims a touch on the bare arena, and swallows that one", () => {
    const s = surfaceStub();
    const input = new InputController(s.el);
    const prevented = s.fire("touchstart", [s.touch(20, 400)], s.bare);
    expect(prevented).toBe(true);
    expect(input.stickView).not.toBeNull();
  });

  it("ignores a drag it never claimed, so a control's own gestures survive", () => {
    const s = surfaceStub();
    new InputController(s.el);
    expect(s.fire("touchmove", [s.touch(30, 410)], s.control)).toBe(false);
  });

  it("swallows the drag once the stick owns it", () => {
    const s = surfaceStub();
    new InputController(s.el);
    s.fire("touchstart", [s.touch(20, 400)], s.bare);
    expect(s.fire("touchmove", [s.touch(30, 410)], s.bare)).toBe(true);
  });
});
