/**
 * @vitest-environment jsdom
 *
 * The in-game menu, MOUNTED (in-game-menu T2, T3, T4).
 *
 * From the first phone playtest: there was no way to turn the game down and no way to
 * leave a room. Both matter most on a phone someone lent you.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { VOLUME_STEPS } from "../kit/sound.ts";
import { Ui } from "./screens.ts";

const mount = () => {
  const root = document.createElement("div");
  document.body.append(root);
  const calls = { quit: 0, volume: [] as number[] };
  const ui = new Ui(root, {
    onCreate: () => {}, onJoin: () => {}, onStart: () => {}, onEvent: () => {},
    onToggleMute: () => false,
    onQuit: () => { calls.quit++; },
    onVolume: (s) => { calls.volume.push(s); },
  });
  return { ui, root, calls };
};

const q = <T extends Element>(root: HTMLElement, sel: string): T =>
  root.querySelector(sel) as T;

beforeEach(() => { document.body.innerHTML = ""; });

describe("the opener (T2, R1, P6)", () => {
  it("appears whenever the client is in a room, and hides on the main menu", () => {
    // R1 wants it in the lobby and on the round-over card too, not only mid-round —
    // so it is its own fixed element rather than part of the per-frame HUD.
    const { ui, root } = mount();
    expect(q<HTMLElement>(root, "#gearBtn").style.display).toBe("none");
    ui.setInRoom(true);
    expect(q<HTMLElement>(root, "#gearBtn").style.display).not.toBe("none");
    ui.setInRoom(false);
    expect(q<HTMLElement>(root, "#gearBtn").style.display).toBe("none");
  });

  it("is bound once and survives any number of HUD re-renders", () => {
    // The HUD rewrites innerHTML every frame; a button living inside it would lose its
    // listener with the node it was bound to (the RD-042 shape). Keeping it outside is
    // what makes one binding correct.
    const { ui, root } = mount();
    let opened = 0;
    ui.onOpenSettings = () => { opened++; };
    ui.setInRoom(true);
    for (let k = 0; k < 4; k++) ui.renderHud(undefined);
    (q(root, "#gearBtn") as HTMLButtonElement).click();
    expect(opened).toBe(1);
  });

  it("takes the panel away with it when the room is left", () => {
    const { ui, root } = mount();
    ui.setInRoom(true);
    ui.openSettings(2);
    ui.setInRoom(false);
    expect(ui.settingsOpen).toBe(false);
    expect(q<HTMLElement>(root, "#gearBtn").style.display).toBe("none");
  });
});

describe("volume steps (T2, R2, R5)", () => {
  it("draws one segment per step and marks exactly the chosen one", () => {
    const { ui, root } = mount();
    ui.openSettings(1);
    const steps = root.querySelectorAll("#volSteps .step");
    expect(steps.length).toBe(VOLUME_STEPS.length);
    expect(root.querySelectorAll("#volSteps .step.on").length).toBe(1);
    expect((steps[1] as HTMLElement).classList.contains("on")).toBe(true);
  });

  it("reports the step that was tapped and re-marks it", () => {
    const { ui, root, calls } = mount();
    ui.openSettings(3);
    (root.querySelectorAll("#volSteps .step")[0] as HTMLButtonElement).click();
    expect(calls.volume).toEqual([0]);
    expect((root.querySelectorAll("#volSteps .step")[0] as HTMLElement).classList.contains("on")).toBe(true);
    expect(root.querySelectorAll("#volSteps .step.on").length).toBe(1);
  });

  it("says which step it is for a screen reader", () => {
    const { ui, root } = mount();
    ui.openSettings(2);
    expect(q(root, '#volSteps .step[aria-pressed="true"]')).not.toBeNull();
  });
});

describe("leaving (T3, R3)", () => {
  it("asks main.ts to quit, and closes itself on the way out", () => {
    const { ui, root, calls } = mount();
    ui.openSettings(3);
    expect(ui.settingsOpen).toBe(true);
    (q(root, "#quitBtn") as HTMLButtonElement).click();
    expect(calls.quit).toBe(1);
    // Closed, so returning to the menu does not arrive with the panel still up.
    expect(ui.settingsOpen).toBe(false);
  });

  it("closes without quitting when the back button is used", () => {
    const { ui, root, calls } = mount();
    ui.openSettings(3);
    (q(root, "#closeSettings") as HTMLButtonElement).click();
    expect(ui.settingsOpen).toBe(false);
    expect(calls.quit).toBe(0);
  });
});

describe("the menu is inert with respect to the round (T4, R4, P4)", () => {
  it("does not pause, hide or otherwise disturb the arena behind it", () => {
    // The server never stops (I1). A menu that looked like a pause it could not
    // deliver would be a lie, so opening it must leave the game exactly as it was.
    const { ui, root } = mount();
    ui.renderHud(undefined, { name: "the round", round: 2, of: 5 });
    const hudBefore = q<HTMLElement>(root, "#hud").innerHTML;
    ui.openSettings(2);
    expect(q<HTMLElement>(root, "#hud").innerHTML).toBe(hudBefore);
    // The banner is the thing that covers the arena; settings is not it.
    expect(q<HTMLElement>(root, "#banner").style.display).not.toBe("flex");
  });

  it("opens and closes without touching the volume or quitting", () => {
    const { ui, calls } = mount();
    ui.openSettings(2);
    ui.closeSettings();
    expect(calls.volume).toEqual([]);
    expect(calls.quit).toBe(0);
  });
});

describe("quitting is the disconnect path, not a parallel one (T3, P3)", () => {
  it("adds no ClientMsg variant to the protocol", async () => {
    // R3's last AC. If leaving ever needs its own message, it becomes a second way to
    // cause one outcome — and the second way is the one that rots, because only the
    // disconnect path is exercised by every dropped phone in every real game.
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    const proto = readFileSync(join(here, "../../../shared/src/protocol.ts"), "utf8");
    for (const invented of ['"leave"', '"quit"', '"disconnect"', '"part"']) {
      expect(proto).not.toContain(invented);
    }
  });

  it("closes the socket rather than sending anything", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    const main = readFileSync(join(here, "../main.ts"), "utf8");
    const quit = main.slice(main.indexOf("onQuit:"), main.indexOf("onQuit:") + 700);
    expect(quit).toContain("net.close()");
    expect(quit).not.toContain("net.send");
  });
});

describe("the opener is genuinely top-left (T2, R1, P6)", () => {
  it("is pinned, not carried along by the HUD's centred row", async () => {
    // It was first in #hud, which centres its children, so it drew beside the round
    // label in the middle of the screen — the corner the requirement names was not the
    // corner it landed in.
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(join(here, "kit.ts"), "utf8");
    const rule = css.slice(css.indexOf(".iconbtn.gear{"), css.indexOf(".iconbtn.gear{") + 200);
    expect(rule).toContain("position:absolute");
    expect(rule).toContain("--safe-left");
    expect(rule).toContain("--safe-top");
    // Never the corners the stick and the action button own.
    expect(rule).not.toContain("bottom:");
  });
});
