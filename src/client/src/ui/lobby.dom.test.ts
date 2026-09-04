/**
 * @vitest-environment jsdom
 *
 * The lobby, MOUNTED (lobby-social T7, T8, T9, T10).
 *
 * Written before the implementation. Every case drives the real `Ui` against a real DOM
 * — no stub, no source text (RD-107).
 */
import { describe, expect, it, vi } from "vitest";
import { PLAYER_COLOURS, type PlayerView } from "@ruckus/shared";
import { initialState, type FlowEvent, type FlowState } from "../flow.ts";
import { Ui } from "./screens.ts";
import { UI, UI_CSS } from "./kit.ts";

/** Typed explicitly, so `onEvent` keeps its parameter when a case overrides it. */
const noop = {
  onCreate: (_n: string) => {}, onJoin: (_c: string, _n: string) => {},
  onStart: () => {}, onEvent: (_e: FlowEvent) => {},
  onToggleMute: () => false, onQuit: () => {}, onVolume: (_s: number) => {},
};

const player = (slot: number, over: Partial<PlayerView> = {}): PlayerView => ({
  slot, name: `p${slot}`, colour: PLAYER_COLOURS[slot]!, score: 0,
  connected: true, ready: false, ...over,
});

const lobby = (over: Partial<FlowState> = {}): FlowState => ({
  ...initialState(), screen: "LOBBY", code: "ABCD",
  players: [player(0, { ready: true }), player(1), player(2)],
  mySlot: 1, host: 0, ...over,
});

function mount(handlers: Partial<typeof noop> = {}) {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  const style = document.createElement("style");
  style.textContent = UI_CSS;
  document.head.append(style);
  const root = document.createElement("div");
  document.body.append(root);
  const ui = new Ui(root, { ...noop, ...handlers });
  const at = <T extends Element>(sel: string): T => {
    const el = root.querySelector(sel);
    if (!el) throw new Error(`no element for ${sel}`);
    return el as T;
  };
  return { ui, root, at };
}

describe("READY and START (T7, R1, R2)", () => {
  it("gives a non-host a READY control and no START", () => {
    const { ui, at, root } = mount();
    ui.render(lobby());
    expect(at<HTMLElement>("#readyBtn")).toBeTruthy();
    expect(getComputedStyle(at<HTMLElement>("#startBtn")).display).toBe("none");
    expect(root.querySelector("#readyBtn")).toBeTruthy();
  });

  it("sends ready when tapped, and reflects the state it was given", () => {
    const events: FlowEvent[] = [];
    const { ui, at } = mount({ onEvent: (e: FlowEvent) => { events.push(e); } });
    ui.render(lobby());
    at<HTMLButtonElement>("#readyBtn").click();
    expect(events).toEqual([{ t: "wantReady", on: true }]);

    // The server's answer comes back through the roster; the button follows it.
    ui.render(lobby({ players: [player(0, { ready: true }), player(1, { ready: true }), player(2)] }));
    expect(at<HTMLButtonElement>("#readyBtn").classList.contains("on")).toBe(true);
  });

  it("hides READY from the host — START is their ready", () => {
    const { ui, at } = mount();
    ui.render(lobby({ mySlot: 0 }));
    expect(getComputedStyle(at<HTMLElement>("#readyBtn")).display).toBe("none");
    expect(getComputedStyle(at<HTMLElement>("#startBtn")).display).not.toBe("none");
  });

  it("keeps START shut until everyone is ready, and says who it is waiting for", () => {
    const { ui, at } = mount();
    // One straggler, so the note can name them. With two it counts instead, which is
    // its own case in flow.test.ts.
    ui.render(lobby({ mySlot: 0, players: [player(0, { ready: true }), player(1), player(2, { ready: true })] }));
    const btn = at<HTMLButtonElement>("#startBtn");
    expect(btn.disabled).toBe(true);
    expect(at<HTMLElement>("#waitNote").textContent).toContain("p1");

    ui.render(lobby({
      mySlot: 0,
      players: [player(0, { ready: true }), player(1, { ready: true }), player(2, { ready: true })],
    }));
    expect(at<HTMLButtonElement>("#startBtn").disabled).toBe(false);
  });

  it("gives both controls a real tap target", () => {
    const { ui, at } = mount();
    ui.render(lobby());
    for (const sel of ["#readyBtn", "#startBtn"]) {
      expect(parseFloat(getComputedStyle(at<HTMLElement>(sel)).minHeight), sel)
        .toBeGreaterThanOrEqual(UI.minTarget);
    }
  });
});

