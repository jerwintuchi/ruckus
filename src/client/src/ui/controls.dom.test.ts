/**
 * @vitest-environment jsdom
 *
 * The stick and the button, MOUNTED (touch-controls T3, T4, T6, R1-R5; RD-104).
 *
 * The thing being pinned is that these are *drawn at all*. `stickView` computed exactly
 * where to put the stick from the day it was written and nothing ever read it, so the
 * first playtester moved and passed the bomb by discovering unmarked screen regions.
 * A control nobody can see is not a control.
 *
 * These cases used to be written against `controls.ts` as TEXT — slicing out the body of
 * `update()` and asserting it contained `"this.input.stickView"`, or that `home()`
 * contained `"top ="`. That form is worse than it looks. It cannot fail when the method
 * is wired up wrongly, it cannot tell `top` in a comment from `top` in an assignment, and
 * it DOES fail when someone renames a local — so it charged a toll on every refactor
 * while catching none of the bugs it was written for.
 *
 * jsdom resolves the real stylesheet, cascade and all, so the same claims can be made
 * against a mounted control: the computed `display` of a `[hidden]` button, the computed
 * `opacity` of the resting base, the actual `style.left` the stick was moved to.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  BUTTON_MIN_PX, CONTROLS_CSS, Controls, GUIDE_OPACITY, STICK_HOME_PX, STICK_REST_OPACITY,
  shouldSettle,
} from "./controls.ts";
import type { InputController } from "../input.ts";
import { ACTION_VERBS } from "@ruckus/shared";

type StickView = { ox: number; oy: number; kx: number; ky: number } | null;

/**
 * A stub input, so this file tests the CONTROLS.
 *
 * The real `InputController` is driven by touch geometry and has its own tests; feeding
 * it synthetic Touch objects here would test jsdom's event model rather than anything
 * about drawing. What `Controls` actually consumes is two members, and those are what
 * this provides.
 */
function fakeInput(view: StickView = null): InputController & { view: StickView } {
  const stub = {
    view,
    // Reads `stub`, not `this`: a getter in an object literal has no typed `this`, and
    // the version that used one compiled to `any` under the test runner and failed under
    // `tsc`. Exactly what `pnpm verify` exists to catch (RD-104).
    get stickView(): StickView { return stub.view; },
    attachButton(): void { /* the button's own listeners are input.test.ts's subject */ },
  };
  return stub as unknown as InputController & { view: StickView };
}

function mount(view: StickView = null) {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  const style = document.createElement("style");
  style.textContent = CONTROLS_CSS;
  document.head.append(style);

  const input = fakeInput(view);
  const controls = new Controls(document.body, input);
  const q = <T extends Element>(sel: string): T => document.querySelector(sel) as T;
  return {
    controls, input,
    root: q<HTMLElement>("#controls"),
    base: q<HTMLElement>("#stickBase"),
    knob: q<HTMLElement>("#stickKnob"),
    button: q<HTMLButtonElement>("#actionBtn"),
    guide: q<HTMLElement>("#keyGuide"),
  };
}

/** Force the touch surface, which is the only one that draws a stick. */
beforeEach(() => {
  window.history.replaceState({}, "", "/?surface=touch");
});

describe("the stick is visible before it is touched (T3, R1)", () => {
  it("puts a base and a knob on the page", () => {
    const { base, knob } = mount();
    expect(base).toBeTruthy();
    expect(knob).toBeTruthy();
  });

  it("renders the resting base translucent, through the real cascade", () => {
    // Asserted on the COMPUTED value, so a later rule that overrides this one fails here
    // rather than passing a string match against the rule it silently lost to.
    const { base } = mount();
    expect(getComputedStyle(base).opacity).toBe(String(STICK_REST_OPACITY));
  });

  it("is findable without fighting the arena", () => {
    expect(STICK_REST_OPACITY).toBeGreaterThan(0.2);
    expect(STICK_REST_OPACITY).toBeLessThan(0.6);
  });

  it("goes solid once the stick is live", () => {
    const { root, base, knob } = mount({ ox: 100, oy: 200, kx: 120, ky: 210 });
    mountedUpdate(root);
    expect(getComputedStyle(base).opacity).toBe("1");
    expect(getComputedStyle(knob).opacity).toBe("1");
  });
});

/** Add the `live` class the way `update()` does, for cascade assertions. */
function mountedUpdate(root: HTMLElement): void {
  root.classList.add("live");
}

