import { describe, expect, it, vi } from "vitest";
import { ERROR_TEXT, initialState, type FlowState } from "../flow.ts";
import type { PlayerView } from "@ruckus/shared";
import { Ui } from "./screens.ts";

/**
 * A tiny DOM stub. Enough to prove the room code actually reaches the screen, which
 * is the thing that was missing: the code existed only in the join input and the URL,
 * so once you were in the lobby it was nowhere on screen — in a party game, the one
 * piece of information you have to read aloud.
 */
function stubDom() {
  class El {
    tagName: string;
    children: El[] = [];
    style: Record<string, string> = {};
    textContent = "";
    value = "";
    disabled = false;
    id = "";
    className = "";
    listeners: Record<string, (() => void)[]> = {};
    private html = "";

    constructor(tag: string) { this.tagName = tag; }
    set innerHTML(v: string) { this.html = v; this.parse(v); }
    get innerHTML(): string { return this.html; }
    addEventListener(ev: string, fn: () => void) { (this.listeners[ev] ??= []).push(fn); }
    click() { for (const fn of this.listeners.click ?? []) fn(); }
    select() {}
    querySelector(sel: string): El | null {
      const id = sel.replace("#", "");
      const walk = (n: El): El | null => {
        if (n.id === id) return n;
        for (const c of n.children) { const hit = walk(c); if (hit) return hit; }
        return null;
      };
      for (const c of this.children) { const hit = walk(c); if (hit) return hit; }
      return null;
    }
    /** Build a flat element per id in the template — enough for lookups by id. */
    private parse(html: string) {
      this.children = [];
      for (const m of html.matchAll(/<(\w+)[^>]*id="([^"]+)"/g)) {
        const el = new El(m[1]!);
        el.id = m[2]!;
        this.children.push(el);
      }
    }
  }
  const root = new El("div");
  return { root: root as unknown as HTMLElement, El };
}

/** The stub's elements, typed for the assertions below. */
type Probe = { style: Record<string, string>; textContent: string; innerHTML: string;
  value: string; disabled: boolean; readOnly: boolean; click(): void };
const at = (root: HTMLElement, sel: string): Probe =>
  root.querySelector(sel) as unknown as Probe;

const players = (n: number, connected = true): PlayerView[] =>
  Array.from({ length: n }, (_, slot) => ({
    slot, name: `p${slot}`, colour: "#1ab0ff", score: 0, connected,
  }));

const noop = { onCreate: () => {}, onJoin: () => {}, onStart: () => {}, onEvent: () => {} };

/** A flow state shaped for whichever screen a test is about. */
const lobby = (over: Partial<FlowState> = {}): FlowState => ({
  ...initialState(), screen: "LOBBY", code: "ABCD", players: players(3), mySlot: 0, host: 0, ...over,
});

describe("the room code is on screen (lobby-flow T7)", () => {
  it("renders the code the server gave us", () => {
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    ui.render(lobby({ code: "WXYZ" }));
    expect(at(root, "#roomCode").textContent).toBe("WXYZ");
  });

  it("shows a placeholder before a room exists, never a stale code", () => {
    const { root } = stubDom();
    new Ui(root, noop);
    expect(at(root, "#roomCode").textContent).not.toMatch(/[A-Z0-9]{4}/);
  });

  it("keeps showing it across re-renders", () => {
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    ui.render(lobby({ code: "A2B3" }));
    ui.render(lobby({ code: "A2B3", players: players(4) }));
    expect(at(root, "#roomCode").textContent).toBe("A2B3");
  });

  it("copies an invite link containing the code", async () => {
    const { root } = stubDom();
    const written: string[] = [];
    vi.stubGlobal("navigator", { clipboard: { writeText: async (t: string) => { written.push(t); } } });
    vi.stubGlobal("location", { origin: "http://192.168.1.9:5173", pathname: "/" });
    const ui = new Ui(root, noop);
    ui.render(lobby({ code: "PLAY" }));
    at(root, "#shareBtn").click();
    await new Promise((r) => setTimeout(r, 0));
    expect(written[0]).toContain("?room=PLAY");
    vi.unstubAllGlobals();
  });

  it("falls back to a selectable box when the clipboard is unavailable", async () => {
    // A LAN address over plain http is not a secure context, so on a phone this is
    // the path that actually runs — it must not fail silently.
    const { root } = stubDom();
    vi.stubGlobal("navigator", { clipboard: { writeText: async () => { throw new Error("insecure"); } } });
    vi.stubGlobal("location", { origin: "http://192.168.1.9:5173", pathname: "/" });
    const ui = new Ui(root, noop);
    ui.render(lobby({ code: "PLAY" }));
    at(root, "#shareBtn").click();
    await new Promise((r) => setTimeout(r, 0));
    expect(at(root, "#linkBox").style.display).toBe("block");
    expect(at(root, "#linkBox").value).toContain("?room=PLAY");
    vi.unstubAllGlobals();
  });
});

