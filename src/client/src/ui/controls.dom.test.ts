/**
 * @vitest-environment jsdom
 *
 * The controls, MOUNTED (auto-playtest R6; RD-062).
 *
 * Every other test in this directory reads `CONTROLS_CSS` and `CONTROLS_HTML` as
 * strings, or greps `controls.ts` for a line. That catches a wrong value and is blind
 * to a wrong wiring — which is the half that has actually broken:
 *
 *   RD-042  the button assigned `textContent`, destroying the icon, the ring and the
 *           number; `setAction` then wrote to a node no longer in the document
 *   RD-044  an SVG sized by percentage fell back to its intrinsic 300x150
 *   RD-054  the drawn-verb memo started as a real verb while the markup was empty, so
 *           the first icon of a round was never drawn
 *
 * All three were found by a person looking at a phone. None of them could have been
 * found by asserting on a string, because in each case the string was correct and what
 * the DOM did with it was not.
 *
 * jsdom lays out nothing, so this cannot answer where anything IS — `tools/gallery.sh`
 * and a real phone answer that. It answers what is in the tree after a call.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { ACTION_VERBS } from "@ruckus/shared";
import { Controls } from "./controls.ts";
import { iconPath } from "./icons.ts";
import { InputController } from "../input.ts";

const mount = (): { controls: Controls; host: HTMLElement } => {
  const host = document.createElement("div");
  document.body.append(host);
  return { controls: new Controls(host, new InputController(document.body)), host };
};

const q = <T extends Element>(host: HTMLElement, sel: string): T =>
  host.querySelector(sel) as T;

beforeEach(() => {
  document.body.innerHTML = "";
  // A forced surface, so the touch half is what gets built (RD-052). Without it jsdom
  // reports no coarse pointer and the keyboard guide is what mounts.
  window.history.replaceState(null, "", "/?surface=touch");
});

describe("the button survives being shown (RD-042)", () => {
  it("still has its icon, ring and number after show()", () => {
    const { controls, host } = mount();
    controls.show("TUMBLE");
    expect(q(host, "#actionIcon")).not.toBeNull();
    expect(q(host, "#cooldownRing")).not.toBeNull();
    expect(q(host, "#cooldownNum")).not.toBeNull();
  });

  it("names itself for a screen reader without eating its own children", () => {
    const { controls, host } = mount();
    controls.show("TUMBLE");
    const btn = q<HTMLButtonElement>(host, "#actionBtn");
    expect(btn.getAttribute("aria-label")).toBe("tumble");
    expect(btn.children.length).toBeGreaterThan(1);
  });
});

describe("the first icon of a round is actually drawn (RD-054)", () => {
  it("draws every verb from a cold mount, including the memo's old default", () => {
    // The bug: the drawn-verb field started as "tumble" while `d` was empty, so a
    // round OPENING on tumble skipped the only draw it would ever get. A fresh
    // Controls per verb is exactly the situation that broke.
    for (const verb of ACTION_VERBS) {
      document.body.innerHTML = "";
      const { controls, host } = mount();
      controls.show(verb.toUpperCase());
      controls.setAction({ v: ACTION_VERBS.indexOf(verb) });
      expect(q(host, "#actionIcon").getAttribute("d"), verb).toBe(iconPath(verb));
    }
  });

  it("swaps the drawing when the verb changes mid-round", () => {
    // Hot Potato hands the bomb over: the holder's button becomes a throw and back.
    const { controls, host } = mount();
    controls.show("PASS");
    controls.setAction({ v: ACTION_VERBS.indexOf("pass") });
    expect(q(host, "#actionIcon").getAttribute("d")).toBe(iconPath("pass"));
    controls.setAction({ v: ACTION_VERBS.indexOf("tumble") });
    expect(q(host, "#actionIcon").getAttribute("d")).toBe(iconPath("tumble"));
  });
});

describe("the cooldown is driven by the snapshot, never a local clock", () => {
  it("shows the number and arms the sweep while cooling", () => {
    const { controls, host } = mount();
    controls.show("TUMBLE");
    controls.setAction({ v: ACTION_VERBS.indexOf("tumble"), r: 0.8 });
    expect(q(host, "#cooldownNum").textContent).toBe("0.8");
    expect(q(host, "#actionBtn").classList.contains("cooling")).toBe(true);
    expect(Number(q<SVGCircleElement>(host, "#cooldownRing circle").style.strokeDashoffset))
      .toBeGreaterThan(0);
  });

  it("clears both the instant it is ready, so a ready button shows no clutter", () => {
    const { controls, host } = mount();
    controls.show("TUMBLE");
    controls.setAction({ v: ACTION_VERBS.indexOf("tumble"), r: 0.8 });
    controls.setAction({ v: ACTION_VERBS.indexOf("tumble") });
    expect(q(host, "#cooldownNum").textContent).toBe("");
    expect(q(host, "#actionBtn").classList.contains("cooling")).toBe(false);
    expect(q<SVGCircleElement>(host, "#cooldownRing circle").style.strokeDashoffset).toBe("0");
  });
});

describe("a round with no button does not draw one (P3)", () => {
  it("hides the button when the round names no label", () => {
    const { controls, host } = mount();
    controls.show();
    expect(q<HTMLElement>(host, "#actionBtn").hidden).toBe(true);
    // The stick is not optional: every round has one.
    expect(q<HTMLElement>(host, "#stickBase").hidden).toBe(false);
  });

  it("hides everything when the round ends", () => {
    const { controls, host } = mount();
    controls.show("TUMBLE");
    controls.hide();
    expect(q<HTMLElement>(host, "#controls").hidden).toBe(true);
  });
});
