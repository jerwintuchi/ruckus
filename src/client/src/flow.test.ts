import { describe, expect, it } from "vitest";
import { ERROR_TEXT, initialState, reduce, startState, type FlowEvent, type FlowState } from "./flow.ts";
import { makeRng, type ErrCode, type PlayerView } from "@ruckus/shared";

const SCREENS = ["MENU", "CREATING", "JOINING", "LOBBY", "IN_MATCH"];
const run = (events: FlowEvent[], from = initialState()): FlowState =>
  events.reduce(reduce, from);

const players = (n: number, connected = true): PlayerView[] =>
  Array.from({ length: n }, (_, slot) => ({
    slot, name: `p${slot}`, colour: "#1ab0ff", score: 0, connected,
  }));

describe("creating a room (lobby-flow T5, R1)", () => {
  it("walks menu → creating → lobby, and the server supplies the code", () => {
    const s = run([
      { t: "setName", name: "jerwin" },
      { t: "wantCreate" },
      { t: "welcome", slot: 0, code: "QCN4", host: 0 },
    ]);
    expect(s.screen).toBe("LOBBY");
    expect(s.code).toBe("QCN4");
    expect(s.mySlot).toBe(0);
    // The client never invents a code — it only ever learns one.
    const beforeWelcome = run([{ t: "setName", name: "j" }, { t: "wantCreate" }]);
    expect(beforeWelcome.code).toBe("");
  });
});

describe("joining a room (lobby-flow T5, R3)", () => {
  it("walks menu → joining → lobby", () => {
    const s = run([
      { t: "setName", name: "jerwin" },
      { t: "wantJoin" },
      { t: "setCode", code: "qcn4" },
      { t: "welcome", slot: 2, code: "QCN4", host: 0 },
    ]);
    expect(s.screen).toBe("LOBBY");
    expect(s.mySlot).toBe(2);
    expect(s.host).toBe(0);
  });

  it("normalises what gets typed or pasted", () => {
    for (const typed of ["qcn4", " QCN4 ", "q-c-n-4", "QcN4!!"]) {
      expect(run([{ t: "wantJoin" }, { t: "setCode", code: typed }]).code).toBe("QCN4");
    }
  });

  it("keeps a wrong code on screen so it can be corrected, not retyped (P4)", () => {
    const s = run([
      { t: "setName", name: "jerwin" },
      { t: "wantJoin" },
      { t: "setCode", code: "ZZZZ" },
      { t: "err", code: "NO_ROOM" },
    ]);
    expect(s.screen).toBe("JOINING");
    expect(s.code).toBe("ZZZZ");
    expect(s.name).toBe("jerwin");
    expect(s.error).toBe(ERROR_TEXT.NO_ROOM);
  });

  it("sends a failed create back to the menu rather than a blank screen", () => {
    const s = run([{ t: "wantCreate" }, { t: "err", code: "BAD_MSG" }]);
    expect(s.screen).toBe("MENU");
    expect(s.error).toBeTruthy();
  });
});

describe("shared links (lobby-flow T6, R4)", () => {
  it("opens straight into joining, with the code filled and locked", () => {
    const s = run([{ t: "deepLink", code: "play" }]);
    expect(s.screen).toBe("JOINING");
    expect(s.code).toBe("PLAY");
    expect(s.codeLocked).toBe(true);
  });

  it("a linked code cannot be edited out from under the invite", () => {
    const s = run([{ t: "deepLink", code: "PLAY" }, { t: "setCode", code: "ZZZZ" }]);
    expect(s.code).toBe("PLAY");
  });

  it("Back is a real way out of a dead link, not a trap", () => {
    const s = run([
      { t: "deepLink", code: "GONE" },
      { t: "err", code: "NO_ROOM" },
      { t: "back" },
    ]);
    expect(s.screen).toBe("MENU");
    expect(s.codeLocked).toBe(false);
    expect(s.code).toBe("");
  });
});