describe("the menu offers create and join (lobby-flow T7, R1)", () => {
  it("shows the menu first, and nothing else", () => {
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    ui.render(initialState());
    expect(at(root, "#menu").style.display).toBe("flex");
    expect(at(root, "#joining").style.display).toBe("none");
    expect(at(root, "#lobby").style.display).toBe("none");
  });

  it("create asks for a name and nothing else — no code to invent", () => {
    const { root } = stubDom();
    let created: string | null = null;
    const ui = new Ui(root, { ...noop, onCreate: (n: string) => { created = n; } });
    ui.render(initialState());
    at(root, "#name").value = "jerwin";
    at(root, "#createBtn").click();
    expect(created).toBe("jerwin");
  });

  it("swaps to the join screen when asked", () => {
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    ui.render({ ...initialState(), screen: "JOINING" });
    expect(at(root, "#joining").style.display).toBe("flex");
    expect(at(root, "#menu").style.display).toBe("none");
  });

  it("will not let you join on a half-typed code", () => {
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    ui.render({ ...initialState(), screen: "JOINING", code: "AB" });
    expect(at(root, "#joinBtn").disabled).toBe(true);
    ui.render({ ...initialState(), screen: "JOINING", code: "ABCD" });
    expect(at(root, "#joinBtn").disabled).toBe(false);
  });

  it("locks a code that arrived from a shared link", () => {
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    ui.render({ ...initialState(), screen: "JOINING", code: "PLAY", codeLocked: true });
    expect(at(root, "#code").readOnly).toBe(true);
  });

  it("shows an error where the player can act on it", () => {
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    ui.render({ ...initialState(), screen: "JOINING", code: "ZZZZ", error: ERROR_TEXT.NO_ROOM });
    expect(at(root, "#error").textContent).toContain("create your own");
  });
});

describe("the lobby explains itself (lobby-flow T8, R5)", () => {
  it("offers start to the host and hides it from everyone else", () => {
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    ui.render(lobby({ mySlot: 0, host: 0 }));
    expect(at(root, "#startBtn").style.display).toBe("block");
    ui.render(lobby({ mySlot: 2, host: 0 }));
    expect(at(root, "#startBtn").style.display).toBe("none");
  });

  it("tells a non-host who they are waiting for, by name", () => {
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    ui.render(lobby({ mySlot: 2, host: 0 }));
    expect(at(root, "#waitNote").textContent).toContain("p0");
  });

  it("says why the button is dead rather than just disabling it", () => {
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    ui.render(lobby({ players: players(1) }));
    expect(at(root, "#startBtn").disabled).toBe(true);
    expect(at(root, "#startBtn").textContent).toContain("one more");
  });

  it("hides the lobby once a match is running", () => {
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    ui.render(lobby({ screen: "IN_MATCH" }));
    expect(at(root, "#lobby").style.display).toBe("none");
  });
});

describe("the round card and results (shell T18)", () => {
  it("renders the minigame's one sentence verbatim", () => {
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    const rule = "The floor is falling, so keep moving.";
    ui.showIntro("Falling Floor", rule, 3, 5);
    const html = at(root, "#banner").innerHTML;
    expect(html).toContain(rule);
    expect(html).toContain("Falling Floor");
    expect(html).toContain("round 3 of 5");
  });

  it("escapes a name rather than letting it inject markup", () => {
    // Names come from other players and are shown to everyone (I2).
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    ui.showRoundEnd({ 0: 3 }, [
      { slot: 0, name: "<img src=x>", colour: "#1ab0ff", score: 3, connected: true },
    ]);
    expect(at(root, "#banner").innerHTML).not.toContain("<img");
  });

  it("orders the round result by points, highest first", () => {
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    ui.showRoundEnd({ 0: 1, 1: 3, 2: 2 }, players(3));
    const html = at(root, "#banner").innerHTML;
    const order = ["p1", "p2", "p0"].map((n) => html.indexOf(n));
    expect(order[0]).toBeLessThan(order[1]!);
    expect(order[1]).toBeLessThan(order[2]!);
  });

  it("leaves nobody who scored zero on the round card", () => {
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    ui.showRoundEnd({ 0: 3, 1: 0 }, players(2));
    const html = at(root, "#banner").innerHTML;
    expect(html).toContain("p0");
    expect(html).not.toContain("p1");
  });

  it("names the winner at the end of a match", () => {
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    ui.showMatchEnd(players(2)[1]);
    expect(at(root, "#banner").innerHTML).toContain("p1");
  });
});
