/**
 * @vitest-environment jsdom
 *
 * The mute control, MOUNTED (audio T2, R3).
 *
 * The screens suite runs against a stub DOM, which cannot express "did clicking this
 * change what is drawn". That gap is exactly where RD-042 lived: a button whose
 * children are its icon, and a paint that destroyed them. This one has two swapping
 * paths, so it is the same hazard again.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { Ui } from "./screens.ts";

const mount = (onToggleMute: () => boolean) => {
  const root = document.createElement("div");
  document.body.append(root);
  const ui = new Ui(root, {
    onCreate: () => {}, onJoin: () => {}, onStart: () => {}, onEvent: () => {},
    onToggleMute,
  });
  return { ui, root, btn: root.querySelector("#muteBtn") as HTMLButtonElement };
};

beforeEach(() => { document.body.innerHTML = ""; });

describe("the mute button says which state it is in", () => {
  it("shows the waves unmuted and the slash muted", () => {
    const { ui, root } = mount(() => false);
    ui.setMuted(false);
    expect((root.querySelector("#muteOn") as HTMLElement).hidden).toBe(false);
    expect((root.querySelector("#muteOff") as HTMLElement).hidden).toBe(true);
    ui.setMuted(true);
    expect((root.querySelector("#muteOn") as HTMLElement).hidden).toBe(true);
    expect((root.querySelector("#muteOff") as HTMLElement).hidden).toBe(false);
  });

  it("keeps its icon through every toggle (RD-042)", () => {
    // The failure this is for: paint the label with textContent and the svg is gone,
    // so the button becomes a blank square that still takes taps.
    const { ui, root, btn } = mount(() => true);
    for (const v of [true, false, true, false, true]) ui.setMuted(v);
    expect(root.querySelector("#muteBtn svg")).not.toBeNull();
    expect(root.querySelectorAll("#muteBtn path")).toHaveLength(3);
    expect(btn.textContent?.trim()).toBe("");
  });

  it("names itself for whoever cannot see the icon", () => {
    const { ui, btn } = mount(() => false);
    ui.setMuted(false);
    expect(btn.getAttribute("aria-label")).toBe("mute");
    ui.setMuted(true);
    expect(btn.getAttribute("aria-label")).toBe("unmute");
  });

  it("asks the handler and draws whatever it answers", () => {
    // The Ui holds no mute state of its own: the preference lives with the device, and
    // a second copy here is a second thing to get out of step.
    let muted = false;
    const { root, btn } = mount(() => { muted = !muted; return muted; });
    btn.click();
    expect((root.querySelector("#muteOff") as HTMLElement).hidden).toBe(false);
    btn.click();
    expect((root.querySelector("#muteOff") as HTMLElement).hidden).toBe(true);
  });
});
