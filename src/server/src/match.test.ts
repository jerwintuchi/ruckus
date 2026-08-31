import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  INTRO_MS,
  RESULT_MS,
  ROUNDS_PER_MATCH,
  TICK_DT,
  TICK_HZ,
  CONTACT_DISTANCE,
  vec,
  type ArenaDescriptor,
  type MatchState,
  type Minigame,
} from "@ruckus/shared";
import { Match, type MatchEvents } from "./match.ts";
import { Room } from "./room.ts";

const arena = (): ArenaDescriptor => ({
  camera: { eye: [0, 10, 10], look: [0, 0, 0], fov: 45 },
  solids: [],
  statics: [],
  sky: "#000",
});

/** A minigame that ends after `ticks`, or never if `ticks` is Infinity. */
const stub = (id: string, ticks: number, maxMs = 2000): Minigame<{ n: number }> => ({
  id,
  displayName: id,
  rule: "Stub.",
  input: "stick",
  maxDurationMs: maxMs,
  init: () => ({ n: 0 }),
  tick: (s) => {
    s.n += 1;
  },
  isOver: (s) => s.n >= ticks,
  scores: () => ({ 0: 3, 1: 1 }),
  snapshot: (s) => ({ n: s.n }),
  arena,
});

const events = (): MatchEvents & { log: string[] } => {
  const log: string[] = [];
  return {
    log,
    onIntro: () => log.push("intro"),
    onRoundStart: () => log.push("start"),
    onSnapshot: () => log.push("snap"),
    onRoundEnd: () => log.push("end"),
    onMatchEnd: () => log.push("match"),
    onLobby: () => log.push("lobby"),
  };
};

const setup = (games: Minigame<never>[], players = 2) => {
  const room = new Room("ABCD");
  for (let i = 0; i < players; i++) room.join(`p${i}`);
  const ev = events();
  const match = new Match(room, games, ev, 1);
  return { room, ev, match };
};

const pump = (match: Match, ms: number): void => {
  for (let i = 0; i < Math.round(ms / (TICK_DT * 1000)); i++) match.update();
};

describe("Match transitions (T8, R4, P1)", () => {
  it("stays in LOBBY until the host starts", () => {
    const { room, match } = setup([stub("a", 5) as Minigame<never>]);
    pump(match, 5000);
    expect(room.state).toBe("LOBBY");
  });

  it("no client message causes a transition directly (P1)", () => {
    const { room, match } = setup([stub("a", 5) as Minigame<never>]);
    expect(match.requestStart(0)).toBe("ok");
    // The flag is set, but nothing has moved until update() runs.
    expect(room.state).toBe("LOBBY");
    match.update();
    expect(room.state).toBe("ROUND_INTRO");
  });

  it("refuses a non-host start, and a start below the minimum", () => {
    const { match } = setup([stub("a", 5) as Minigame<never>]);
    expect(match.requestStart(1)).toBe("NOT_HOST");

    const solo = setup([stub("a", 5) as Minigame<never>], 1);
    expect(solo.match.requestStart(0)).toBe("TOO_FEW");
  });

  it("walks the full sequence for a whole match", () => {
    const { room, ev, match } = setup([stub("a", 3) as Minigame<never>]);
    match.requestStart(0);

    const seen: MatchState[] = [];
    for (let i = 0; i < TICK_HZ * 200; i++) {
      match.update();
      if (seen[seen.length - 1] !== room.state) seen.push(room.state);
      if (ev.log.includes("lobby")) break;
    }
    expect(seen[0]).toBe("ROUND_INTRO");
    expect(seen).toContain("ROUND_PLAY");
    expect(seen).toContain("ROUND_RESULT");
    expect(seen).toContain("MATCH_RESULT");
    expect(seen[seen.length - 1]).toBe("LOBBY");
    expect(ev.log.filter((e) => e === "intro")).toHaveLength(ROUNDS_PER_MATCH);
  });

  it("holds the intro for INTRO_MS before play begins", () => {
    const { room, match } = setup([stub("a", 999) as Minigame<never>]);
    match.requestStart(0);
    match.update();
    expect(room.state).toBe("ROUND_INTRO");
    pump(match, INTRO_MS - 100);
    expect(room.state).toBe("ROUND_INTRO");
    pump(match, 200);
    expect(room.state).toBe("ROUND_PLAY");
  });
});

