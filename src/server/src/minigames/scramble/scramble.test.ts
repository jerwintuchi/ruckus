import { describe, expect, it } from "vitest";
import {
  IDLE_INPUT,
  PLAYER_RADIUS,
  TICK_DT,
  TICK_MS,
  minThicknessFor,
  type InputState,
  type PlayerRuntime,
  type TickCtx,
  makeBody,
  makeRng,
  vec,
} from "@ruckus/shared";
import {
  ARENA,
  TUMBLE_COOLDOWN_MS,
  TUMBLE_SPEED_MUL,
  MAX_PICKUPS,
  MIN_SPAWN_GAP,
  PICKUP_RADIUS,
  ROUND_MS,
  SPAWN_INTERVAL_MS,
  START_PICKUPS,
  WALL,
  WALLS,
  scramble,
  type ScrambleState,
} from "./index.ts";
import { mkPlayers } from "../harness.ts";

const HALF = ARENA / 2;


/** One rng for init AND every tick, exactly as the shell does since RD-013. */
function session(n: number, seed: number) {
  const players = mkPlayers(n);
  const rng = makeRng(seed);
  const state = scramble.init({ rng, players });
  let elapsed = 0;
  const step = (input: (slot: number) => InputState = () => IDLE_INPUT): TickCtx => {
    elapsed += TICK_DT * 1000;
    const ctx: TickCtx = { dt: TICK_DT, elapsed, rng, players, input };
    scramble.tick(state, ctx);
    return ctx;
  };
  return { players, state, step, at: () => elapsed };
}

function run(
  n: number,
  seed: number,
  input: (slot: number, elapsed: number) => InputState = () => IDLE_INPUT,
): { state: ScrambleState; players: PlayerRuntime[]; elapsed: number; over: boolean } {
  const s = session(n, seed);
  let over = false;
  while (s.at() < 60_000) {
    const ctx = s.step((slot) => input(slot, s.at() + TICK_DT * 1000));
    if (scramble.isOver(s.state, ctx)) {
      over = true;
      break;
    }
  }
  return { state: s.state, players: s.players, elapsed: s.at(), over };
}

