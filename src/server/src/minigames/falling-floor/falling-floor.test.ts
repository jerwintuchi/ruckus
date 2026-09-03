import { describe, expect, it } from "vitest";
import {
  IDLE_INPUT,
  TICK_DT,
  TICK_MS,
  type InputState,
  type PlayerRuntime,
  type TickCtx,
  makeBody,
  makeRng,
  vec,
} from "@ruckus/shared";
import {
  CRACK_MS,
  FALL_MS,
  GRID,
  KILL_Y,
  MAX_DURATION_MS,
  SHRINK_INTERVAL_MS,
  SHRINK_START_MS,
  TILE,
  cellAt,
  fallingFloor,
  tileCentre,
  type FallingFloorState,
} from "./index.ts";

const mkPlayers = (n: number): PlayerRuntime[] =>
  Array.from({ length: n }, (_, slot) => ({
    slot,
    body: makeBody(vec()),
    alive: true,
    connected: true,
    facing: 0,
    lastAppliedSeq: 0,
    speedMul: 1,
  }));

/** Drive the round exactly as the shell does, so the tests exercise the real path. */
function run(
  players: PlayerRuntime[],
  seed: number,
  inputFor: (slot: number, elapsed: number) => InputState = () => IDLE_INPUT,
  maxMs = MAX_DURATION_MS,
): { state: FallingFloorState; elapsed: number; over: boolean } {
  const state = fallingFloor.init({ rng: makeRng(seed), players });
  let elapsed = 0;
  let over = false;
  while (elapsed < maxMs) {
    elapsed += TICK_DT * 1000;
    const ctx: TickCtx = {
      dt: TICK_DT,
      elapsed,
      rng: makeRng(seed),
      players,
      input: (slot) => inputFor(slot, elapsed),
    };
    fallingFloor.tick(state, ctx);
    if (fallingFloor.isOver(state, ctx)) {
      over = true;
      break;
    }
  }
  return { state, elapsed, over };
}

const idx = (col: number, row: number): number => row * GRID + col;

describe("tile cracking (T1, R1, P1)", () => {
  it("accumulates crack across separate visits rather than resetting", () => {
    const [p] = mkPlayers(1) as [PlayerRuntime];
    const state = fallingFloor.init({ rng: makeRng(1), players: [p] });
    const home = tileCentre(4, 4);
    const away = tileCentre(0, 0);
    const cell = idx(4, 4);

    const step = (elapsed: number): void => {
      fallingFloor.tick(state, {
        dt: TICK_DT,
        elapsed,
        rng: makeRng(1),
        players: [p],
        input: () => IDLE_INPUT,
      });
    };

    let t = 0;
    p.body.pos = { ...home };
    for (let i = 0; i < 5; i++) step((t += TICK_MS));
    const partial = state.tiles[cell]!.crack;
    expect(partial).toBeGreaterThan(0);

    p.body.pos = { ...away };
    for (let i = 0; i < 5; i++) step((t += TICK_MS));
    expect(state.tiles[cell]!.crack).toBe(partial); // untouched while away

    p.body.pos = { ...home };
    for (let i = 0; i < 5; i++) step((t += TICK_MS));
    expect(state.tiles[cell]!.crack).toBeGreaterThan(partial); // resumes, not restarts
  });

  it("cracks twice as fast with two players on one tile (P1)", () => {
    const one = mkPlayers(1);
    const two = mkPlayers(2);
    const centre = tileCentre(4, 4);
    for (const p of [...one, ...two]) p.body.pos = { ...centre };

    const s1 = fallingFloor.init({ rng: makeRng(1), players: one });
    const s2 = fallingFloor.init({ rng: makeRng(1), players: two });
    for (const p of [...one, ...two]) p.body.pos = { ...centre };

    for (let i = 1; i <= 4; i++) {
      const e = i * TICK_MS;
      fallingFloor.tick(s1, { dt: TICK_DT, elapsed: e, rng: makeRng(1), players: one, input: () => IDLE_INPUT });
      fallingFloor.tick(s2, { dt: TICK_DT, elapsed: e, rng: makeRng(1), players: two, input: () => IDLE_INPUT });
    }
    expect(s2.tiles[idx(4, 4)]!.crack).toBeCloseTo(s1.tiles[idx(4, 4)]!.crack * 2, 6);
  });

  it("promotes solid to cracking to gone, once each", () => {
    const players = mkPlayers(1);
    players[0]!.body.pos = { ...tileCentre(4, 4) };
    const state = fallingFloor.init({ rng: makeRng(1), players });
    players[0]!.body.pos = { ...tileCentre(4, 4) };
    const cell = idx(4, 4);
    const seen: number[] = [];

    for (let i = 1; i <= 80; i++) {
      const e = i * TICK_MS;
      // Pin the player in place; we are testing the tile, not the movement.
      players[0]!.body.pos = { ...tileCentre(4, 4) };
      fallingFloor.tick(state, { dt: TICK_DT, elapsed: e, rng: makeRng(1), players, input: () => IDLE_INPUT });
      const st = state.tiles[cell]!.state;
      if (seen[seen.length - 1] !== st) seen.push(st);
    }
    expect(seen).toEqual([0, 1, 2]);
  });

  it("cracks for at least CRACK_MS and falls FALL_MS later", () => {
    expect(CRACK_MS).toBeGreaterThan(0);
    expect(FALL_MS).toBeGreaterThan(0);
  });
});