describe("the button only exists when a round asks for one (T4, R3, R4)", () => {
  it("is on the page but not displayed until shown", () => {
    // The claim is `display:none`, and only a cascade can answer it: the rule is
    // `#actionBtn[hidden]`, so it depends on the attribute AND on nothing outranking it.
    const { button } = mount();
    expect(button.hasAttribute("hidden")).toBe(true);
    expect(getComputedStyle(button).display).toBe("none");
  });

  it("is comfortably over the tap floor — it is pressed under pressure (R5)", () => {
    const { button } = mount();
    // A real size, not a minimum: `min-width` leaves the used width to content, which is
    // what let the icon's percentage go circular (RD-044).
    expect(getComputedStyle(button).width).toBe(`${BUTTON_MIN_PX}px`);
    expect(getComputedStyle(button).height).toBe(`${BUTTON_MIN_PX}px`);
    expect(BUTTON_MIN_PX).toBeGreaterThanOrEqual(64);
  });

  it("takes its own touches while the layer around it stays inert (P2)", () => {
    // Drawn region and hit region are one region. The controls layer must not swallow
    // taps meant for the arena, and the button must still receive its own.
    const { root, button } = mount();
    expect(getComputedStyle(root).pointerEvents).toBe("none");
    expect(getComputedStyle(button).pointerEvents).toBe("auto");
  });
});

describe("the drawn stick is stickView, verbatim (P1)", () => {
  it("moves base and knob to exactly the coordinates the input reported", () => {
    // The old version sliced `update()` out of the source and checked it mentioned
    // `view.ox`. This checks the pixel actually landed there — which is the claim.
    const view = { ox: 140, oy: 300, kx: 171, ky: 288 };
    const { controls, base, knob } = mount(view);
    controls.update();
    expect(base.style.left).toBe("140px");
    expect(base.style.top).toBe("300px");
    expect(knob.style.left).toBe("171px");
    expect(knob.style.top).toBe("288px");
  });

  it("marks the stick live while a thumb is on it", () => {
    const { controls, root } = mount({ ox: 1, oy: 2, kx: 3, ky: 4 });
    controls.update();
    expect(root.classList.contains("live")).toBe(true);
  });

  it("returns the stick home when nothing is touching it", () => {
    const { controls, input, base, root } = mount({ ox: 400, oy: 400, kx: 400, ky: 400 });
    controls.update();
    expect(base.style.left).toBe("400px");

    input.view = null; // thumb lifted
    controls.update();
    expect(root.classList.contains("live")).toBe(false);
    expect(base.style.left).toContain("var(--safe-left)");
  });
});

describe("the resting stick is one stick, not two (RD-035)", () => {
  it("positions base and knob by the SAME anchor, so their centres coincide", () => {
    // Both carry translate(-50%,-50%). Under a `bottom` anchor that puts an element's
    // centre at `bottom + its own height`, so the 132px base and the 61px knob rested at
    // different points and the stick looked broken in two. Same `top`, no `bottom`.
    const { base, knob } = mount();
    expect(base.style.top).toBe(knob.style.top);
    expect(base.style.left).toBe(knob.style.left);
    expect(base.style.bottom).toBe("");
    expect(knob.style.bottom).toBe("");
  });

  it("clears `bottom` explicitly, so a live frame cannot leak into rest", () => {
    const { controls, input, base } = mount({ ox: 10, oy: 20, kx: 10, ky: 20 });
    base.style.bottom = "40px"; // as an older layout would have left it
    controls.update();
    expect(base.style.bottom).toBe("");
    input.view = null;
    controls.update();
    expect(base.style.bottom).toBe("");
  });

  it("homes inside the safe area, spending the insets by name (RD-055)", () => {
    // By name so the screenshot harness can replay a real phone's values.
    const { base } = mount();
    expect(base.style.left).toBe(`calc(${STICK_HOME_PX}px + var(--safe-left))`);
    expect(base.style.top).toBe(`calc(100% - ${STICK_HOME_PX}px - var(--safe-bottom))`);
  });
});

describe("the key guide (T8, T9, R6)", () => {
  it("is on the page and never intercepts a tap", () => {
    const { guide } = mount();
    expect(guide).toBeTruthy();
    expect(getComputedStyle(guide).pointerEvents).toBe("none");
  });

  it("is drawn quietly enough to ignore", () => {
    expect(GUIDE_OPACITY).toBeGreaterThan(0.2);
    expect(GUIDE_OPACITY).toBeLessThan(0.6);
    const { guide } = mount();
    expect(getComputedStyle(guide).opacity).toBe(String(GUIDE_OPACITY));
  });
});