describe("the colour row (T8, R3)", () => {
  it("offers every palette colour", () => {
    const { ui, root } = mount();
    ui.render(lobby());
    expect(root.querySelectorAll("#colourRow .swatch")).toHaveLength(PLAYER_COLOURS.length);
  });

  it("marks the ones other players hold as unavailable, and mine as mine", () => {
    const { ui, root } = mount();
    ui.render(lobby());   // slots 0,1,2 hold colours 0,1,2; I am slot 1
    const sw = [...root.querySelectorAll<HTMLElement>("#colourRow .swatch")];
    expect(sw[0]!.hasAttribute("disabled")).toBe(true);   // slot 0 holds it
    expect(sw[2]!.hasAttribute("disabled")).toBe(true);   // slot 2 holds it
    expect(sw[1]!.classList.contains("mine")).toBe(true); // mine
    expect(sw[3]!.hasAttribute("disabled")).toBe(false);  // vacant
  });

  it("asks for a vacant colour and says nothing about a taken one", () => {
    const events: FlowEvent[] = [];
    const { ui, root } = mount({ onEvent: (e: FlowEvent) => { events.push(e); } });
    ui.render(lobby());
    const sw = [...root.querySelectorAll<HTMLElement>("#colourRow .swatch")];
    sw[0]!.click();                       // taken by the host
    expect(events, "a taken swatch sends nothing").toEqual([]);
    sw[5]!.click();                       // vacant
    expect(events).toEqual([{ t: "wantColour", c: PLAYER_COLOURS[5] }]);
  });

  it("is entirely inert at a full lobby, which is the known cost", () => {
    const { ui, root } = mount();
    ui.render(lobby({
      players: PLAYER_COLOURS.map((_, s) => player(s)), mySlot: 1, host: 0,
    }));
    const free = [...root.querySelectorAll<HTMLElement>("#colourRow .swatch")]
      .filter((s) => !s.hasAttribute("disabled") && !s.classList.contains("mine"));
    expect(free).toHaveLength(0);
  });
});

describe("the roster wears the CLAIMED colour, not the slot's (T8, R3)", () => {
  it("draws each row in the colour that player actually holds", () => {
    // The bug this prevents: the scoreboard coloured rows by `colourFor(slot)`, which is
    // the colour a slot was ASSIGNED. Once a colour can be claimed those disagree, and
    // the dot beside your name stops matching the capsule you are chasing on screen.
    const { ui, root } = mount();
    const swapped = [
      player(0, { colour: PLAYER_COLOURS[7]!, ready: true }),
      player(1, { colour: PLAYER_COLOURS[6]! }),
    ];
    ui.render(lobby({ players: swapped, mySlot: 1 }));
    // jsdom normalises a hex background to rgb(), so compare through the same lens
    // rather than against the literal we wrote.
    const asRgb = (hex: string): string => {
      const probe = document.createElement("div");
      probe.style.background = hex;
      return probe.style.background;
    };
    const dots = [...root.querySelectorAll<HTMLElement>("#scoreboard .dot")];
    expect(dots[0]!.style.background).toBe(asRgb(PLAYER_COLOURS[7]!));
    expect(dots[1]!.style.background).toBe(asRgb(PLAYER_COLOURS[6]!));
  });
});