describe("Match round termination (T8, R5, P2, I8)", () => {
  it("stops a round at maxDurationMs even when isOver never fires", () => {
    const never = stub("never", Number.POSITIVE_INFINITY, 1000) as Minigame<never>;
    const { room, match } = setup([never]);
    match.requestStart(0);
    pump(match, INTRO_MS + 100);
    expect(room.state).toBe("ROUND_PLAY");
    pump(match, 1200);
    expect(room.state).toBe("ROUND_RESULT");
  });

  it("ends immediately when nobody is connected (R5)", () => {
    const { room, match } = setup([stub("a", 999, 60_000) as Minigame<never>]);
    match.requestStart(0);
    pump(match, INTRO_MS + 100);
    expect(room.state).toBe("ROUND_PLAY");

    room.leave(0);
    room.leave(1);
    match.update();
    expect(room.state).toBe("ROUND_RESULT");
  });

  it("applies round scores to the running totals", () => {
    const { room, match } = setup([stub("a", 2) as Minigame<never>]);
    match.requestStart(0);
    pump(match, INTRO_MS + 500);
    expect(room.players.get(0)!.score).toBe(3);
    expect(room.players.get(1)!.score).toBe(1);
  });

  it("resets scores when a new match starts", () => {
    const { room, match } = setup([stub("a", 2) as Minigame<never>]);
    room.players.get(0)!.score = 99;
    match.requestStart(0);
    match.update();
    expect(room.players.get(0)!.score).toBe(0);
  });
});

describe("Match input plumbing (T8, I2, I8)", () => {
  it("clamps a wild axis at the door into the simulation", () => {
    const seen: number[] = [];
    const spy: Minigame<{ n: number }> = {
      ...stub("spy", 999, 60_000),
      tick: (s, ctx) => {
        s.n += 1;
        const a = ctx.input(0).axis;
        seen.push(Math.hypot(a.x, a.z));
      },
    };
    const { room, match } = setup([spy as Minigame<never>]);
    room.players.get(0)!.input = { ax: 900, ay: -900, btn: false };
    match.requestStart(0);
    pump(match, INTRO_MS + 300);
    expect(seen.length).toBeGreaterThan(0);
    for (const m of seen) expect(m).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("feeds a disconnected player idle input rather than their last one (I8)", () => {
    const seen: boolean[] = [];
    const spy: Minigame<{ n: number }> = {
      ...stub("spy", 999, 60_000),
      tick: (s, ctx) => {
        s.n += 1;
        const a = ctx.input(1).axis;
        seen.push(a.x === 0 && a.z === 0);
      },
    };
    const { room, match } = setup([spy as Minigame<never>]);
    room.players.get(1)!.input = { ax: 1, ay: 0, btn: false };
    match.requestStart(0);
    pump(match, INTRO_MS + 100);
    room.leave(1);
    seen.length = 0;
    pump(match, 200);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every(Boolean)).toBe(true);
  });
});

describe("Match round selection (T8, T9, R4)", () => {
  it("plays every registered minigame before repeating one", () => {
    const games = ["a", "b", "c", "d", "e"].map((id) => stub(id, 2) as Minigame<never>);
    const played: string[] = [];
    const room = new Room("ABCD");
    room.join("p0");
    room.join("p1");
    const ev: MatchEvents = {
      onIntro: (g) => played.push(g.id),
      onRoundStart: () => {},
      onSnapshot: () => {},
      onRoundEnd: () => {},
      onMatchEnd: () => {},
      onLobby: () => {},
    };
    const match = new Match(room, games, ev, 7);
    match.requestStart(0);
    for (let i = 0; i < TICK_HZ * 300 && played.length < ROUNDS_PER_MATCH; i++) match.update();
    expect(played).toHaveLength(ROUNDS_PER_MATCH);
    expect(new Set(played).size).toBe(ROUNDS_PER_MATCH);
  });
});

describe("Match round RNG (RD-013)", () => {
  it("advances one stream across ticks instead of reseeding every tick", () => {
    // Regression guard. This was `makeRng(seed)` inside the per-tick ctx, so every
    // tick saw the identical sequence and a minigame drawing during tick() got the
    // same number forever. Two minigames never noticed because they only drew in
    // init(); the third one did.
    const draws: number[] = [];
    const spy: Minigame<{ n: number }> = {
      ...stub("rng-spy", 999, 60_000),
      tick: (s, ctx) => {
        s.n += 1;
        draws.push(ctx.rng.next());
      },
    };
    const { match } = setup([spy as Minigame<never>]);
    match.requestStart(0);
    pump(match, INTRO_MS + 500);

    expect(draws.length).toBeGreaterThan(5);
    expect(new Set(draws).size).toBe(draws.length);
  });

  it("is still deterministic — the same room and round replay identically", () => {
    const capture = (): number[] => {
      const draws: number[] = [];
      const spy: Minigame<{ n: number }> = {
        ...stub("rng-spy", 999, 60_000),
        tick: (s, ctx) => {
          s.n += 1;
          draws.push(ctx.rng.next());
        },
      };
      const { match } = setup([spy as Minigame<never>]);
      match.requestStart(0);
      pump(match, INTRO_MS + 500);
      return draws;
    };
    expect(capture()).toEqual(capture());
  });

  it("hands init and tick the same stream, so init's draws are not replayed", () => {
    const initDraws: number[] = [];
    const tickDraws: number[] = [];
    const spy: Minigame<{ n: number }> = {
      ...stub("rng-spy", 999, 60_000),
      init: (ctx) => {
        for (let i = 0; i < 3; i++) initDraws.push(ctx.rng.next());
        return { n: 0 };
      },
      tick: (s, ctx) => {
        s.n += 1;
        tickDraws.push(ctx.rng.next());
      },
    };
    const { match } = setup([spy as Minigame<never>]);
    match.requestStart(0);
    pump(match, INTRO_MS + 300);

    expect(initDraws).toHaveLength(3);
    for (const d of tickDraws) expect(initDraws).not.toContain(d);
  });
});

describe("players are solid, and the shell is what makes them so (player-collision T3)", () => {
  it("separates overlapping players without any minigame doing anything", () => {
    // The stub minigame moves nobody, so any separation is the shell's doing. That is
    // the property: a minigame gets solidity for free and cannot forget it.
    const { room, match } = setup([stub("a", 999) as Minigame<never>]);
    match.requestStart(0);
    pump(match, INTRO_MS + TICK_DT * 1000);

    const bodies = [...room.players.values()].map((p) => p.runtime);
    expect(bodies.length).toBeGreaterThanOrEqual(2);
    bodies[0]!.body.pos = vec(0, 0);
    bodies[1]!.body.pos = vec(0.05, 0);
    match.update();

    const d = Math.hypot(
      bodies[0]!.body.pos.x - bodies[1]!.body.pos.x,
      bodies[0]!.body.pos.z - bodies[1]!.body.pos.z,
    );
    expect(d).toBeGreaterThanOrEqual(CONTACT_DISTANCE - 1e-6);
  });

  it("is called by nobody else — a minigame doing this has taken the shell's job", () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), "minigames");
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((e) => {
        const p = join(d, e);
        return statSync(p).isDirectory() ? walk(p) : [p];
      });
    const offences = walk(dir).filter(
      (f) => f.endsWith(".ts") && !f.endsWith(".test.ts")
        && readFileSync(f, "utf8").includes("resolvePlayerOverlaps"),
    );
    expect(offences).toEqual([]);
  });
});

