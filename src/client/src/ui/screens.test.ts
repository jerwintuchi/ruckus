import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ERROR_TEXT, initialState, type FlowState } from "../flow.ts";
import { PLAYER_COLOURS, type PlayerView } from "@ruckus/shared";
import { Ui, wordmark } from "./screens.ts";

/**
 * A tiny DOM stub. Enough to prove the room code actually reaches the screen, which
 * is the thing that was missing: the code existed only in the join input and the URL,
 * so once you were in the lobby it was nowhere on screen — in a party game, the one
 * piece of information you have to read aloud.
 */
const baseState = (): FlowState => initialState();

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
    /** Enough of a classList for code that toggles a class; the set is inspectable. */
    classes = new Set<string>();
    classList = {
      add: (c: string) => this.classes.add(c),
      remove: (c: string) => this.classes.delete(c),
      contains: (c: string) => this.classes.has(c),
    };
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
  value: string; disabled: boolean; readOnly: boolean; classes: Set<string>; click(): void };
const SRC_DIR = dirname(new URL(import.meta.url).pathname);

const at = (root: HTMLElement, sel: string): Probe =>
  root.querySelector(sel) as unknown as Probe;

const players = (n: number, connected = true): PlayerView[] =>
  Array.from({ length: n }, (_, slot) => ({
    slot, name: `p${slot}`, colour: "#1ab0ff", score: 0, connected,
  }));

const noop = {
  onCreate: () => {}, onJoin: () => {}, onStart: () => {}, onEvent: () => {},
  onToggleMute: () => false,
};

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
    // A name is required now too (R9), so a whole code alone is no longer enough.
    ui.render({ ...initialState(), screen: "JOINING", name: "jerwin", code: "ABCD" });
    expect(at(root, "#joinBtn").disabled).toBe(false);
  });

  it("locks a code that arrived from a shared link", () => {
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    ui.render({ ...initialState(), screen: "JOINING", code: "PLAY", codeLocked: true });
    expect(at(root, "#code").readOnly).toBe(true);
  });

  it("shows a lobby error in the lobby, where the player is", () => {
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    ui.render(lobby({ error: ERROR_TEXT.NOT_HOST }));
    expect(at(root, "#lobby").style.display).not.toBe("none");
    expect(at(root, "#lobbyError").textContent).toContain("Only the host");
  });

  it("clears the error from every screen once it is resolved", () => {
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    ui.render({ ...initialState(), screen: "JOINING", error: ERROR_TEXT.NO_ROOM });
    ui.render({ ...initialState(), screen: "JOINING", error: null });
    for (const id of ["#error", "#joinError", "#lobbyError"]) {
      expect(at(root, id).textContent, id).toBe("");
    }
  });

  it("shows an error where the player can act on it", () => {
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    ui.render({ ...initialState(), screen: "JOINING", code: "ZZZZ", error: ERROR_TEXT.NO_ROOM });
    // The slot must belong to the screen being SHOWN. This used to assert `#error`,
    // which lives in the menu card: it passed while the message was painted into a
    // display:none element and the player, mid-join, saw the tap do nothing at all.
    expect(at(root, "#joining").style.display).not.toBe("none");
    expect(at(root, "#joinError").textContent).toContain("create your own");
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

  it("keeps a player who scored zero on the round card (REVERSED, RD-045)", () => {
    // This test used to assert the opposite: that a zero-scorer was left OFF the card.
    // That was a deliberate choice — a round card of eight rows where six say +0 is
    // noise — and it survived until someone played a real match and could not find
    // their own name on any leaderboard. Vision pillar 3 says losing stays watchable,
    // and being absent from the board is the opposite of watchable.
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    ui.showRoundEnd({ 0: 3, 1: 0 }, players(2));
    const html = at(root, "#banner").innerHTML;
    expect(html).toContain("p0");
    expect(html).toContain("p1");
  });

  it("names the winner at the end of a match", () => {
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    ui.showMatchEnd(players(2)[1]);
    expect(at(root, "#banner").innerHTML).toContain("p1");
  });
});

describe("arriving mid-match says so (arena-framing, I8)", () => {
  it("explains the empty arena instead of showing a blank sky", () => {
    // roundStart only fires at the start of a round, so a player who joins mid-round
    // has no arena and no camera — the debug readout showed screen IN_MATCH, arena
    // none, every overlay hidden. Correct state, nothing said.
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    ui.showWaiting();
    const banner = at(root, "#banner");
    expect(banner.style.display).toBe("flex");
    expect(banner.innerHTML).toContain("next one");
  });

  it("clears once a round actually starts", () => {
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    ui.showWaiting();
    ui.hideBanner();
    expect(at(root, "#banner").style.display).toBe("none");
  });
});

