/**
 * @vitest-environment jsdom
 *
 * The countdown stopwatch, MOUNTED (round-countdown T1-T3, T5-T7).
 */
import { describe, expect, it, vi } from "vitest";
import { PALETTE } from "../kit/palette.ts";
import type { FlowEvent } from "../flow.ts";
import { initialState } from "../flow.ts";
import { Ui } from "./screens.ts";
import { UI_CSS, replayAnimation } from "./kit.ts";
import { countdownAt } from "./hud.ts";

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

describe("the count is a numeral and a sweep, nothing else (R1, RD-113)", () => {
  it("has no disc and no shadow to cover the arena", () => {
    // The disc was a slab over the very arena the count exists to reveal. The numeral
    // carries a hard ink outline instead — the outline IS the object (RD-021).
    const { root, q } = mount();
    expect(root.querySelector("#tick .disc"), "no slab").toBeNull();
    expect(getComputedStyle(q<HTMLElement>("#tick")).boxShadow).not.toContain("shadow");
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
  it("gives the keyframes a circumference to sweep", () => {
    const { ui, q } = mount();
    ui.setCountdown(3);
    const ring = q<SVGCircleElement>("#tickRing");
    expect(Number(ring.style.getPropertyValue("--c"))).toBeCloseTo(2 * Math.PI * 45, 3);
  });

  it("runs red, amber, GREEN — a starting light, not a clock running out", () => {
    // Deliberately the opposite of statusColour. Green must be LAST because green means
    // go; a count that turned red on "1" would tell a player to stop at the instant they
    // are meant to move (RD-113). jsdom normalises a hex to rgb(), so compare likewise.
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
    expect(new Set(seen).size, "three seconds, three lights").toBe(3);
    expect(seen[0], "3 is red").toBe(asRgb(PALETTE.hazard));
    expect(seen[1], "2 is amber").toBe(asRgb(PALETTE.warn));
    expect(seen[2], "1 is green — GO").toBe(asRgb(PALETTE.ok));
  });
});

describe("driven the way the render loop drives it (R2, R5)", () => {
  it("shows every number for its whole second", () => {
    // The playtest report: "3 goes quickly to 1, with 2 not visible and 1 as well".
    // countdownAt is correct — 3, 2 and 1 each hold a second — so the fault is in what
    // gets DRAWN when the same value arrives sixty times a second.
    const { ui, q } = mount();
    const endsAt = 3000;
    const drawn: string[] = [];
    for (let t = 0; t < 3000; t += 16) {
      ui.setCountdown(countdownAt(endsAt, t));
      drawn.push(q<HTMLElement>("#tickNum").textContent ?? "");
    }
    const held = (d: string) => drawn.filter((x) => x === d).length;
    expect(held("3"), "3 held for about a second of frames").toBeGreaterThan(50);
    expect(held("2"), "2 held for about a second of frames").toBeGreaterThan(50);
    expect(held("1"), "1 held for about a second of frames").toBeGreaterThan(50);
  });

  it("restarts the sweep for each number, not just the first", () => {
    // The ring drained once and then sat full: setting the offset to 0 started a
    // one-second transition TOWARD 0, and the very next frame set it back, so the second
    // and third seconds animated nothing.
    const { ui, q } = mount();
    const offsets: string[] = [];
    for (const n of [3, 2, 1]) {
      ui.setCountdown(n);
      offsets.push(q<SVGCircleElement>("#tickRing").style.getPropertyValue("--c"));
    }
    // Every number re-arms the sweep. As a transition this ran exactly once; as an
    // animation retriggered by class it runs for each second (RD-113).
    expect(offsets.every((o) => o === offsets[0])).toBe(true);
    expect(q<SVGCircleElement>("#tickRing").classList.contains("drain")).toBe(true);
  });
});

describe("replaying a CSS animation actually flushes layout (RD-114)", () => {
  it("removes the class, flushes, and puts it back", () => {
    const host = document.createElement("div");
    const el = document.createElement("span");
    el.classList.add("land");
    expect(replayAnimation(el, "land", host)).toBe(true);
    expect(el.classList.contains("land")).toBe(true);
  });

  it("reads the flush from the HOST, not from the element itself", () => {
    // The bug: `offsetWidth` is HTMLElement's, and an SVG <circle> has none. Reading it
    // there yields undefined, forces no reflow, and the animation runs exactly once.
    let reads = 0;
    const host = document.createElement("div");
    Object.defineProperty(host, "offsetWidth", { get: () => { reads++; return 1; } });
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    replayAnimation(svg, "drain", host);
    expect(reads, "layout was flushed exactly once").toBe(1);
    expect(svg.classList.contains("drain")).toBe(true);
  });

  it("adds the class even when it was not there to begin with", () => {
    const host = document.createElement("div");
    const el = document.createElement("span");
    expect(replayAnimation(el, "land", host)).toBe(true);
    expect(el.classList.contains("land")).toBe(true);
  });
});
