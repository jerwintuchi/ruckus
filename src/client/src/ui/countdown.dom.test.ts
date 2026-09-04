/**
 * @vitest-environment jsdom
 *
 * The countdown stopwatch, MOUNTED (round-countdown T1-T3, T5-T7).
 */
import { describe, expect, it, vi } from "vitest";
import { COUNT_MS } from "@ruckus/shared";
import { PALETTE, statusColour } from "../kit/palette.ts";
import type { FlowEvent } from "../flow.ts";
import { initialState } from "../flow.ts";
import { Ui } from "./screens.ts";
import { UI_CSS } from "./kit.ts";

const noop = {
  onCreate: (_n: string) => {}, onJoin: (_c: string, _n: string) => {},
  onStart: () => {}, onEvent: (_e: FlowEvent) => {},
  onToggleMute: () => false, onQuit: () => {}, onVolume: (_s: number) => {},
};

function mount() {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  const style = document.createElement("style");
  style.textContent = UI_CSS;
  document.head.append(style);
  const root = document.createElement("div");
  document.body.append(root);
  const ui = new Ui(root, noop);
  ui.render(initialState());
  const q = <T extends Element>(s: string): T => root.querySelector(s) as T;
  return { ui, root, q };
}

describe("the stopwatch is an object, not floating text (R1)", () => {
  it("is a disc slab with the Kit's outline and hard shadow", () => {
    const { q } = mount();
    const disc = q<HTMLElement>("#tick .disc");
    expect(disc).toBeTruthy();
    const cs = getComputedStyle(disc);
    expect(cs.borderRadius).toBe("50%");
    expect(cs.boxShadow).toBe("var(--shadow)");
  });

  it("is hidden until there is a number, so it never covers a rule card", () => {
    const { q } = mount();
    expect(q<HTMLElement>("#tick").classList.contains("on")).toBe(false);
  });

  it("does not cover the viewport — the arena reads around it (R1)", () => {
    const { q } = mount();
    const cs = getComputedStyle(q<HTMLElement>("#tick"));
    expect(cs.width).not.toBe("100%");
    expect(cs.pointerEvents, "never eats a tap meant for the arena").toBe("none");
  });
});

describe("each number lands, and GO releases (R2, R4)", () => {
  it("shows the digit and re-triggers the entrance for each new one", () => {
    const { ui, q } = mount();
    ui.setCountdown(3);
    expect(q<HTMLElement>("#tickNum").textContent).toBe("3");
    expect(q<HTMLElement>("#tickNum").classList.contains("land")).toBe(true);
    ui.setCountdown(2);
    expect(q<HTMLElement>("#tickNum").textContent).toBe("2");
    expect(q<HTMLElement>("#tickNum").classList.contains("land")).toBe(true);
  });

  it("punches out at zero and is gone (R4, P5)", () => {
    vi.useFakeTimers();
    const { ui, q } = mount();
    ui.setCountdown(3);
    ui.setCountdown(0);
    expect(q<HTMLElement>("#tick").classList.contains("go")).toBe(true);
    vi.advanceTimersByTime(300);
    expect(q<HTMLElement>("#tick").classList.contains("on"), "clear before play").toBe(false);
    vi.useRealTimers();
  });

  it("does nothing at all on a repeated digit (P1, P3)", () => {
    // RD-084's lesson asserted rather than hoped for: a HUD rewritten every frame never
    // animates, and this is called from the render loop.
    const { ui, q } = mount();
    ui.setCountdown(3);
    const seen: string[] = [];
    const obs = new MutationObserver((ms) => ms.forEach((m) => seen.push(m.type)));
    obs.observe(q<HTMLElement>("#tick"), { attributes: true, childList: true, subtree: true, characterData: true });
    for (let f = 0; f < 120; f++) ui.setCountdown(3);
    obs.disconnect();
    expect(seen, "120 frames at an unchanged digit").toHaveLength(0);
  });
});

describe("the ring drains, in the one urgency ramp (R3)", () => {
  it("sets the dash to the circumference so a full sweep is one second", () => {
    const { ui, q } = mount();
    ui.setCountdown(3);
    const ring = q<SVGCircleElement>("#tickRing");
    expect(Number(ring.style.strokeDasharray)).toBeCloseTo(2 * Math.PI * 45, 3);
  });

  it("gives every second of the count a visibly different colour", () => {
    // The bug this pins: with `n/seconds` the three fractions were 1.0, 0.67 and 0.33 —
    // all inside the top two bands — so the ring barely changed across the whole count.
    // jsdom normalises a hex to rgb(), so compare through the same lens.
    const asRgb = (hex: string): string => {
      const probe = document.createElement("div");
      probe.style.color = hex;
      return probe.style.color;
    };
    const { ui, q } = mount();
    const seen: string[] = [];
    for (const n of [3, 2, 1]) {
      ui.setCountdown(n);
      seen.push(q<SVGCircleElement>("#tickRing").style.stroke);
    }
    expect(new Set(seen).size, "three seconds, three states").toBe(3);
    expect(seen[0]).toBe(asRgb(PALETTE.ok));
    expect(seen[2]).toBe(asRgb(PALETTE.hazard));
  });
});