describe("the count on the intro card (round-brief T2, T3, R1, R3)", () => {
  const intro = (ui: Ui): void => ui.showIntro("Hot Potato", "Pass the bomb before it goes off.", 2, 5);

  it("keeps the rule verbatim beside the number", () => {
    // The count is an addition to the card, not a replacement for it: vision pillar 1
    // gives the rule five seconds to land and the number must not crowd it out.
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    intro(ui);
    ui.setCountdown(3);
    expect(at(root, "#banner").innerHTML).toContain("Pass the bomb before it goes off.");
  });

  it("draws the number, and nothing at all at zero", () => {
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    intro(ui);
    ui.setCountdown(3);
    expect(at(root, "#count").textContent).toBe("3");
    ui.setCountdown(1);
    expect(at(root, "#count").textContent).toBe("1");
    // The first second of the intro, and everything after the deadline.
    ui.setCountdown(0);
    expect(at(root, "#count").textContent).toBe("");
  });

  it("updates without a new message arriving (T3)", () => {
    // The render loop drives it against the server's deadline; no per-second traffic.
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    intro(ui);
    for (const n of [3, 3, 2, 1]) ui.setCountdown(n);
    expect(at(root, "#count").textContent).toBe("1");
  });

  it("does nothing when no intro card is showing", () => {
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    expect(() => ui.setCountdown(2)).not.toThrow();
  });
});

describe("copying the invite is one tap (lobby-flow T14, R10)", () => {
  const src = readFileSync(join(SRC_DIR, "screens.ts"), "utf8");

  it("is an icon button carrying an accessible label", () => {
    // An icon with no name is a mystery to a screen reader and to anyone who has not
    // seen a clipboard glyph before.
    const { root } = stubDom();
    new Ui(root, noop);
    expect(src).toContain('id="shareBtn"');
    expect(src).toContain('aria-label="copy invite link"');
    expect(src).toContain("<svg");
  });

  it("tries the clipboard, then execCommand, then selectable text — in that order", () => {
    // The order is the whole point and cannot be exercised in a unit test, because a
    // secure context cannot be faked. navigator.clipboard needs one and a phone on a
    // LAN over plain http does not have one, so execCommand is the path that actually
    // runs on the device this game is played on. If it were removed, or moved after
    // the link box, one-tap copy would silently stop existing.
    const share = src.slice(src.indexOf("private async share()"), src.indexOf("private copyByExecCommand"));
    const clipboard = share.indexOf("navigator.clipboard");
    const legacy = share.indexOf("copyByExecCommand");
    const box = share.indexOf("#linkBox");
    expect(clipboard).toBeGreaterThan(-1);
    expect(legacy).toBeGreaterThan(clipboard);
    expect(box).toBeGreaterThan(legacy);
  });

  it("copies from an off-screen element, not a hidden one", () => {
    // display:none cannot be selected and iOS will not copy from it. Off-screen can.
    const legacy = src.slice(src.indexOf("private copyByExecCommand"));
    expect(legacy).toContain("-9999px");
    expect(legacy).not.toContain("display: none");
    expect(legacy).toContain("setSelectionRange"); // iOS needs the explicit range
  });

  it("confirms with a banner that never has to be dismissed", () => {
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    ui.toast("invite link copied");
    expect(at(root, "#toast").textContent).toBe("invite link copied");
    expect(at(root, "#toast").classes.has("show")).toBe(true);
  });
});

describe("the match result says the room stays open (lobby-flow T16, R12)", () => {
  it("names the winner and says another match can start", () => {
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    ui.showMatchEnd({ slot: 0, name: "jerwin", colour: "#1ab0ff", score: 9, connected: true });
    const html = at(root, "#banner").innerHTML;
    expect(html).toContain("jerwin");
    expect(html).toContain("start again");
  });

  it("says it even when nobody won", () => {
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    ui.showMatchEnd(undefined);
    expect(at(root, "#banner").innerHTML).toContain("start again");
  });
});

describe("the name field explains itself (lobby-flow T14, R9)", () => {
  it("disables Create and says why until a name is typed", () => {
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    ui.render(initialState());
    expect(at(root, "#createBtn").disabled).toBe(true);
    expect(at(root, "#nameNote").textContent.length).toBeGreaterThan(0);
  });

  it("enables it and clears the note once the name is usable", () => {
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    ui.render({ ...initialState(), name: "jerwin" });
    expect(at(root, "#createBtn").disabled).toBe(false);
    expect(at(root, "#nameNote").textContent).toBe("");
  });
});

describe("a deep link can actually be joined (RD-042)", () => {
  // The bug this exists to prevent: the name requirement landed with the name field
  // only on the MENU, and a shared link opens straight on JOINING. Join sat disabled
  // asking for a name, with nowhere on that screen to type one — a total lock-out on
  // "tap a link, enter a room code, play", which is the whole first line of the vision.
  it("offers a name field on the screen a shared link actually opens", () => {
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    ui.render({ ...initialState(), screen: "JOINING", code: "C8ZK", codeLocked: true });
    expect(at(root, "#joining").style.display).not.toBe("none");
    expect(at(root, "#joinName")).toBeTruthy();
  });

  it("enables Join once a name is typed on that screen", () => {
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    const linked = { ...initialState(), screen: "JOINING" as const, code: "C8ZK", codeLocked: true };
    ui.render(linked);
    expect(at(root, "#joinBtn").disabled).toBe(true);
    ui.render({ ...linked, name: "jerwin" });
    expect(at(root, "#joinBtn").disabled).toBe(false);
  });

  it("keeps both name fields showing the same name", () => {
    // One piece of state, two inputs: typing on either screen must count.
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    ui.render({ ...initialState(), name: "sam" });
    expect(at(root, "#name").value).toBe("sam");
    expect(at(root, "#joinName").value).toBe("sam");
  });

  it("never disables a control without a field to satisfy it", () => {
    // The general form of the bug: every screen that can refuse for a reason must
    // carry the means to fix that reason.
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    for (const screen of ["MENU", "JOINING"] as const) {
      ui.render({ ...initialState(), screen, code: "C8ZK" });
      const field = screen === "MENU" ? "#name" : "#joinName";
      expect(at(root, field), screen).toBeTruthy();
    }
  });
});