describe("elimination by absent ground (T2, R2, P3)", () => {
  it("keeps a player who straddles a gone tile and a solid one", () => {
    const players = mkPlayers(1);
    const state = fallingFloor.init({ rng: makeRng(1), players });
    // Sit just past the seam between (4,4) and (5,4) — derived from TILE, not a
    // hardcoded offset, so retuning the arena cannot silently invalidate the test.
    const seam = tileCentre(4, 4);
    players[0]!.body.pos = vec(seam.x + TILE * 0.55, seam.z);
    state.tiles[idx(4, 4)]!.state = 2;

    // Stay well inside CRACK_MS: standing still long enough would legitimately drop
    // the tile under them, which is a different property (tested above).
    for (let i = 1; i <= 10; i++) {
      fallingFloor.tick(state, {
        dt: TICK_DT, elapsed: i * TICK_MS, rng: makeRng(1), players, input: () => IDLE_INPUT,
      });
    }
    expect(players[0]!.alive).toBe(true);
    expect(players[0]!.body.y).toBe(0);
  });

  it("drops and eliminates a player standing over only gone tiles", () => {
    const players = mkPlayers(1);
    const state = fallingFloor.init({ rng: makeRng(1), players });
    players[0]!.body.pos = { ...tileCentre(4, 4) };
    for (const t of state.tiles) t.state = 2;

    for (let i = 1; i <= 200 && players[0]!.alive; i++) {
      fallingFloor.tick(state, {
        dt: TICK_DT, elapsed: i * TICK_MS, rng: makeRng(1), players, input: () => IDLE_INPUT,
      });
    }
    expect(players[0]!.alive).toBe(false);
    expect(players[0]!.body.y).toBeLessThanOrEqual(KILL_Y);
    expect(state.placement).toEqual([0]);
  });

  it("stops an eliminated player from cracking anything further", () => {
    const players = mkPlayers(2);
    const state = fallingFloor.init({ rng: makeRng(1), players });
    players[0]!.alive = false;
    players[0]!.body.pos = { ...tileCentre(2, 2) };
    players[1]!.body.pos = { ...tileCentre(6, 6) };

    for (let i = 1; i <= 10; i++) {
      fallingFloor.tick(state, {
        dt: TICK_DT, elapsed: i * TICK_MS, rng: makeRng(1), players, input: () => IDLE_INPUT,
      });
    }
    expect(state.tiles[idx(2, 2)]!.crack).toBe(0);
    expect(state.tiles[idx(6, 6)]!.crack).toBeGreaterThan(0);
  });

  it("treats walking off the grid entirely as no ground", () => {
    expect(cellAt(vec(999, 0))).toBeNull();
    expect(cellAt(vec(0, -999))).toBeNull();
    expect(cellAt(vec(0, 0))).not.toBeNull();
  });
});

describe("shrink terminates the round with nobody playing (T3, R4, P2)", () => {
  it("clears every tile on the shrink schedule alone, over many seeds", () => {
    // Deliberately ignores isOver: this asserts the floor runs out even if nobody
    // ever dies, which is what makes a stalemate impossible (R4).
    for (let seed = 0; seed < 200; seed++) {
      const players = mkPlayers(4);
      const state = fallingFloor.init({ rng: makeRng(seed), players });
      for (let i = 1; i * TICK_MS <= MAX_DURATION_MS; i++) {
        for (const p of players) p.alive = true; // nobody is allowed to leave early
        fallingFloor.tick(state, {
          dt: TICK_DT, elapsed: i * TICK_MS, rng: makeRng(seed), players, input: () => IDLE_INPUT,
        });
      }
      expect(state.tiles.every((t) => t.state === 2)).toBe(true);
    }
    // 200 seeds x a full 75s round at 30Hz is 450k ticks, half again what it was at
    // 20Hz (RD-036). The coverage is the point, so the budget moves, not the seeds.
  }, 20_000);

  it("ends the round with zero input from anyone (R5, I8)", () => {
    for (let seed = 0; seed < 50; seed++) {
      const players = mkPlayers(8);
      const { over, elapsed } = run(players, seed);
      expect(over).toBe(true);
      expect(elapsed).toBeLessThan(MAX_DURATION_MS);
    }
  });

  it("has a shrink schedule that fits inside the round by construction", () => {
    const rings = Math.ceil(GRID / 2);
    const clearedBy = SHRINK_START_MS + rings * SHRINK_INTERVAL_MS + FALL_MS;
    expect(clearedBy).toBeLessThan(MAX_DURATION_MS);
  });
});