describe("only a real event switches surfaces (T8, RD-052)", () => {
  it("ignores a synthetic event, which must not flip the controls mid-round", () => {
    // Mounted, and end to end: `dispatchEvent` produces `isTrusted: false`, which is
    // exactly the case the guard exists for. jsdom will not let a test forge a TRUSTED
    // event — `isTrusted` is a non-configurable own property — so the other three rules
    // are asserted against `shouldSettle` directly, below.
    window.history.replaceState({}, "", "/");
    const { root } = mount();
    const before = root.className;
    window.dispatchEvent(new Event("keydown"));
    window.dispatchEvent(new Event("touchstart"));
    expect(root.className).toBe(before);
  });

  it("switches on a real event", () => {
    expect(shouldSettle(null, true, "keyboard", "touch")).toBe(true);
  });

  it("never switches on a synthetic one", () => {
    expect(shouldSettle(null, false, "keyboard", "touch")).toBe(false);
  });

  it("is idempotent, so repeated input does not thrash the DOM", () => {
    expect(shouldSettle(null, true, "touch", "touch")).toBe(false);
    expect(shouldSettle(null, true, "keyboard", "keyboard")).toBe(false);
  });

  it("stops settling once a surface is forced (RD-052)", () => {
    // Headless Chrome reports a fine pointer, so without the override the touch controls
    // — the half of the UI this game exists for — are the half no screenshot can show.
    for (const forced of ["touch", "keyboard"] as const) {
      expect(shouldSettle(forced, true, "keyboard", "touch"), forced).toBe(false);
      expect(shouldSettle(forced, true, "touch", "keyboard"), forced).toBe(false);
    }
  });
});

describe("the stick does not draw on a keyboard", () => {
  it("leaves the stick alone when the surface is not touch", () => {
    window.history.replaceState({}, "", "/?surface=keyboard");
    const { controls, base } = mount({ ox: 500, oy: 500, kx: 500, ky: 500 });
    const homed = base.style.left;
    controls.update();
    expect(base.style.left).toBe(homed); // never moved to 500px
  });
});

describe("the action button, painted (action-button T5, T6, RD-042, RD-054)", () => {
  const PASS = ACTION_VERBS.indexOf("pass");
  const TUMBLE = ACTION_VERBS.indexOf("tumble");

  it("opens a round drawing no icon, so the first snapshot cannot be memoised away", () => {
    // `setAction` rewrites the icon only when the verb CHANGES, so the field is a claim
    // about what the DOM already shows. Any real verb there is a lie for the round that
    // opens on it — which is why Scramble drew a blank yellow disc (RD-054). Asserted on
    // the MARKUP rather than on the source declaring the field.
    const { controls } = mount();
    expect(icon().getAttribute("d")).toBe("");
    controls.setAction({ v: TUMBLE });
    expect(icon().getAttribute("d")!.length).toBeGreaterThan(0);
  });

  it("draws a shape for every verb a minigame can send", () => {
    const { controls } = mount();
    for (let v = 0; v < ACTION_VERBS.length; v++) {
      controls.setAction({ v });
      expect(icon().getAttribute("d")!.length, ACTION_VERBS[v]).toBeGreaterThan(0);
    }
  });

  it("keeps its children when the verb changes (RD-042)", () => {
    // The button's children ARE the icon, the ring and the number. Assigning
    // `textContent` wiped all three, so the icon never appeared and `setAction` was
    // writing to a detached node. The accessible name goes on the attribute instead.
    const { controls, button } = mount();
    controls.setAction({ v: PASS });
    controls.setAction({ v: TUMBLE });
    expect(button.querySelector("#actionIcon")).toBeTruthy();
    expect(button.querySelector("#cooldownRing")).toBeTruthy();
    expect(button.querySelector("#cooldownNum")).toBeTruthy();
    expect(button.getAttribute("aria-label")!.length).toBeGreaterThan(0);
  });

  it("shows no clutter when the action is ready: full ring, empty number", () => {
    const { controls } = mount();
    controls.setAction({ v: TUMBLE });
    controls.update();
    expect(num().textContent).toBe("");
    expect(ring().style.strokeDashoffset).toBe("0");
    expect(document.querySelector("#actionBtn")!.classList.contains("cooling")).toBe(false);
  });

  it("counts down from the server's own number, to one decimal", () => {
    const { controls, button } = mount();
    controls.setAction({ v: TUMBLE, r: 2.5 });
    controls.update();
    expect(button.classList.contains("cooling")).toBe(true);
    expect(num().textContent).toMatch(/^\d\.\d$/);
    expect(Number(ring().style.strokeDashoffset)).toBeGreaterThan(0);
  });
});

const icon = () => document.querySelector("#actionIcon") as SVGPathElement;
const num = () => document.querySelector("#cooldownNum") as HTMLElement;
const ring = () => document.querySelector("#cooldownRing circle") as SVGCircleElement;
