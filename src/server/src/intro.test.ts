/**
 * The round's opening (round-open T1, T3, T4, T8).
 *
 * Two things are being pinned. The dwell is a CEILING that unanimity can only lower —
 * never a gate that a silent player can hold shut (I8). And the arena exists during the
 * intro, so the countdown runs over a real, still world rather than over a card.
 */
import { describe, expect, it } from "vitest";
import { INTRO_MS, TICK_DT, type Minigame } from "@ruckus/shared";
import { Match, type MatchEvents } from "./match.ts";
import { Room } from "./room.ts";
import { mkPlayers } from "./minigames/harness.ts";

const stub = (id: string): Minigame<never> => ({
  id, displayName: id, rule: "one sentence.", input: "stick", maxDurationMs: 20_000,
  init: () => ({}) as never,
  tick: () => {},
  isOver: () => false,
  scores: () => ({}),
  snapshot: () => ({}),
  arena: () => ({ camera: { extent: 10, look: [0, 0, 0] }, statics: [], solids: [] }),
} as unknown as Minigame<never>);

const events = (): MatchEvents & { log: string[]; snaps: number } => {
  const o = {
    log: [] as string[], snaps: 0,
    onIntro: () => o.log.push("intro"),
    onRoundStart: () => o.log.push("roundStart"),
    onSnapshot: () => { o.snaps++; },
    onRoundEnd: () => o.log.push("roundEnd"),
    onMatchEnd: () => o.log.push("matchEnd"),
    onLobby: () => o.log.push("lobby"),
  };
  return o;
};

const setup = (players = 3) => {
  const room = new Room("ABCD");
  for (let i = 0; i < players; i++) room.join(`p${i}`);
  for (const p of room.connected) room.setReady(p.slot, true);
  const ev = events();
  const match = new Match(room, [stub("a")], ev, 1);
  match.requestStart(0);
  match.update();          // LOBBY -> ROUND_INTRO
  return { room, ev, match };
};

const pump = (m: Match, ms: number): void => {
  for (let i = 0; i < Math.round(ms / (TICK_DT * 1000)); i++) m.update();
};

describe("the dwell is a ceiling, never a gate (R2, P1, P2)", () => {
  it("ends on its own with nobody skipping at all", () => {
    const { room, match } = setup();
    pump(match, INTRO_MS + 100);
    expect(room.state).toBe("ROUND_PLAY");
  });

  it("never lasts LONGER because the feature exists", () => {
    const { room, match } = setup();
    pump(match, INTRO_MS - 200);
    expect(room.state, "still in the intro just before the dwell").toBe("ROUND_INTRO");
    pump(match, 300);
    expect(room.state).toBe("ROUND_PLAY");
  });

  it("ends early once every connected player has skipped", () => {
    const { room, match } = setup();
    for (const p of room.connected) match.skip(p.slot);
    match.update();
    expect(room.state).toBe("ROUND_PLAY");
  });

  it("waits while even one player has not skipped", () => {
    const { room, match } = setup();
    match.skip(0);
    match.skip(1);
    match.update();
    expect(room.state).toBe("ROUND_INTRO");
  });

  it("is idempotent — tapping twice is tapping once", () => {
    const { room, match } = setup();
    for (let i = 0; i < 50; i++) match.skip(0);
    match.update();
    expect(room.state).toBe("ROUND_INTRO");
  });

  it("does not count a player who has gone, so unanimity stays reachable (P3)", () => {
    const { room, match } = setup();
    match.skip(0);
    match.skip(1);
    room.leave(2);           // the silent one drops
    match.update();
    expect(room.state).toBe("ROUND_PLAY");
  });

  it("ignores a skip from a slot nobody holds", () => {
    const { room, match } = setup();
    expect(() => match.skip(99)).not.toThrow();
    match.update();
    expect(room.state).toBe("ROUND_INTRO");
  });

  it("forgets skips between rounds, so one tap does not skip the whole match", () => {
    const { room, match } = setup();
    for (const p of room.connected) match.skip(p.slot);
    match.update();
    expect(room.state).toBe("ROUND_PLAY");
    // Into the next round's intro, with nobody having tapped for IT.
    pump(match, 40_000);
    if (room.state === "ROUND_INTRO") {
      match.update();
      expect(room.state, "the new round's card is not pre-skipped").toBe("ROUND_INTRO");
    }
  });
});

describe("the arena is up during the intro, and still (R3, R4, P5)", () => {
  it("announces the round before the count, not after it", () => {
    const { ev } = setup();
    expect(ev.log).toEqual(["intro", "roundStart"]);
  });

  it("broadcasts snapshots through the intro", () => {
    const { ev, match } = setup();
    const before = ev.snaps;
    pump(match, 1000);
    expect(ev.snaps, "a still world is still drawn").toBeGreaterThan(before);
  });

  it("does not advance the simulation while the card is up", () => {
    // `elapsed` is what every time-driven flourish reads, so holding it still is what
    // keeps a floor from shuddering and a bomb from ticking before the round begins.
    const seen: number[] = [];
    const room = new Room("ABCD");
    for (let i = 0; i < 2; i++) room.join(`p${i}`);
    for (const p of room.connected) room.setReady(p.slot, true);
    const game = { ...stub("a"), tick: (_s: never, ctx: { elapsed: number }) => seen.push(ctx.elapsed) };
    const ev = events();
    const match = new Match(room, [game as unknown as Minigame<never>], ev, 1);
    match.requestStart(0);
    match.update();
    pump(match, INTRO_MS - 200);
    expect(seen, "tick is not called at all during the intro").toHaveLength(0);
  });
});

describe("who counts toward unanimity (R5, T8)", () => {
  it("does not count a player who arrived after the round was built", () => {
    const { room, match } = setup(2);
    for (const p of room.connected) match.skip(p.slot);
    room.join("latecomer");     // arrives during the intro; not on this round's roster
    match.update();
    expect(room.state, "the newcomer is audience, not a vote").toBe("ROUND_PLAY");
  });
});