describe("the lobby and the match (lobby-flow T5)", () => {
  it("follows the server into a match and back out again", () => {
    let s = run([{ t: "welcome", slot: 0, code: "AAAA", host: 0 }]);
    s = reduce(s, { t: "room", players: players(3), host: 0, state: "ROUND_PLAY" });
    expect(s.screen).toBe("IN_MATCH");
    s = reduce(s, { t: "room", players: players(3), host: 0, state: "LOBBY" });
    expect(s.screen).toBe("LOBBY");
  });

  it("does not yank someone out of the menu because a room message arrived", () => {
    const s = reduce(initialState(), { t: "room", players: players(2), host: 0, state: "LOBBY" });
    expect(s.screen).toBe("MENU");
  });

  it("a disconnect explains itself and offers the way back (R6)", () => {
    let s = run([{ t: "setName", name: "jerwin" }, { t: "welcome", slot: 1, code: "AAAA", host: 0 }]);
    s = reduce(s, { t: "disconnected" });
    expect(s.screen).toBe("MENU");
    expect(s.error).toContain("connection");
    expect(s.name).toBe("jerwin");     // no need to retype who you are
  });
});

describe("the start control explains itself (lobby-flow T8, R5)", () => {
  const lobby = (n: number, mySlot: number, host = 0): FlowState => ({
    ...initialState(), screen: "LOBBY", players: players(n), mySlot, host,
  });

  it("offers Start to the host once there are two", () => {
    expect(startState(lobby(2, 0))).toEqual({ canStart: true, label: "Start", note: "" });
  });

  it("says why it is unavailable rather than being silently dead", () => {
    const s = startState(lobby(1, 0));
    expect(s.canStart).toBe(false);
    expect(s.label).toContain("one more");
  });

  it("tells a non-host who they are waiting for, by name", () => {
    const s = startState(lobby(3, 2, 0));
    expect(s.canStart).toBe(false);
    expect(s.note).toContain("p0");
  });

  it("does not count disconnected players toward the minimum", () => {
    const state: FlowState = { ...lobby(2, 0), players: players(2, false) };
    expect(startState(state).canStart).toBe(false);
  });
});

describe("reduce is total (lobby-flow P3, R7)", () => {
  it("never lands outside the five screens, for any event sequence", () => {
    const codes: ErrCode[] = ["NO_ROOM", "ROOM_FULL", "NOT_HOST", "TOO_FEW", "BAD_CODE", "BAD_MSG"];
    const pool: FlowEvent[] = [
      { t: "wantCreate" }, { t: "wantJoin" }, { t: "back" },
      { t: "setName", name: "x" }, { t: "setCode", code: "abcd" },
      { t: "deepLink", code: "ABCD" },
      { t: "welcome", slot: 0, code: "ABCD", host: 0 },
      { t: "room", players: players(2), host: 0, state: "LOBBY" },
      { t: "room", players: players(2), host: 0, state: "ROUND_PLAY" },
      { t: "disconnected" },
      ...codes.map((code): FlowEvent => ({ t: "err", code })),
    ];

    const r = makeRng(7);
    for (let trial = 0; trial < 500; trial++) {
      let s = initialState();
      for (let i = 0; i < 40; i++) {
        s = reduce(s, pool[r.int(pool.length)]!);
        expect(SCREENS).toContain(s.screen);
        expect(s.code.length).toBeLessThanOrEqual(4);
        expect(s.name.length).toBeLessThanOrEqual(12);
      }
    }
  });

  it("leaves the state untouched for an event it does not know", () => {
    const s = initialState();
    expect(reduce(s, { t: "nonsense" } as unknown as FlowEvent)).toEqual(s);
  });

  it("gives every error code a message that says what to do next (P5)", () => {
    for (const [code, text] of Object.entries(ERROR_TEXT)) {
      expect(text.length, code).toBeGreaterThan(10);
      // Not merely a diagnosis: each one points somewhere.
      expect(/check|create|limit|host|least two|try again/i.test(text), code).toBe(true);
    }
  });
});