describe("arrivals and departures are announced (T9, R4)", () => {
  it("names an arrival, once", () => {
    const { ui, at } = mount();
    ui.render(lobby({ players: [player(0, { ready: true })], mySlot: 0 }));
    ui.render(lobby({ players: [player(0, { ready: true }), player(1)], mySlot: 0 }));
    expect(at<HTMLElement>("#toast").textContent).toContain("p1");
  });

  it("says nothing about my own arrival", () => {
    const { ui, at } = mount();
    ui.render(lobby({ players: [player(0, { ready: true }), player(1)], mySlot: 1 }));
    expect(at<HTMLElement>("#toast").textContent ?? "").not.toContain("p1");
  });

  it("coalesces several at once rather than stacking a wall of them", () => {
    const { ui, at } = mount();
    ui.render(lobby({ players: [player(0, { ready: true })], mySlot: 0 }));
    ui.render(lobby({
      players: [player(0, { ready: true }), player(1), player(2), player(3)], mySlot: 0,
    }));
    const text = at<HTMLElement>("#toast").textContent ?? "";
    expect(text).toMatch(/3/);            // "3 players joined", not three toasts
  });

  it("escapes a name rather than letting it inject markup", () => {
    const { ui, at } = mount();
    ui.render(lobby({ players: [player(0, { ready: true })], mySlot: 0 }));
    ui.render(lobby({
      players: [player(0, { ready: true }), player(1, { name: "<img src=x onerror=1>" })],
      mySlot: 0,
    }));
    expect(at<HTMLElement>("#toast").querySelector("img")).toBeNull();
  });
});

describe("removing a player asks first (T7, R5)", () => {
  it("shows a kick control to the host on everyone else's row, and not their own", () => {
    const { ui, root } = mount();
    ui.render(lobby({ mySlot: 0 }));
    const kicks = [...root.querySelectorAll<HTMLElement>("#scoreboard .kick")];
    expect(kicks).toHaveLength(2);                       // p1 and p2, not the host
    expect(kicks.some((k) => k.dataset.slot === "0")).toBe(false);
  });

  it("shows none at all to a non-host", () => {
    const { ui, root } = mount();
    ui.render(lobby({ mySlot: 1 }));
    expect(root.querySelectorAll("#scoreboard .kick")).toHaveLength(0);
  });

  it("confirms before it acts, and cancelling sends nothing", () => {
    const events: FlowEvent[] = [];
    const { ui, root, at } = mount({ onEvent: (e: FlowEvent) => { events.push(e); } });
    ui.render(lobby({ mySlot: 0 }));
    root.querySelector<HTMLElement>("#scoreboard .kick")!.click();
    expect(events, "not yet — it asks first").toEqual([]);
    expect(at<HTMLElement>("#kickConfirm").textContent).toContain("p1");

    at<HTMLButtonElement>("#kickCancel").click();
    expect(events).toEqual([]);
  });

  it("sends exactly one kick when confirmed", () => {
    const events: FlowEvent[] = [];
    const { ui, root, at } = mount({ onEvent: (e: FlowEvent) => { events.push(e); } });
    ui.render(lobby({ mySlot: 0 }));
    root.querySelector<HTMLElement>("#scoreboard .kick")!.click();
    at<HTMLButtonElement>("#kickOk").click();
    expect(events).toEqual([{ t: "wantKick", slot: 1 }]);
  });
});

describe("the lobby shows no scores, because nobody has played (RD-114)", () => {
  it("leaves the score column out entirely", () => {
    // A column of zeros beside every name reads as part of the ready state — the
    // playtest photo showed "ready 0" on every row and it was taken as "not ready".
    const { ui, root } = mount();
    ui.render(lobby());
    expect(root.querySelectorAll("#scoreboard .sc")).toHaveLength(0);
  });

  it("still shows who is ready", () => {
    const { ui, root } = mount();
    ui.render(lobby({ players: [player(0, { ready: true }), player(1)] }));
    expect(root.querySelectorAll("#scoreboard .rdy")).toHaveLength(1);
  });
});

describe("the lobby's actions are never below the fold (RD-114)", () => {
  it("keeps READY and START outside the scrolling half", () => {
    // On a landscape phone the card is bounded and scrolls inside itself (RD-055). The
    // roster grows with the room; the actions must not move with it, or the primary
    // action is one a player has to discover by scrolling.
    const { ui, root } = mount();
    ui.render(lobby());
    const scroller = root.querySelector(".lobbyscroll")!;
    expect(scroller.querySelector("#scoreboard"), "roster scrolls").toBeTruthy();
    expect(scroller.querySelector("#colourRow"), "colour row scrolls").toBeTruthy();
    expect(scroller.querySelector("#readyBtn"), "READY is pinned").toBeNull();
    expect(scroller.querySelector("#startBtn"), "START is pinned").toBeNull();
  });
});