describe("the results cards name everyone, including you (lobby-flow T17, R13)", () => {
  const roster: PlayerView[] = [
    { slot: 0, name: "bot-1", colour: "#1ab0ff", score: 5, connected: true },
    { slot: 1, name: "bot-2", colour: "#ff3f18", score: 3, connected: true },
    { slot: 4, name: "jerwin", colour: "#ffef14", score: 0, connected: true },
  ];

  it("lists a player who scored nothing this round", () => {
    // The reported bug: only bot names appeared, because the card filtered to scorers.
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    ui.render({ ...initialState(), screen: "LOBBY", mySlot: 4, players: roster });
    ui.showRoundEnd({ 0: 3, 1: 1 }, roster);
    expect(at(root, "#banner").innerHTML).toContain("jerwin");
  });

  it("marks your own row so you can find yourself at a glance", () => {
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    ui.render({ ...initialState(), screen: "LOBBY", mySlot: 4, players: roster });
    ui.showRoundEnd({ 0: 3 }, roster);
    expect(at(root, "#banner").innerHTML).toContain('class="row me"');
  });

  it("shows final standings at the end of the match, not just a winner", () => {
    // Showing one name meant seven players finished a ten-minute match without ever
    // seeing their own.
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    ui.render({ ...initialState(), screen: "LOBBY", mySlot: 4, players: roster });
    ui.showMatchEnd(roster[0], roster, { 0: 9, 1: 4, 4: 2 });
    const html = at(root, "#banner").innerHTML;
    for (const name of ["bot-1", "bot-2", "jerwin"]) expect(html, name).toContain(name);
    expect(html).toContain("start again");
  });

  it("still works with no roster at all", () => {
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    expect(() => ui.showMatchEnd(undefined)).not.toThrow();
  });
});

describe("the wordmark is the roster's own palette (ui-identity T1, R1)", () => {
  it("spells the name, in order, one span per letter", () => {
    const html = wordmark("ruckus");
    expect([...html.matchAll(/>([a-z])</g)].map((m) => m[1]).join("")).toBe("ruckus");
  });

  it("takes its colours from PLAYER_COLOURS, never from literals", () => {
    // The name and the roster are one palette by construction. A second set of hexes
    // here would be a second visual system to keep in step.
    const html = wordmark("ruckus");
    for (let i = 0; i < 6; i++) expect(html).toContain(PLAYER_COLOURS[i]!);
  });

  it("is text, so a webfont that never arrives costs the tilt and not the name", () => {
    // The fallback is the point: a cold load on a bad connection still says what the
    // game is called (P1).
    expect(wordmark("ruckus")).not.toContain("<svg");
    expect(wordmark("ruckus")).not.toContain("<img");
  });

  it("escapes what it is given", () => {
    expect(wordmark("<b>")).not.toContain("<b>");
  });
});

describe("the slot strip agrees with the rows (ui-identity T4, R3, P4)", () => {
  const lobbyWith = (n: number, gaps: number[] = []) => {
    const { root } = stubDom();
    const ui = new Ui(root, noop);
    const players = Array.from({ length: n }, (_, i) => i)
      .filter((i) => !gaps.includes(i))
      .map((slot) => ({ slot, name: `p${slot}`, colour: "", score: 0, connected: true }));
    ui.render({ ...baseState(), screen: "LOBBY", players, code: "AAAA" } as never);
    return { root, players };
  };

  it("fills one chip per player and leaves the rest empty", () => {
    for (const n of [1, 2, 5, 8]) {
      const { root } = lobbyWith(n);
      const html = (root.querySelector("#slots") as { innerHTML: string }).innerHTML;
      expect((html.match(/class="slot on"/g) ?? []).length, `${n} players`).toBe(n);
      expect((html.match(/class="slot/g) ?? []).length).toBe(8);
    }
  });

  it("agrees with the rows even when the roster has gaps", () => {
    // One source, two views — the only way a second view of a fact is worth having.
    const { root, players } = lobbyWith(8, [2, 5]);
    const slots = (root.querySelector("#slots") as { innerHTML: string }).innerHTML;
    const rows = (root.querySelector("#scoreboard") as { innerHTML: string }).innerHTML;
    expect((slots.match(/class="slot on"/g) ?? []).length).toBe(players.length);
    expect((rows.match(/class="row/g) ?? []).length).toBe(players.length);
  });
});
