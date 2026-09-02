/**
 * @vitest-environment jsdom
 *
 * The spectator chip, MOUNTED (spectating R2, R3).
 *
 * From the first phone playtest: joining a match already in progress drops you into
 * the arena as a spectator with no controls and nothing saying why. The waiting card
 * that explains it is taken away by the very `roundStart` that puts you there, so the
 * screen goes from explaining itself to explaining nothing at the moment it matters.
 *
 * Asserted against the mounted DOM rather than a string, for the reason
 * `controls.dom.test.ts` sets out: the failures that actually ship are wiring, not
 * values.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { Ui } from "./screens.ts";

const mount = () => {
  const root = document.createElement("div");
  document.body.append(root);
  const ui = new Ui(root, {
    onCreate: () => {}, onJoin: () => {}, onStart: () => {}, onEvent: () => {},
    onToggleMute: () => false, onQuit: () => {}, onVolume: () => {},
  });
  return { ui, root, hud: () => (root.querySelector("#hud") as HTMLElement).innerHTML };
};

beforeEach(() => { document.body.innerHTML = ""; });

describe("the spectator chip (spectating R2)", () => {
  it("says you are watching, and which round you are in from", () => {
    const { ui, hud } = mount();
    ui.setSpectating(true, 2, 5);
    ui.renderHud(undefined);
    expect(hud()).toContain("watching");
    // A wait with a shape rather than an open-ended one (R2's second AC).
    expect(hud()).toContain("in for round 3");
  });

  it("falls back to a shapeless message rather than inventing a round number", () => {
    const { ui, hud } = mount();
    ui.setSpectating(true);
    ui.renderHud(undefined);
    expect(hud()).toContain("in next round");
  });

  it("does not promise a round after the last one", () => {
    const { ui, hud } = mount();
    ui.setSpectating(true, 5, 5);
    ui.renderHud(undefined);
    expect(hud()).not.toContain("round 6");
    expect(hud()).toContain("watching");
  });

  it("survives a HUD re-render, which happens every frame", () => {
    const { ui, hud } = mount();
    ui.setSpectating(true, 1, 5);
    for (let k = 0; k < 5; k++) ui.renderHud(undefined);
    expect(hud()).toContain("watching");
  });

  it("goes away when cleared, so it cannot outlive its round", () => {
    const { ui, hud } = mount();
    ui.setSpectating(true, 1, 5);
    ui.renderHud(undefined);
    ui.setSpectating(false);
    ui.renderHud(undefined);
    expect(hud()).not.toContain("watching");
  });
});

describe("watching is not a dead screen (spectating R3)", () => {
  it("is a chip in the HUD, never a blocking overlay", () => {
    // The whole point: R3 wants the arena visible while you wait. Explaining the wait
    // by covering the thing you are waiting to watch trades one dead screen for another.
    const { ui, root } = mount();
    ui.setSpectating(true, 1, 5);
    ui.renderHud(undefined);
    const banner = root.querySelector("#banner") as HTMLElement;
    expect(banner.style.display).not.toBe("flex");
  });

  it("sits in the HUD row, which is clear of the stick and the button", () => {
    const { ui, root } = mount();
    ui.setSpectating(true, 1, 5);
    ui.renderHud(undefined);
    const chip = root.querySelector("#hud .spectate");
    expect(chip).not.toBeNull();
  });
});

describe("the stalled chip (RD-081)", () => {
  it("says the connection is the problem, rather than freezing silently", () => {
    // Measured on a phone: p50 31ms, p95 41ms, then an occasional multi-second
    // blackout. Everything correctly freezes — the buffer holds (I6) and prediction
    // holds with it — but freezing while saying nothing reads as broken.
    const { ui, hud } = mount();
    ui.setStalled(true);
    ui.renderHud(undefined);
    expect(hud()).toContain("reconnecting");
  });

  it("goes away as soon as the stream returns", () => {
    const { ui, hud } = mount();
    ui.setStalled(true);
    ui.renderHud(undefined);
    ui.setStalled(false);
    ui.renderHud(undefined);
    expect(hud()).not.toContain("reconnecting");
  });

  it("coexists with the spectator chip rather than replacing it", () => {
    const { ui, hud } = mount();
    ui.setStalled(true);
    ui.setSpectating(true, 2, 5);
    ui.renderHud(undefined);
    expect(hud()).toContain("reconnecting");
    expect(hud()).toContain("watching");
  });
});

describe("both status chips actually draw their dot", () => {
  it("gives the dot its size from a shared rule, not one chip's selector", async () => {
    // The stalled chip set only the dot's COLOUR, while width, height and border lived
    // under `.spectate .eye` — so it inherited no size and drew nothing. Caught by
    // looking at the picture, not by any assertion about the markup, which was correct.
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(join(here, "kit.ts"), "utf8");
    expect(css).toContain(".gauge .eye{width:");
    expect(css).not.toContain(".spectate .eye{width:");
  });

  it("marks both chips up with the same dot element", () => {
    const { ui, root } = mount();
    ui.setStalled(true);
    ui.setSpectating(true, 1, 5);
    ui.renderHud(undefined);
    expect(root.querySelectorAll("#hud .gauge .eye").length).toBe(2);
  });
});

describe("the stalled dot wins the cascade", () => {
  it("beats the shared dot rule on specificity, not on source order", async () => {
    // `.stalled .eye` and `.gauge .eye` are both two classes, so at equal specificity
    // the later rule wins — and the shared one comes later, so the alarm drew in the
    // waiting chip's yellow. Visible in a screenshot, invisible to every assertion
    // about the markup, which was right the whole time.
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(join(here, "kit.ts"), "utf8");
    expect(css).toContain(".gauge.stalled .eye{background:");
    expect(css).not.toMatch(/(?<!\.gauge)\.stalled \.eye\{background:/);
  });
});

describe("the HUD only touches the DOM when it changed (RD-084)", () => {
  it("keeps the same element across identical frames, so an animation can run", () => {
    // The real cost was not the reparse. A recreated element RESTARTS its CSS
    // animation, so the pulsing dot on these chips was destroyed and rebuilt ~60 times
    // a second and never advanced a frame — it has never pulsed on any device.
    const { ui, root } = mount();
    ui.setSpectating(true, 2, 5);
    ui.renderHud(undefined);
    const first = root.querySelector("#hud .eye");
    expect(first).not.toBeNull();
    for (let f = 0; f < 60; f++) ui.renderHud(undefined);
    // The very same node, one second of frames later.
    expect(root.querySelector("#hud .eye")).toBe(first);
  });

  it("still redraws the moment the content actually changes", () => {
    const { ui, root, hud } = mount();
    ui.setSpectating(true, 2, 5);
    ui.renderHud(undefined);
    const before = root.querySelector("#hud .gauge");
    ui.setSpectating(false);
    ui.renderHud(undefined);
    expect(hud()).not.toContain("watching");
    expect(root.querySelector("#hud .gauge")).not.toBe(before);
  });

  it("redraws after clearHud, even if the markup is identical to before", () => {
    // clearHud empties the DOM; without invalidating the memo the next identical
    // render would compare equal and skip an assignment the DOM genuinely needs.
    const { ui, hud } = mount();
    ui.setSpectating(true, 1, 5);
    ui.renderHud(undefined);
    expect(hud()).toContain("watching");
    ui.clearHud();
    expect(hud()).toBe("");
    ui.renderHud(undefined);
    expect(hud()).toContain("watching");
  });

  it("skips the overwhelming majority of frames in a real round", () => {
    // The clock ticks once a second and a count changes on a pickup; everything else
    // is the same markup. Counted rather than asserted in the abstract.
    const { ui, root } = mount();
    let rebuilds = 0;
    const hudEl = root.querySelector("#hud") as HTMLElement;
    let last = "";
    for (let frame = 0; frame < 120; frame++) {
      // Two seconds at 60fps, with the clock changing once per second.
      ui.renderHud(undefined, { name: "the round", round: 1, of: 5 });
      if (hudEl.innerHTML !== last) { rebuilds++; last = hudEl.innerHTML; }
    }
    expect(rebuilds).toBe(1);
  });
});
