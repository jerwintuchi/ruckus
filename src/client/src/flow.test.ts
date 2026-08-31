import { describe, expect, it } from "vitest";
import { ERROR_TEXT, NAME_MAX, createState, initialState, joinState, nameState, reduce, rosterChange, shouldShowWaiting, startState, type FlowEvent, type FlowState } from "./flow.ts";
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

describe("the join control explains itself (T19, P5)", () => {
  // Start has always done this; Join did not, and on a phone a disabled button with
  // nothing said is indistinguishable from a broken game. Found in a playtest.
  it("says what is missing rather than being silently dead", () => {
    // A name first (R9), so these start from a named player: without one the note is
    // about the name, which is the more urgent thing missing.
    const named = { ...initialState(), name: "jerwin" };
    expect(joinState({ ...named, code: "" }))
      .toMatchObject({ canJoin: false, note: "Type the room's four-character code." });
    expect(joinState({ ...named, code: "GKL" }))
      .toMatchObject({ canJoin: false, note: "1 more character." });
    expect(joinState({ ...named, code: "GK" }).note).toBe("2 more characters.");
  });

  it("allows the join once the code is whole", () => {
    expect(joinState({ ...initialState(), name: "jerwin", code: "GKLR" }))
      .toEqual({ canJoin: true, note: "" });
  });

  it("reports a join in flight, so a tap always has a visible consequence", () => {
    const s = reduce({ ...initialState(), name: "jerwin", code: "GKLR" }, { t: "connecting" });
    expect(joinState(s)).toMatchObject({ canJoin: false, note: "Connecting…" });
  });

  it("never leaves the note stuck after the attempt resolves", () => {
    const trying = reduce({ ...initialState(), name: "jerwin", code: "GKLR" }, { t: "connecting" });
    for (const ending of [
      { t: "err", code: "NO_ROOM" } as const,
      { t: "welcome", slot: 0, code: "GKLR", host: 0 } as const,
      { t: "disconnected" } as const,
      { t: "back" } as const,
    ]) {
      expect(reduce(trying, ending).connecting, ending.t).toBe(false);
    }
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
    let s = initialState();
    for (let trial = 0; trial < 500; trial++) {
      s = initialState();
      for (let i = 0; i < 40; i++) {
        s = reduce(s, pool[r.int(pool.length)]!);
        // Assert on the failure, not on every step. Sixty thousand expect() calls cost
        // several times the twenty thousand reduces they were checking, and made this
        // the first test in the suite to time out once the suite got busier. The
        // coverage is identical; only the bookkeeping is gone.
        const where = `trial ${trial}, step ${i}`;
        if (!SCREENS.includes(s.screen)) expect.fail(`${where}: screen "${s.screen}"`);
        if (s.code.length > 4) expect.fail(`${where}: code "${s.code}"`);
        if (s.name.length > 12) expect.fail(`${where}: name "${s.name}"`);
      }
    }
    expect(SCREENS).toContain(s.screen);
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

describe("the joining-in card is for arrivals only (RD-035)", () => {
  it("shows for a player who arrived mid-match", () => {
    expect(shouldShowWaiting("ROUND_PLAY", false)).toBe(true);
  });

  it("stays away once a round has been seen", () => {
    // The first version asked "not in the lobby and not playing", which is also true
    // at the round intro and at round end — so the card covered the rule card and the
    // scoreboard during entirely normal play.
    for (const state of ["ROUND_INTRO", "ROUND_PLAY", "ROUND_END"] as const) {
      expect(shouldShowWaiting(state as never, true), state).toBe(false);
    }
  });

  it("never shows in the lobby, where the lobby card belongs", () => {
    expect(shouldShowWaiting("LOBBY", false)).toBe(false);
    expect(shouldShowWaiting("LOBBY", true)).toBe(false);
  });
});

describe("a player needs a name, and is told so (lobby-flow T13, R9)", () => {
  it("refuses an empty or one-character name, and says what is missing", () => {
    expect(nameState("")).toEqual({ valid: false, note: "Type a name so people know who you are." });
    expect(nameState("   ")).toMatchObject({ valid: false });
    expect(nameState("j")).toMatchObject({ valid: false, note: "1 more character." });
  });

  it("accepts a name at the boundary, and trims before judging", () => {
    expect(nameState("jo").valid).toBe(true);
    expect(nameState("  jo  ").valid).toBe(true);
    expect(nameState("a".repeat(NAME_MAX)).valid).toBe(true);
    // Over-length is the SERVER's business to truncate; the client does not refuse it.
    expect(nameState("a".repeat(NAME_MAX + 5)).valid).toBe(true);
  });

  it("never refuses without saying why, across the whole space", () => {
    // The property behind every control in this game: nothing is silently dead.
    for (const raw of ["", " ", "a", "ab", "abc", "  x  ", "a".repeat(30)]) {
      const r = nameState(raw);
      if (!r.valid) expect(r.note.length, JSON.stringify(raw)).toBeGreaterThan(0);
      else expect(r.note).toBe("");
    }
  });

  it("blocks Create and Join alike until the name is usable", () => {
    const noName = { ...initialState(), code: "ABCD" };
    expect(createState(noName).canCreate).toBe(false);
    expect(joinState(noName).canJoin).toBe(false);
    expect(joinState(noName).note).toBe(createState(noName).note);

    const named = { ...noName, name: "jerwin" };
    expect(createState(named).canCreate).toBe(true);
    expect(joinState(named).canJoin).toBe(true);
  });

  it("says it is working while a create is in flight", () => {
    const s = reduce({ ...initialState(), name: "jerwin" }, { t: "connecting" });
    expect(createState(s)).toMatchObject({ canCreate: false, note: "Creating…" });
  });
});

describe("the lobby notices who came and went (lobby-flow T15, R11)", () => {
  const p = (slot: number, name: string): PlayerView =>
    ({ slot, name, colour: "#1ab0ff", score: 0, connected: true });

  it("names an arrival and a departure", () => {
    expect(rosterChange([p(0, "a")], [p(0, "a"), p(1, "b")])).toEqual({ joined: ["b"], left: [] });
    expect(rosterChange([p(0, "a"), p(1, "b")], [p(0, "a")])).toEqual({ joined: [], left: ["b"] });
  });

  it("is empty when nothing changed, however the order arrives", () => {
    const before = [p(0, "a"), p(1, "b")];
    expect(rosterChange(before, [p(1, "b"), p(0, "a")])).toEqual({ joined: [], left: [] });
    expect(rosterChange([], [])).toEqual({ joined: [], left: [] });
  });

  it("compares by slot, because two players may share a name", () => {
    // Same name, different person: a swap is a departure and an arrival, not silence.
    expect(rosterChange([p(0, "sam")], [p(1, "sam")]))
      .toEqual({ joined: ["sam"], left: ["sam"] });
  });

  it("is a pure function of the two rosters", () => {
    const before = [p(0, "a")];
    const after = [p(0, "a"), p(1, "b")];
    const snapshot = JSON.stringify([before, after]);
    rosterChange(before, after);
    expect(JSON.stringify([before, after])).toBe(snapshot);
  });
});
