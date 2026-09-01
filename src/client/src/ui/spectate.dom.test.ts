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
