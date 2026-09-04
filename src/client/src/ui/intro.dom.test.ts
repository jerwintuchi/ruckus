/**
 * @vitest-environment jsdom
 *
 * The rule card and its skip tally, MOUNTED (round-open T6, T7).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { FlowEvent } from "../flow.ts";
import { initialState } from "../flow.ts";
import { Ui } from "./screens.ts";
import { UI_CSS } from "./kit.ts";

const noop = {
  onCreate: (_n: string) => {}, onJoin: (_c: string, _n: string) => {},
  onStart: () => {}, onEvent: (_e: FlowEvent) => {},
  onToggleMute: () => false, onQuit: () => {}, onVolume: (_s: number) => {},
};

function mount(handlers: Partial<typeof noop> = {}) {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  const style = document.createElement("style");
  style.textContent = UI_CSS;
  document.head.append(style);
  const root = document.createElement("div");
  document.body.append(root);
  const ui = new Ui(root, { ...noop, ...handlers });
  ui.render(initialState());
  return { ui, root };
}

describe("the rule card (R1)", () => {
  it("renders the minigame's one sentence verbatim, and the round it is", () => {
    const { ui, root } = mount();
    ui.showIntro("Hot Potato", "Pass the bomb before it goes off.", 3, 5, 0, 4);
    const text = root.textContent ?? "";
    expect(text).toContain("Pass the bomb before it goes off.");
    expect(text).toContain("round 3 of 5");
  });

  it("escapes a display name rather than letting it inject markup", () => {
    const { ui, root } = mount();
    ui.showIntro("<img src=x onerror=1>", "rule.", 1, 5, 0, 2);
    expect(root.querySelector("img")).toBeNull();
  });
});

describe("skipping is collective, and it never blocks (R2)", () => {
  it("shows the tally so tapping feels like a room decision", () => {
    const { ui, root } = mount();
    ui.showIntro("Sweepers", "Jump the sweepers.", 1, 5, 2, 6);
    expect(root.querySelector("#skipBtn")!.textContent).toContain("2/6");
  });

  it("sends exactly one skip, however many times it is tapped", () => {
    const events: FlowEvent[] = [];
    const { ui, root } = mount({ onEvent: (e: FlowEvent) => { events.push(e); } });
    ui.showIntro("Sweepers", "Jump the sweepers.", 1, 5, 0, 4);
    const btn = root.querySelector("#skipBtn") as HTMLButtonElement;
    btn.click(); btn.click(); btn.click();
    expect(events.filter((e) => e.t === "wantSkip")).toHaveLength(1);
  });

  it("updates the tally as others tap, without rebuilding the card", () => {
    const { ui, root } = mount();
    ui.showIntro("Sweepers", "Jump the sweepers.", 1, 5, 1, 4);
    const before = root.querySelector("#skipBtn");
    ui.setSkips(3, 4);
    expect(root.querySelector("#skipBtn")!.textContent).toContain("3/4");
    expect(root.querySelector("#skipBtn"), "same node — the rule must not flicker").toBe(before);
  });

  it("says nothing about a tally when you are the only one there", () => {
    const { ui, root } = mount();
    ui.showIntro("Sweepers", "Jump the sweepers.", 1, 5, 0, 1);
    expect(root.querySelector("#skipBtn")!.textContent).not.toContain("/");
  });
});

describe("the client does not rebuild the card for a tally update (R1)", () => {
  it("keeps the rule on screen while the count climbs", () => {
    // A source-level guard on main.ts's wiring: the behaviour it protects — that
    // `setSkips` leaves the node alone — is exercised above by running it. What cannot
    // be reached from a unit is that main.ts CHOOSES between them, because main.ts is
    // the wiring.
    // Resolved from the repo root: under jsdom `import.meta.url` is an http URL, not
    // a file one, so readFileSync cannot take it.
    const src = readFileSync("src/client/src/main.ts", "utf8");
    const intro = src.slice(src.indexOf('case "intro"'), src.indexOf('case "roundStart"'));
    expect(intro).toContain("ui.setSkips(");
    expect(intro).toContain("introRound");
  });
});

describe("the card survives from intro to play (R1, R3)", () => {
  it("is not hidden by roundStart, which now arrives at the intro", () => {
    // The regression this pins: `roundStart` used to arrive AFTER the intro, so hiding
    // the banner there was right. It now arrives in the same breath as the rule card, so
    // hiding there destroyed the card the instant it appeared — and the countdown with
    // it, because the count lives inside that card.
    //
    // A wiring fact, so a wiring guard: which handler clears the banner is not something
    // any single object can be asked. What the banner DOES is tested by running it.
    const src = readFileSync("src/client/src/main.ts", "utf8");
    const roundStart = src.slice(src.indexOf('case "roundStart"'), src.indexOf('case "play"'));
    expect(roundStart).not.toContain("ui.hideBanner()");
    const play = src.slice(src.indexOf('case "play"'), src.indexOf('case "snap"'));
    expect(play).toContain("ui.hideBanner()");
  });

  it("keeps the count element alive for the whole card", () => {
    const { ui, root } = mount();
    ui.showIntro("Sweepers", "Jump the sweepers.", 1, 5, 0, 4);
    expect(root.querySelector("#count")).toBeTruthy();
    ui.setCountdown(3);
    expect(root.querySelector("#count")!.textContent).toContain("3");
  });
});