describe("pickup spawning (T3, R2, P3)", () => {
  it("starts with START_PICKUPS on the floor", () => {
    const { state } = session(4, 1);
    expect(state.pickups).toHaveLength(START_PICKUPS);
  });

  it("keeps spawning on the interval, up to MAX_PICKUPS and no further", () => {
    const s = session(1, 2);
    // Park the player in a corner so nothing is collected while we watch the cap.
    s.players[0]!.body.pos = vec(-HALF + 1, -HALF + 1);
    const counts: number[] = [];
    for (let i = 0; i * TICK_MS <= SPAWN_INTERVAL_MS * (MAX_PICKUPS + 10); i++) {
      s.players[0]!.body.pos = vec(-HALF + 1, -HALF + 1);
      s.step();
      counts.push(s.state.pickups.length);
    }
    expect(Math.max(...counts)).toBeLessThanOrEqual(MAX_PICKUPS);
    expect(Math.max(...counts)).toBe(MAX_PICKUPS);
    expect(counts[0]).toBeGreaterThanOrEqual(START_PICKUPS);
  });

  it("never spawns inside a wall", () => {
    for (let seed = 0; seed < 20; seed++) {
      const s = session(1, seed);
      s.players[0]!.body.pos = vec(-HALF + 1, -HALF + 1);
      for (let i = 0; i < 300; i++) {
        s.players[0]!.body.pos = vec(-HALF + 1, -HALF + 1);
        s.step();
      }
      for (const p of s.state.pickups) {
        expect(Math.abs(p.pos.x)).toBeLessThanOrEqual(HALF - PICKUP_RADIUS);
        expect(Math.abs(p.pos.z)).toBeLessThanOrEqual(HALF - PICKUP_RADIUS);
      }
    }
  });

  it("never spawns one within MIN_SPAWN_GAP of another", () => {
    // The pairwise check is O(n^2), so it samples every 20th tick rather than every
    // one; a violation persists until the pickup is collected, so it cannot hide
    // between samples while the player is parked in a corner collecting nothing.
    for (let seed = 0; seed < 20; seed++) {
      const s = session(1, seed);
      for (let i = 0; i < 400; i++) {
        s.players[0]!.body.pos = vec(-HALF + 1, -HALF + 1);
        s.step();
        if (i % 20 !== 0) continue;
        const ps = s.state.pickups;
        for (let a = 0; a < ps.length; a++) {
          for (let b = a + 1; b < ps.length; b++) {
            const d = Math.hypot(ps[a]!.pos.x - ps[b]!.pos.x, ps[a]!.pos.z - ps[b]!.pos.z);
            expect(d, `seed ${seed} tick ${i}`).toBeGreaterThanOrEqual(MIN_SPAWN_GAP - 1e-9);
          }
        }
      }
    }
  });

  it("gives every pickup a unique id", () => {
    const s = session(2, 7);
    for (let i = 0; i < 300; i++) s.step();
    const ids = s.state.pickups.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("collecting (T4, R1)", () => {
  it("collects a pickup in range and removes it", () => {
    const s = session(1, 3);
    const target = s.state.pickups[0]!;
    s.players[0]!.body.pos = { ...target.pos };
    const before = s.state.pickups.length;
    s.step();
    expect(s.state.counts.get(0)).toBe(1);
    expect(s.state.pickups.some((p) => p.id === target.id)).toBe(false);
    expect(s.state.pickups.length).toBeLessThan(before + 2);
  });

  it("collects nothing when out of range", () => {
    const s = session(1, 3);
    // Somewhere with no pickup within the grab radius.
    const far = vec(HALF - 1, HALF - 1);
    const clear = s.state.pickups.every(
      (p) => Math.hypot(p.pos.x - far.x, p.pos.z - far.z) > PICKUP_RADIUS + PLAYER_RADIUS + 0.5,
    );
    if (clear) {
      s.players[0]!.body.pos = far;
      s.step();
      expect(s.state.counts.get(0) ?? 0).toBe(0);
    }
  });

  it("gives a contested pickup to the nearer player", () => {
    const s = session(2, 5);
    const target = s.state.pickups[0]!;
    s.players[0]!.body.pos = vec(target.pos.x + 0.6, target.pos.z);
    s.players[1]!.body.pos = vec(target.pos.x + 0.05, target.pos.z);
    s.step();
    expect(s.state.counts.get(1)).toBe(1);
    expect(s.state.counts.get(0) ?? 0).toBe(0);
  });

  it("breaks an exact tie on slot, so it stays seeded", () => {
    const s = session(2, 5);
    const target = s.state.pickups[0]!;
    s.players[0]!.body.pos = vec(target.pos.x + 0.3, target.pos.z);
    s.players[1]!.body.pos = vec(target.pos.x - 0.3, target.pos.z);
    s.step();
    expect(s.state.counts.get(0)).toBe(1);
    expect(s.state.counts.get(1) ?? 0).toBe(0);
  });

  it("never awards one pickup twice (P3)", () => {
    const s = session(3, 9);
    const target = s.state.pickups[0]!;
    for (const p of s.players) p.body.pos = { ...target.pos };
    s.step();
    const total = [...s.state.counts.values()].reduce((a, b) => a + b, 0);
    // All three are on it; exactly one of them got it.
    expect(total).toBeLessThanOrEqual(s.state.pickups.length + 3);
    expect([...s.state.counts.values()].filter((c) => c > 0).length).toBeGreaterThan(0);
    expect(s.state.pickups.some((p) => p.id === target.id)).toBe(false);
  });

  it("conserves pickups: everything spawned is either on the floor or in someone's count", () => {
    const s = session(4, 21);
    for (let i = 0; i < 600; i++) {
      s.step((slot) => ({
        axis: vec(Math.sin(i / 12 + slot), Math.cos(i / 9 + slot)),
        btn: false,
      }));
    }
    const collected = [...s.state.counts.values()].reduce((a, b) => a + b, 0);
    expect(collected + s.state.pickups.length).toBe(s.state.nextId);
  });
});

describe("tumble and shove (T5, R3, P1, P2)", () => {
  const held: InputState = { axis: { x: 1, z: 0 }, btn: true };
  const running: InputState = { axis: { x: 1, z: 0 }, btn: false };

  it("a held button tumbles exactly once (P1)", () => {
    const s = session(1, 4);
    s.step(() => held);
    const first = s.state.tumbleReadyAt.get(0)!;
    for (let i = 0; i < 10; i++) s.step(() => held);
    expect(s.state.tumbleReadyAt.get(0)).toBe(first);
  });

  it("refuses a second tumble inside the cooldown", () => {
    const s = session(1, 4);
    s.step(() => held);
    const first = s.state.tumbleReadyAt.get(0)!;
    s.step(() => running);
    s.step(() => held);
    expect(s.state.tumbleReadyAt.get(0)).toBe(first);
  });

  it("shoves a player the dasher runs into, along the dasher's travel", () => {
    const s = session(2, 6);
    s.players[0]!.body.pos = vec(0, 0);
    s.players[1]!.body.pos = vec(PLAYER_RADIUS * 1.5, 0);
    // Get the dasher moving in +x, then tumble into the target.
    s.step((slot) => (slot === 0 ? running : IDLE_INPUT));
    s.players[0]!.body.pos = vec(0, 0);
    s.players[1]!.body.pos = vec(PLAYER_RADIUS * 1.5, 0);
    s.step((slot) => (slot === 0 ? held : IDLE_INPUT));

    expect(s.players[1]!.body.vel.x).toBeGreaterThan(1);
  });

  it("a shove never changes anyone's count (P2)", () => {
    const s = session(2, 6);
    // Give slot 1 a point, then shove them repeatedly.
    const target = s.state.pickups[0]!;
    s.players[1]!.body.pos = { ...target.pos };
    s.step();
    const banked = s.state.counts.get(1) ?? 0;
    expect(banked).toBeGreaterThan(0);

    for (let i = 0; i < 30; i++) {
      s.players[0]!.body.pos = vec(s.players[1]!.body.pos.x - 0.3, s.players[1]!.body.pos.z);
      s.step((slot) => (slot === 0 ? held : IDLE_INPUT));
      expect(s.state.counts.get(1)!).toBeGreaterThanOrEqual(banked);
    }
  });

  it("has a cooldown longer than the tumble, so it is a burst not a mode", () => {
    expect(TUMBLE_COOLDOWN_MS).toBeGreaterThan(220);
  });
});

describe("walls (T6, R4)", () => {
  it("are thick enough for the tumbling speed", () => {
    expect(WALL).toBeGreaterThanOrEqual(minThicknessFor(TUMBLE_SPEED_MUL));
  });

  it("keep a tumbling player inside the bounds, at every wall", () => {
    const dirs = [vec(1, 0), vec(-1, 0), vec(0, 1), vec(0, -1), vec(1, 1), vec(-1, -1)];
    for (let seed = 0; seed < 200; seed++) {
      const dir = dirs[seed % dirs.length]!;
      const s = session(1, seed);
      let escaped = 0;
      for (let i = 1; i <= 120; i++) {
        s.step(() => ({ axis: dir, btn: i % 30 < 2 }));
        const { x, z } = s.players[0]!.body.pos;
        if (Math.abs(x) > HALF + 0.01 || Math.abs(z) > HALF + 0.01) escaped++;
      }
      expect(escaped, `seed ${seed} escaped the arena`).toBe(0);
    }
  });

  it("publishes the same walls it simulates", () => {
    expect(scramble.arena({} as ScrambleState).solids).toBe(WALLS);
  });
});

describe("the clock, and nobody eliminated (T7, R5, P4)", () => {
  // NOTE on sample counts: unlike the knockout rounds, a Scramble round always runs
  // its full 900 ticks — it cannot end early. Property tests that need a whole round
  // are therefore ~30x more expensive per seed, so they sample tens of seeds rather
  // than hundreds. The cheap unit properties above still run at 200.
  it("ends at ROUND_MS regardless of input, over many seeds", () => {
    for (let seed = 0; seed < 30; seed++) {
      const { over, elapsed } = run(4, seed);
      expect(over, `seed ${seed}`).toBe(true);
      expect(elapsed).toBeGreaterThanOrEqual(ROUND_MS);
      expect(elapsed).toBeLessThan(ROUND_MS + 100);
    }
  });

  it("never marks anyone not-alive — nobody spectates their own round", () => {
    const { players } = run(8, 11, (slot, e) => ({
      axis: vec(Math.sin(e / 300 + slot), Math.cos(e / 250 + slot)),
      btn: Math.floor(e / 800 + slot) % 3 === 0,
    }));
    for (const p of players) expect(p.alive).toBe(true);
  });

  it("is a clock, not a body count — it does not consult the players (P4)", () => {
    const s = session(3, 2);
    // isOver must be false early and true late, with no reference to who is playing.
    expect(scramble.isOver(s.state, {} as TickCtx)).toBe(false);
    s.state.elapsed = ROUND_MS;
    expect(scramble.isOver(s.state, {} as TickCtx)).toBe(true);
  });

  it("ends on time even with a fully disconnected lobby (I8)", () => {
    // Every player contributes idle input, as the shell does for a dropout.
    const { over, elapsed } = run(4, 3, () => IDLE_INPUT);
    expect(over).toBe(true);
    expect(elapsed).toBeGreaterThanOrEqual(ROUND_MS);
  });

  it("lands inside RD-011's 30-60s band by construction", () => {
    expect(ROUND_MS).toBeGreaterThanOrEqual(30_000);
    expect(ROUND_MS).toBeLessThanOrEqual(60_000);
  });

  it("declares the duration it actually runs for", () => {
    // These were 45s and 50s. The gap was invisible until the shell began publishing
    // the round clock, at which point the HUD would have counted down to five seconds
    // that never existed. A backstop the round can never reach is not a backstop
    // (RD-067).
    expect(scramble.maxDurationMs).toBe(ROUND_MS);
  });
});

describe("scoring by count (T8, R6)", () => {
  const scoreWith = (counts: Record<number, number>, roster: number[]) =>
    scramble.scores({ roster, counts: new Map(Object.entries(counts).map(([k, v]) => [Number(k), v])) } as ScrambleState);

  it("gives 3/2/1 to the top three counts", () => {
    expect(scoreWith({ 0: 9, 1: 6, 2: 3, 3: 1 }, [0, 1, 2, 3])).toEqual({ 0: 3, 1: 2, 2: 1, 3: 0 });
  });

  it("ties share the better rank and push the next group down", () => {
    expect(scoreWith({ 0: 5, 1: 5, 2: 2 }, [0, 1, 2])).toEqual({ 0: 3, 1: 3, 2: 1 });
  });

  it("scores zero for collecting nothing, even when most of the lobby did (RD-015)", () => {
    // Ranking the whole roster would tie five players for second at 2 points each.
    expect(scoreWith({ 0: 4 }, [0, 1, 2, 3, 4, 5])).toEqual({
      0: 3, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0,
    });
  });

  it("gives everyone zero when nobody collected anything", () => {
    expect(scoreWith({}, [0, 1, 2])).toEqual({ 0: 0, 1: 0, 2: 0 });
  });

  it("never awards above 3, and a bigger count never scores less", () => {
    for (let seed = 0; seed < 25; seed++) {
      const { state } = run(6, seed, (slot, e) => ({
        axis: vec(Math.sin(e / 200 + slot * 2), Math.cos(e / 170 + slot)),
        btn: false,
      }));
      const s = scramble.scores(state);
      for (const pts of Object.values(s)) {
        expect(pts).toBeLessThanOrEqual(3);
        expect(pts).toBeGreaterThanOrEqual(0);
      }
      for (const a of state.roster) {
        for (const b of state.roster) {
          const ca = state.counts.get(a) ?? 0;
          const cb = state.counts.get(b) ?? 0;
          if (ca > cb) expect(s[a]!).toBeGreaterThanOrEqual(s[b]!);
        }
      }
    }
  });
});

describe("determinism (T9, R7, I3)", () => {
  it("same seed and inputs give an identical round", () => {
    const scripted = (slot: number, elapsed: number): InputState => ({
      axis: vec(Math.sin((elapsed + slot * 191) / 240), Math.cos((elapsed + slot * 83) / 205)),
      btn: Math.floor(elapsed / 600 + slot) % 4 === 0,
    });

    for (let seed = 0; seed < 25; seed++) {
      const a = run(4, seed, scripted);
      const b = run(4, seed, scripted);
      expect(a.elapsed).toBe(b.elapsed);
      expect([...a.state.counts.entries()]).toEqual([...b.state.counts.entries()]);
      expect(a.state.pickups.map((p) => p.id)).toEqual(b.state.pickups.map((p) => p.id));
      expect(a.state.pickups.map((p) => p.pos)).toEqual(b.state.pickups.map((p) => p.pos));
      expect(a.players.map((p) => p.body.pos)).toEqual(b.players.map((p) => p.body.pos));
    }
  });

  it("spawns players inside the arena and clear of each other", () => {
    for (let seed = 0; seed < 100; seed++) {
      const { players } = session(8, seed);
      for (const p of players) {
        expect(Math.abs(p.body.pos.x)).toBeLessThan(HALF);
        expect(Math.abs(p.body.pos.z)).toBeLessThan(HALF);
      }
      for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
          const d = Math.hypot(
            players[i]!.body.pos.x - players[j]!.body.pos.x,
            players[i]!.body.pos.z - players[j]!.body.pos.z,
          );
          expect(d).toBeGreaterThan(PLAYER_RADIUS * 2);
        }
      }
    }
  });
});

describe("snapshot and contract (T10, R8)", () => {
  it("publishes one prim per live pickup, tracking its position", () => {
    const s = session(3, 12);
    for (let i = 0; i < 40; i++) s.step();
    const snap = scramble.snapshot(s.state) as {
      prims: { k: string; pos: [number, number, number] }[];
      counts: Record<number, number>;
    };
    expect(snap.prims).toHaveLength(s.state.pickups.length);
    snap.prims.forEach((prim, i) => {
      expect(prim.k).toBe("sphere");
      expect(prim.pos[0]).toBeCloseTo(s.state.pickups[i]!.pos.x, 9);
      expect(prim.pos[2]).toBeCloseTo(s.state.pickups[i]!.pos.z, 9);
      expect(prim.pos[1]).toBeGreaterThan(0);
    });
  });

  it("leaves the countdown to the shell", () => {
    // It used to publish its own `remaining` from ROUND_MS, while the shell's clock ran
    // to maxDurationMs — five seconds longer. Two numbers for one round, and the one
    // the HUD drew was not the one the round obeyed. The shell owns it now (RD-067),
    // for every round, so sweepers and falling-floor get a timer they never had.
    const s = session(2, 14);
    for (let i = 0; i < 20; i++) s.step();
    expect(Object.keys(scramble.snapshot(s.state))).not.toContain("remaining");
  });

  it("honours the contract's preconditions", () => {
    expect(scramble.input).toBe("stick+button");
    expect(scramble.rule.split(".").filter((p) => p.trim())).toHaveLength(1);
    expect(scramble.rule.length).toBeLessThan(80);
    // Not GREATER than: the declared duration is what the shell publishes as the
    // round clock, so a margin above the real end is a countdown to an instant that
    // never arrives (RD-067). Equal is the contract.
    expect(scramble.maxDurationMs).toBe(ROUND_MS);
    expect(Object.keys(scramble.arena({} as ScrambleState).camera).sort()).toEqual([
      // `extent` is a distance in metres, not a camera instruction — there is nothing
      // in it a client could steer. The list stays exhaustive so the next field to
      // appear on a camera is a decision rather than a drift.
      "extent",
      "eye",
      "fov",
      "look",
    ]);
  });
});