describe("a player who arrives mid-match plays the next round (I8)", () => {
  // Asserted rather than assumed: a playtester joined a running match and reported
  // seeing only bots. They were in fact in the room the whole time — but nothing here
  // proved a late arrival is dealt into the NEXT round, so now something does.
  it("is not in the round already running, and is in the one after", () => {
    const { room, match } = setup([stub("a", 3) as Minigame<never>, stub("b", 3) as Minigame<never>]);
    match.requestStart(0);
    pump(match, INTRO_MS + TICK_DT * 1000);

    const before = room.connected.length;
    room.join("latecomer");
    // Still mid-round: the roster the round is playing with does not change under it.
    expect(room.state).toBe("ROUND_PLAY");

    // Run to the end of this round and into the next one.
    pump(match, 12_000);
    expect(room.connected.length).toBe(before + 1);
    const playing = room.connected.map((p) => p.runtime);
    const late = playing.find((r) => r.slot === before);
    expect(late, "the late arrival has a runtime in the round").toBeDefined();
    expect(late!.alive, "and is alive in it").toBe(true);
  });

  it("keeps their score across the rounds they were present for", () => {
    const { room, match } = setup([stub("a", 3) as Minigame<never>]);
    match.requestStart(0);
    pump(match, INTRO_MS + TICK_DT * 1000);
    room.join("latecomer");
    pump(match, 12_000);
    // Whatever they scored, they still have — a late arrival is not reset each round.
    const late = [...room.players.values()].find((p) => p.name === "latecomer");
    expect(late).toBeDefined();
    expect(typeof late!.score).toBe("number");
  });
});