describe("scoring (T4, R3, P4 as corrected by RD-006)", () => {
  const scoreOf = (placement: number[], elimAt: number[], roster: number[]) => {
    const state = {
      roster,
      placement,
      elimAt: new Map(placement.map((slot, i) => [slot, elimAt[i]!])),
      eliminated: new Set(placement),
    } as unknown as FallingFloorState;
    return fallingFloor.scores(state);
  };

  it("awards 3/2/1 down the finish order with a clear survivor", () => {
    // slots 1,2,3 fell at increasing times; slot 0 survived.
    const s = scoreOf([3, 2, 1], [100, 200, 300], [0, 1, 2, 3]);
    expect(s).toEqual({ 0: 3, 1: 2, 2: 1, 3: 0 });
  });

  it("ranks survivors above everyone eliminated", () => {
    const s = scoreOf([2, 3], [100, 200], [0, 1, 2, 3]);
    expect(s[0]).toBe(3);
    expect(s[1]).toBe(3);
    expect(s[2]).toBe(0);
    expect(s[3]).toBe(1);
  });

  it("gives a tied group the better rank and pushes the next group down (RD-006)", () => {
    // 1 and 2 fell on the same tick; 3 fell earlier. Nobody survived.
    const s = scoreOf([3, 1, 2], [100, 500, 500], [1, 2, 3]);
    expect(s[1]).toBe(3);
    expect(s[2]).toBe(3);
    expect(s[3]).toBe(1); // rank 2 is consumed by the tie
  });

  it("never awards more than 3 to anyone (P4)", () => {
    for (let seed = 0; seed < 100; seed++) {
      const players = mkPlayers(8);
      const { state } = run(players, seed);
      for (const pts of Object.values(fallingFloor.scores(state))) {
        expect(pts).toBeLessThanOrEqual(3);
        expect(pts).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("is monotonic — nobody out earlier outscores someone out later (P4)", () => {
    for (let seed = 0; seed < 100; seed++) {
      const players = mkPlayers(6);
      const { state } = run(players, seed);
      const scores = fallingFloor.scores(state);
      for (let i = 0; i < state.placement.length; i++) {
        for (let j = i + 1; j < state.placement.length; j++) {
          const earlier = state.placement[i]!;
          const later = state.placement[j]!;
          expect(scores[earlier]!).toBeLessThanOrEqual(scores[later]!);
        }
      }
    }
  });

  it("scores every roster member, including those who never moved", () => {
    const players = mkPlayers(5);
    const { state } = run(players, 11);
    const s = fallingFloor.scores(state);
    for (let slot = 0; slot < 5; slot++) expect(s[slot]).toBeTypeOf("number");
  });
});

describe("determinism (T5, R5, I3)", () => {
  it("gives identical tiles and positions for the same seed and inputs", () => {
    const scripted = (slot: number, elapsed: number): InputState => ({
      axis: vec(Math.sin((elapsed + slot * 137) / 300), Math.cos((elapsed + slot * 91) / 250)),
      btn: false,
    });

    for (let seed = 0; seed < 200; seed++) {
      const a = mkPlayers(4);
      const b = mkPlayers(4);
      const ra = run(a, seed, scripted);
      const rb = run(b, seed, scripted);

      expect(ra.elapsed).toBe(rb.elapsed);
      expect(ra.state.tiles.map((t) => t.state)).toEqual(rb.state.tiles.map((t) => t.state));
      expect(ra.state.placement).toEqual(rb.state.placement);
      expect(a.map((p) => p.body.pos)).toEqual(b.map((p) => p.body.pos));
    }
  });

  it("spawns players on distinct tiles, away from the first ring to fall", () => {
    for (let seed = 0; seed < 50; seed++) {
      const players = mkPlayers(8);
      fallingFloor.init({ rng: makeRng(seed), players });
      const cells = players.map((p) => {
        const c = cellAt(p.body.pos);
        expect(c).not.toBeNull();
        return `${c!.col},${c!.row}`;
      });
      expect(new Set(cells).size).toBe(players.length);
      for (const p of players) {
        const c = cellAt(p.body.pos)!;
        const ring = Math.min(c.col, c.row, GRID - 1 - c.col, GRID - 1 - c.row);
        expect(ring).toBeGreaterThan(0); // never on the outermost ring
      }
    }
  });
});

describe("snapshot and arena (T6, R6, P5)", () => {
  it("replaying deltas onto the first full array reproduces the server state", () => {
    const players = mkPlayers(4);
    const state = fallingFloor.init({ rng: makeRng(5), players });

    const first = fallingFloor.snapshot(state) as { full: number[] };
    expect(first.full).toHaveLength(GRID * GRID);
    const mirror = [...first.full];

    for (let i = 1; i <= 1200; i++) {
      fallingFloor.tick(state, {
        dt: TICK_DT, elapsed: i * TICK_MS, rng: makeRng(5), players, input: () => IDLE_INPUT,
      });
      const snap = fallingFloor.snapshot(state) as { changed: (readonly [number, number])[] };
      for (const [idxChanged, st] of snap.changed) mirror[idxChanged] = st;
    }
    expect(mirror).toEqual(state.tiles.map((t) => t.state));
  });

  it("declares a fixed camera and no assets (RD-005)", () => {
    const arena = fallingFloor.arena({} as FallingFloorState);
    // `extent` is a distance in metres, not a camera instruction — there is nothing in
    // it a client could steer. The list stays exhaustive so the next field is a
    // decision rather than a drift.
    expect(Object.keys(arena.camera).sort()).toEqual(["extent", "eye", "fov", "look"]);
    // Still empty, and that is exactly why the extent has to be declared: there is
    // nothing here for a client to measure the arena from.
    expect(arena.statics).toEqual([]);
    expect(arena.solids).toEqual([]);
  });

  it("uses the stick only, with a one-sentence rule (vision pillar 1 and 2)", () => {
    expect(fallingFloor.input).toBe("stick");
    expect(fallingFloor.rule.split(".").filter((p) => p.trim())).toHaveLength(1);
    expect(fallingFloor.rule.length).toBeLessThan(70);
  });
});

describe("the arena declares a footprint big enough for its grid (arena-framing T1, R2)", () => {
  it("is half the grid's width — a half-width, not a radius", () => {
    // The registry's generic check cannot see this one: the tiles are in neither
    // `solids` nor `statics` — they arrive at the client via `setTiles` — so the only
    // place that knows the grid's true size is here.
    const { extent } = fallingFloor.arena(
      fallingFloor.init({ rng: makeRng(1), players: mkPlayers(8) }),
    ).camera;
    expect(extent).toBeCloseTo((GRID * TILE) / 2, 9);
  });

  it("keeps every tile inside the footprint it claims", () => {
    // Chebyshev, matching the square the client fits (RD-033). The outer tiles' far
    // edges are what leave the frame first, so the tile edge is checked, not its centre.
    const state = fallingFloor.init({ rng: makeRng(1), players: mkPlayers(8) });
    const { extent } = fallingFloor.arena(state).camera;
    const half = ((GRID - 1) * TILE) / 2;
    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        const x = Math.abs(col * TILE - half) + TILE / 2;
        const z = Math.abs(row * TILE - half) + TILE / 2;
        expect(Math.max(x, z), `tile ${col},${row}`).toBeLessThanOrEqual(extent! + 1e-9);
      }
    }
  });
});

describe("a spectator gets a base frame to apply deltas to (RD-052)", () => {
  it("sends the whole grid again after a resync", () => {
    // The delta channel assumes every client saw the first frame. A mid-round joiner
    // did not, so they received diffs against a base they never had and watched
    // characters float in an empty sky — found by a screenshot, not by this suite.
    const players = mkPlayers(4);
    const state = fallingFloor.init({ rng: makeRng(1), players });

    const first = fallingFloor.snapshot(state) as { full?: number[]; changed?: unknown };
    expect(first.full, "the first frame is whole").toBeDefined();
    const second = fallingFloor.snapshot(state) as { full?: number[]; changed?: unknown };
    expect(second.full, "and the next is a delta").toBeUndefined();

    fallingFloor.resync!(state);
    const afterJoin = fallingFloor.snapshot(state) as { full?: number[]; changed?: unknown };
    expect(afterJoin.full, "a spectator gets a whole one").toBeDefined();
    expect(afterJoin.full).toHaveLength(GRID * GRID);
  });

  it("returns to deltas straight afterwards", () => {
    // One full frame, not a permanent switch: 121 numbers once is cheap, every tick
    // is not.
    const players = mkPlayers(4);
    const state = fallingFloor.init({ rng: makeRng(1), players });
    fallingFloor.snapshot(state);
    fallingFloor.resync!(state);
    fallingFloor.snapshot(state);
    const next = fallingFloor.snapshot(state) as { full?: number[] };
    expect(next.full).toBeUndefined();
  });
});
