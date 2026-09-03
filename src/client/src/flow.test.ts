import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  amOnRoster, ERROR_TEXT, NAME_MAX, createState, standings, initialState, joinState, nameState, reduce, rosterChange, shouldShowWaiting, startState, type FlowEvent, type FlowState } from "./flow.ts";
import { makeRng, type ErrCode, type PlayerView } from "@ruckus/shared";

const SCREENS = ["MENU", "CREATING", "JOINING", "LOBBY", "IN_MATCH"];
const run = (events: FlowEvent[], from = initialState()): FlowState =>
  events.reduce(reduce, from);

const players = (n: number, connected = true): PlayerView[] =>
  Array.from({ length: n }, (_, slot) => ({
    slot, name: `p${slot}`, colour: "#1ab0ff", score: 0, connected, ready: false,
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

  it("offers Start to the host once there are two AND everyone is ready", () => {
    // Ready gates the start (lobby-social R2). The host is ready by definition, so a
    // two-player lobby turns on the moment the other player readies.
    // The host is ready by definition — the SERVER guarantees that, and the client does
    // not re-derive it (I1: one source of truth). So a realistic roster has the host
    // ready and everyone else opting in.
    const base = lobby(2, 0);
    const notReady = {
      ...base,
      players: base.players.map((p) => ({ ...p, ready: p.slot === base.host })),
    };
    expect(startState(notReady).canStart, "p1 has not readied").toBe(false);
    expect(startState(notReady).note).toContain(notReady.players[1]!.name);

    const ready = { ...notReady, players: notReady.players.map((p) => ({ ...p, ready: true })) };
    expect(startState(ready)).toEqual({ canStart: true, label: "Start", note: "" });
  });

  it("counts the stragglers rather than listing them all", () => {
    const many = lobby(5, 0);
    const one = { ...many, players: many.players.map((p, i) => ({ ...p, ready: i < 3 })) };
    // three ready (host among them), two not
    expect(startState(one).note).toContain("2 players");
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
      expect(/check|create|limit|host|least two|try again|rejoin|wait for/i.test(text), code).toBe(true);
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
    ({ slot, name, colour: "#1ab0ff", score: 0, connected: true, ready: false });

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

describe("everyone is on the board (lobby-flow T17, R13)", () => {
  const p = (slot: number, name: string, connected = true): PlayerView =>
    ({ slot, name, colour: "#1ab0ff", score: 0, connected, ready: false });
  const roster = [p(0, "a"), p(1, "b"), p(2, "c")];

  it("ranks players who scored nothing rather than dropping them", () => {
    // The bug: the round card filtered to points > 0, so a bad round removed you from
    // the leaderboard entirely — the opposite of "losing is still watchable".
    const rows = standings(roster, { 0: 3, 1: 0 });
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.player.name)).toEqual(["a", "b", "c"]);
    expect(rows.map((r) => r.points)).toEqual([3, 0, 0]);
  });

  it("orders by points, and breaks ties by slot so it is stable", () => {
    const rows = standings(roster, { 0: 1, 1: 5, 2: 1 });
    expect(rows.map((r) => r.player.name)).toEqual(["b", "a", "c"]);
  });

  it("gives tied players the same place", () => {
    const rows = standings(roster, { 0: 4, 1: 4, 2: 1 });
    expect(rows.map((r) => r.place)).toEqual([1, 1, 3]);
  });

  it("still lists a player who dropped, because they were in the match", () => {
    const withGone = [p(0, "a"), p(1, "gone", false)];
    expect(standings(withGone, { 0: 2 }).map((r) => r.player.name)).toEqual(["a", "gone"]);
  });

  it("is a pure function of its arguments", () => {
    const points = { 0: 3 };
    const snapshot = JSON.stringify([roster, points]);
    standings(roster, points);
    expect(JSON.stringify([roster, points])).toBe(snapshot);
  });

  it("handles an empty roster without inventing a row", () => {
    expect(standings([], {})).toEqual([]);
  });
});

describe("a spectator is not handed controls that do nothing (spectating R4)", () => {
  it("plays when on the round's roster, watches when not", () => {
    expect(amOnRoster([0, 1, 2], 1)).toBe(true);
    // The mid-round joiner: in the room, in the audience, not in the round (RD-046).
    expect(amOnRoster([0, 1, 2], 5)).toBe(false);
  });

  it("never counts the unassigned slot as playing", () => {
    // -1 is the slot before `welcome` arrives. `[].includes(-1)` is false by luck;
    // this pins it on purpose, because a roster is a list of slots and -1 is not one.
    expect(amOnRoster([], -1)).toBe(false);
    expect(amOnRoster([-1], -1)).toBe(false);
  });

  it("is what main.ts gates the controls on, not an unconditional show", () => {
    // The button was shown to a mid-round joiner with no verb behind it, so it drew
    // as a blank disc that still swallowed taps.
    //
    // Anchored on the GATE rather than on one formatting of it: the branch grew a body
    // when the spectator chip landed (spectating R2), and a guard that breaks on
    // reindentation gets deleted rather than heeded. What must stay true is that
    // `controls.show` is reachable only under `amOnRoster`.
    const src = readFileSync(join(dirname(new URL(import.meta.url).pathname), "main.ts"), "utf8");
    expect(src).toContain("amOnRoster(msg.roster, mySlot)");
    // Every `controls.show(msg.buttonLabel)` must be inside that branch, never at the
    // statement level of the case.
    expect(src).not.toMatch(/^\s{6}controls\.show\(msg\.buttonLabel\);/m);
  });
});

describe("being removed lands you on the menu, not in a broken lobby (lobby-social T10, R5)", () => {
  const inLobby = (): FlowState => ({
    ...initialState(), screen: "LOBBY", code: "ABCD", mySlot: 1, host: 0,
    players: [
      { slot: 0, name: "host", colour: "#1ab0ff", score: 0, connected: true, ready: true },
      { slot: 1, name: "me", colour: "#ff3f18", score: 0, connected: true, ready: false },
    ],
  });

  it("puts the removed player back on the MENU", () => {
    // Not the lobby they were just thrown out of: the room is gone for them, and a
    // lobby with a stale roster and a dead socket is a screen with nothing to do on it.
    const after = reduce(inLobby(), { t: "err", code: "KICKED" });
    expect(after.screen).toBe("MENU");
  });

  it("says who did it and that they can come back", () => {
    const after = reduce(inLobby(), { t: "err", code: "KICKED" });
    expect(after.error).toContain("removed");
    expect((after.error ?? "").toLowerCase()).toContain("rejoin");
  });

  it("forgets the room, so the menu is not still holding a code they were ejected from", () => {
    const after = reduce(inLobby(), { t: "err", code: "KICKED" });
    expect(after.players).toEqual([]);
    expect(after.mySlot).toBe(-1);
  });

  it("leaves every OTHER error exactly where it was", () => {
    // Only KICKED sends you home. NO_ROOM on the join screen must stay on the join
    // screen, which is the whole point of screenForError.
    const joining: FlowState = { ...initialState(), screen: "JOINING", code: "ZZZZ" };
    expect(reduce(joining, { t: "err", code: "NO_ROOM" }).screen).toBe("JOINING");
  });
});