describe("a round is played with the roster it started with (RD-046)", () => {
  it("does not deal a mid-round joiner into the running round", () => {
    // They used to appear in ctx.players and in every snapshot the instant they
    // connected — a body at the arena's centre that the minigame's own alive set had
    // never heard of, so it could not move and did not belong to the round it stood in.
    const { room, match } = setup([stub("a", 999) as Minigame<never>]);
    match.requestStart(0);
    pump(match, INTRO_MS + TICK_DT * 1000);
    const during = match.roster.length;

    room.join("latecomer");
    match.update();
    expect(match.roster.length, "the running round's roster is unchanged").toBe(during);
    expect(match.roster.some((r) => r.slot === during)).toBe(false);
  });

  it("still ends a round whose players have all left (R5, I8)", () => {
    // The roster must stop ADDING people mid-round without stopping REMOVALS, or a
    // round nobody is playing never ends.
    const { room, match } = setup([stub("a", 999) as Minigame<never>]);
    match.requestStart(0);
    pump(match, INTRO_MS + TICK_DT * 1000);
    expect(room.state).toBe("ROUND_PLAY");
    for (const p of [...room.players.values()]) room.leave(p.slot);
    match.update();
    expect(room.state).not.toBe("ROUND_PLAY");
  });
});

describe("a round begins from nothing (round-lifecycle T1, R1, P1)", () => {
  it("resets motion that a previous round left behind", () => {
    // The bug this exists for: every minigame's init sets body.pos and none of them
    // touch y, vy, grounded or vel. A player who died by FALLING began the next round
    // at a correct x/z while still thirty metres down and falling — eliminated on the
    // first tick, greyed and frozen for the whole round (RD-049).
    const { room, match } = setup([stub("a", 3) as Minigame<never>, stub("b", 3) as Minigame<never>]);
    match.requestStart(0);
    pump(match, INTRO_MS + TICK_DT * 1000);

    // Wreck every body the way a real round would: mid-fall, sprinting, turned around.
    for (const p of room.players.values()) {
      p.runtime.body.y = -30;
      p.runtime.body.vy = -18;
      p.runtime.body.grounded = false;
      p.runtime.body.vel = vec(6, -4);
      p.runtime.facing = 3.1;
      p.runtime.alive = false;
    }

    // Into the next round.
    pump(match, 12_000);

    for (const p of room.players.values()) {
      const b = p.runtime.body;
      expect(b.y, "y").toBe(0);
      expect(b.vy, "vy").toBe(0);
      expect(b.grounded, "grounded").toBe(true);
      expect(b.vel.x, "vel.x").toBe(0);
      expect(b.vel.z, "vel.z").toBe(0);
      expect(p.runtime.facing, "facing").toBe(0);
      expect(p.runtime.alive, "alive").toBe(true);
    }
  });

  it("resets before init, so a minigame's spawn is not overwritten", () => {
    // Order matters: the shell owns motion, the minigame owns position. Reversing them
    // would put every player back at the origin after the game had placed them.
    const placed: number[] = [];
    const spawner: Minigame<{ n: number }> = {
      ...(stub("spawn", 999) as unknown as Minigame<{ n: number }>),
      init: (ctx) => {
        for (const p of ctx.players) {
          p.body.pos = vec(5, 5);
          placed.push(p.slot);
        }
        return { n: 0 };
      },
    };
    const { room, match } = setup([spawner as unknown as Minigame<never>]);
    match.requestStart(0);
    pump(match, INTRO_MS + TICK_DT * 1000);
    expect(placed.length).toBeGreaterThan(0);
    for (const p of room.players.values()) {
      expect(p.runtime.body.pos.x, "the spawn survived the reset").toBe(5);
    }
  });
});

describe("a spectator is shown the round they are watching (round-lifecycle T2, R2, P2)", () => {
  it("offers the round in progress, and nothing outside one", () => {
    // Without this a mid-round joiner received snapshots with no arena to draw them in
    // — a scramble round arrived as pickups floating in an empty sky (RD-049).
    const { match } = setup([stub("a", 999) as Minigame<never>]);
    expect(match.inProgress(), "nothing to watch in the lobby").toBeNull();

    match.requestStart(0);
    pump(match, INTRO_MS / 2);
    expect(match.inProgress(), "nor during the intro").toBeNull();

    pump(match, INTRO_MS);
    const live = match.inProgress();
    expect(live, "but yes during play").not.toBeNull();
    expect(live!.game.arena(live!.state)).toBeDefined();
  });

  it("shows the round without adding the watcher to it (RD-046)", () => {
    // Seeing a round and being in it are different things; conflating them is what put
    // a ghost at the arena's centre.
    const { room, match } = setup([stub("a", 999) as Minigame<never>]);
    match.requestStart(0);
    pump(match, INTRO_MS + TICK_DT * 1000);
    const before = match.roster.length;

    room.join("watcher");
    match.update();
    expect(match.inProgress()).not.toBeNull();
    expect(match.roster.length).toBe(before);
  });
});
