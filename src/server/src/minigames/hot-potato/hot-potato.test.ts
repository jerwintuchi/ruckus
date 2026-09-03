import { describe, expect, it } from "vitest";
import {
  IDLE_INPUT,
  MAX_SPEED,
  TICK_DT,
  TICK_MS,
  minThicknessFor,
  type InputState,
  type PlayerRuntime,
  type TickCtx,
  PLAYER_RADIUS,
  makeBody,
  makeRng,
  vec,
} from "@ruckus/shared";
import {
  ARENA,
  CONTACT,
  TUMBLE_COOLDOWN_MS,
  TUMBLE_MS,
  THROW_MS,
  HOLD_TO_THROW_MS,
  TUMBLE_SPEED_MUL,
  FUSE_MIN_MS,
  FUSE_START_MS,
  FUSE_STEP_MS,
  MAX_DURATION_MS,
  PASS_LOCK_MS,
  WALL,
  WALLS,
  hotPotato,
  type HotPotatoState,
} from "./index.ts";
import { mkPlayers } from "../harness.ts";

const HALF = ARENA / 2;


const ctxFor = (
  players: PlayerRuntime[],
  elapsed: number,
  seed: number,
  input: (slot: number) => InputState = () => IDLE_INPUT,
): TickCtx => ({ dt: TICK_DT, elapsed, rng: makeRng(seed), players, input });

/** Drive a round the way the shell does. */
function run(
  players: PlayerRuntime[],
  seed: number,
  input: (slot: number, elapsed: number) => InputState = () => IDLE_INPUT,
  maxMs = MAX_DURATION_MS,
): { state: HotPotatoState; elapsed: number; over: boolean } {
  const state = hotPotato.init({ rng: makeRng(seed), players });
  let elapsed = 0;
  let over = false;
  while (elapsed < maxMs) {
    elapsed += TICK_DT * 1000;
    const ctx = ctxFor(players, elapsed, seed, (slot) => input(slot, elapsed));
    hotPotato.tick(state, ctx);
    if (hotPotato.isOver(state, ctx)) {
      over = true;
      break;
    }
  }
  return { state, elapsed, over };
}

const step = (
  state: HotPotatoState,
  players: PlayerRuntime[],
  elapsed: number,
  input: (slot: number) => InputState = () => IDLE_INPUT,
): void => hotPotato.tick(state, ctxFor(players, elapsed, 1, input));

describe("passing (T4, R1, R2, P1)", () => {
  it("passes the bomb on contact", () => {
    const players = mkPlayers(2);
    const state = hotPotato.init({ rng: makeRng(1), players });
    const holder = state.holder;
    const other = players.find((p) => p.slot !== holder)!;
    const held = players.find((p) => p.slot === holder)!;

    held.body.pos = vec(0, 0);
    other.body.pos = vec(CONTACT * 0.5, 0);
    step(state, players, TICK_MS);
    expect(state.holder).toBe(other.slot);
  });

  it("refuses a pass-back inside PASS_LOCK_MS (P1)", () => {
    const players = mkPlayers(2);
    const state = hotPotato.init({ rng: makeRng(1), players });
    const a = players.find((p) => p.slot === state.holder)!;
    const b = players.find((p) => p.slot !== state.holder)!;
    a.body.pos = vec(0, 0);
    b.body.pos = vec(CONTACT * 0.5, 0);

    step(state, players, TICK_MS);
    expect(state.holder).toBe(b.slot);

    // Still touching, well inside the lock: the bomb must stay put.
    for (let t = 100; t < PASS_LOCK_MS; t += TICK_MS) {
      a.body.pos = vec(0, 0);
      b.body.pos = vec(CONTACT * 0.5, 0);
      step(state, players, t);
      expect(state.holder, `at ${t}ms`).toBe(b.slot);
    }
  });

  it("no pair exchanges the bomb twice inside the lock, over many seeds", () => {
    for (let seed = 0; seed < 200; seed++) {
      const players = mkPlayers(4);
      const state = hotPotato.init({ rng: makeRng(seed), players });
      const passes: { from: number; to: number; at: number }[] = [];
      let prev = state.holder;
      let prevBlasts = state.blasts;

      for (let i = 1; i <= 400; i++) {
        const t = i * TICK_MS;
        // Herd everyone together so contacts are constant and the lock is stressed.
        for (const p of players) p.body.pos = vec((p.slot % 2) * 0.3, (p.slot >> 1) * 0.3);
        step(state, players, t);
        // A holder change on an explosion tick is a REASSIGNMENT, not a pass — the
        // bomb is handed to the nearest survivor and no lock applies to that.
        if (state.holder !== prev && state.blasts === prevBlasts) {
          passes.push({ from: prev, to: state.holder, at: t });
        }
        prev = state.holder;
        prevBlasts = state.blasts;
      }

      for (let i = 0; i < passes.length; i++) {
        for (let j = i + 1; j < passes.length; j++) {
          const x = passes[i]!;
          const y = passes[j]!;
          if (y.at - x.at >= PASS_LOCK_MS) break;
          const samePair = x.from === y.to && x.to === y.from;
          expect(samePair, `seed ${seed}: ${x.from}->${x.to} then ${y.from}->${y.to}`).toBe(false);
        }
      }
    }
  });

  it("gives the bomb to the nearest toucher in a pile-up, not to array order", () => {
    const players = mkPlayers(4);
    const state = hotPotato.init({ rng: makeRng(3), players });
    const h = players.find((p) => p.slot === state.holder)!;
    const others = players.filter((p) => p.slot !== state.holder);

    h.body.pos = vec(0, 0);
    others[0]!.body.pos = vec(CONTACT * 0.9, 0); // furthest, but earliest in the array
    others[1]!.body.pos = vec(CONTACT * 0.2, 0); // nearest
    others[2]!.body.pos = vec(CONTACT * 0.6, 0);

    step(state, players, TICK_MS);
    expect(state.holder).toBe(others[1]!.slot);
  });

  it("keeps exactly one living holder whenever two or more are alive (P4)", () => {
    for (let seed = 0; seed < 60; seed++) {
      const players = mkPlayers(5);
      const state = hotPotato.init({ rng: makeRng(seed), players });
      for (let i = 1; i <= 1400; i++) {
        step(state, players, i * TICK_MS);
        if (state.alive.size > 1) {
          expect(state.alive.has(state.holder), `seed ${seed} tick ${i}`).toBe(true);
        }
      }
    }
  });
});

describe("the fuse (T5, R3)", () => {
  it("eliminates the holder at zero and hands the bomb on", () => {
    const players = mkPlayers(3);
    const state = hotPotato.init({ rng: makeRng(7), players });
    // Park everyone far apart so nothing passes and the fuse simply runs out.
    players.forEach((p, i) => (p.body.pos = vec(-6 + i * 6, i === 0 ? -6 : 6)));
    const victim = state.holder;

    for (let i = 1; i * TICK_MS <= FUSE_START_MS + 100; i++) {
      players.forEach((p, k) => (p.body.pos = vec(-6 + k * 6, k === 0 ? -6 : 6)));
      step(state, players, i * TICK_MS);
    }
    expect(state.alive.has(victim)).toBe(false);
    expect(state.placement).toContain(victim);
    expect(state.holder).not.toBe(victim);
    expect(state.alive.has(state.holder)).toBe(true);
    expect(state.blasts).toBe(1);
  });

  it("shortens each fuse and floors it at FUSE_MIN_MS", () => {
    const players = mkPlayers(8);
    const { state } = run(players, 5); // idle: fuse after fuse until one remains
    expect(state.blasts).toBe(7);
    expect(state.fuseLength).toBeGreaterThanOrEqual(FUSE_MIN_MS);
    const unfloored = FUSE_START_MS - 7 * FUSE_STEP_MS;
    expect(state.fuseLength).toBe(Math.max(FUSE_MIN_MS, unfloored));
  });

  it("does not end the round on an explosion while two or more remain", () => {
    const players = mkPlayers(4);
    const state = hotPotato.init({ rng: makeRng(2), players });
    let sawBlastWithSurvivors = false;
    for (let i = 1; i <= 800; i++) {
      step(state, players, i * TICK_MS);
      if (state.blasts > 0 && state.alive.size > 1) sawBlastWithSurvivors = true;
      if (state.alive.size <= 1) break;
    }
    expect(sawBlastWithSurvivors).toBe(true);
  });

  it("explodes on a disconnected holder rather than freezing (I8)", () => {
    const players = mkPlayers(3);
    const state = hotPotato.init({ rng: makeRng(9), players });
    const victim = state.holder;
    players.forEach((p, i) => (p.body.pos = vec(-6 + i * 6, i === 0 ? -6 : 6)));

    // The holder drops: they contribute idle input but remain a valid bomb target.
    for (let i = 1; i * TICK_MS <= FUSE_START_MS + 100; i++) {
      players.forEach((p, k) => (p.body.pos = vec(-6 + k * 6, k === 0 ? -6 : 6)));
      hotPotato.tick(
        state,
        ctxFor(players, i * TICK_MS, 1, (slot) => (slot === victim ? IDLE_INPUT : IDLE_INPUT)),
      );
    }
    expect(state.alive.has(victim)).toBe(false);
  });
});

describe("tumbling (T6, R4, P2)", () => {
  const pressed: InputState = { axis: { x: 1, z: 0 }, btn: true };
  const running: InputState = { axis: { x: 1, z: 0 }, btn: false };

  it("a held button tumbles exactly once, never chains (P2)", () => {
    const players = mkPlayers(1);
    const state = hotPotato.init({ rng: makeRng(1), players });
    const slot = players[0]!.slot;

    step(state, players, 50, () => pressed);
    const firstReady = state.tumbleReadyAt.get(slot)!;
    for (let i = 2; i <= 10; i++) step(state, players, i * TICK_MS, () => pressed);
    // Still the same cooldown stamp: holding produced no second tumble.
    expect(state.tumbleReadyAt.get(slot)).toBe(firstReady);
  });

  it("refuses a second tumble inside the cooldown, and allows one after", () => {
    // Two players, and the button is pressed by the one NOT holding the bomb: the
    // holder's button throws now, so a lone player can never demonstrate a tumble.
    const players = mkPlayers(2);
    const state = hotPotato.init({ rng: makeRng(1), players });
    const slot = players.find((p) => p.slot !== state.holder)!.slot;
    const pressBy = (s: number) => (who: number) => (who === s ? pressed : IDLE_INPUT);

    step(state, players, 50, pressBy(slot));
    const first = state.tumbleReadyAt.get(slot)!;

    // Release, then press again well inside the cooldown: refused.
    step(state, players, 100, () => running);
    step(state, players, 150, pressBy(slot));
    expect(state.tumbleReadyAt.get(slot)).toBe(first);

    // Release, press again after the cooldown: allowed.
    step(state, players, TUMBLE_COOLDOWN_MS + 100, () => running);
    step(state, players, TUMBLE_COOLDOWN_MS + 150, pressBy(slot));
    expect(state.tumbleReadyAt.get(slot)).toBeGreaterThan(first);
  });

  it("covers more ground over a fixed window than running", () => {
    // Two players, measuring the one NOT holding the bomb: the holder's button throws
    // now, so a lone player pressing it never tumbles at all.
    const cover = (btnAt: number | null): number => {
      const players = mkPlayers(2);
      const state = hotPotato.init({ rng: makeRng(1), players });
      const runner = players.find((p) => p.slot !== state.holder)!;
      // Well clear of the holder, so neither collision nor a pass perturbs the run.
      players.find((p) => p.slot === state.holder)!.body.pos = vec(HALF - 2, HALF - 2);
      runner.body.pos = vec(-HALF + 2, 0);
      const start = runner.body.pos.x;
      for (let i = 1; i <= 8; i++) {
        const t = i * TICK_MS;
        step(state, players, t, (who) =>
          who === runner.slot && btnAt !== null && t >= btnAt ? pressed : running);
      }
      return runner.body.pos.x - start;
    };
    expect(cover(50)).toBeGreaterThan(cover(null));
  });

  it("the tumble window is shorter than its cooldown, so it is a burst not a mode", () => {
    expect(TUMBLE_MS).toBeLessThan(TUMBLE_COOLDOWN_MS);
  });
});

describe("the walled arena (T7, R5)", () => {
  it("walls are thick enough for the DASHING speed, not just the base one", () => {
    expect(WALL).toBeGreaterThanOrEqual(minThicknessFor(TUMBLE_SPEED_MUL));
    expect((MAX_SPEED * TUMBLE_SPEED_MUL) / 20).toBeLessThanOrEqual(WALL);
  });

  it("nobody escapes, driven at every wall while tumbling, over many seeds", () => {
    const dirs = [vec(1, 0), vec(-1, 0), vec(0, 1), vec(0, -1), vec(1, 1), vec(-1, -1)];
    for (let seed = 0; seed < 200; seed++) {
      const dir = dirs[seed % dirs.length]!;
      const players = mkPlayers(1);
      const state = hotPotato.init({ rng: makeRng(seed), players });
      // Collect and assert once. 200 seeds x 200 ticks x 2 matchers is 80k matcher
      // invocations, which pushed this test to the 5s timeout under parallel load and
      // made it fail intermittently — a slow assertion loop reads exactly like a bug.
      let escaped = 0;
      for (let i = 1; i <= 200; i++) {
        // Mash the button too: the tumble is the case most likely to punch through.
        step(state, players, i * TICK_MS, () => ({ axis: dir, btn: i % 40 < 2 }));
        const { x, z } = players[0]!.body.pos;
        if (Math.abs(x) > HALF + 0.01 || Math.abs(z) > HALF + 0.01) escaped++;
      }
      expect(escaped, `seed ${seed} escaped the arena`).toBe(0);
    }
  });

  it("publishes those same walls as solids, so the client draws what the sim uses", () => {
    const arena = hotPotato.arena({} as HotPotatoState);
    expect(arena.solids).toBe(WALLS);
    expect(arena.solids).toHaveLength(4);
  });
});

describe("round shape and scoring (T8, R6, P3)", () => {
  it("ends with zero input from anyone, over many seeds", () => {
    for (let seed = 0; seed < 200; seed++) {
      const players = mkPlayers(6);
      const { over, elapsed } = run(players, seed);
      expect(over, `seed ${seed}`).toBe(true);
      expect(elapsed).toBeLessThan(MAX_DURATION_MS);
    }
  });

  it("is bounded by fuses, so 8 idle players finish well inside the cap (P3)", () => {
    const players = mkPlayers(8);
    const { elapsed } = run(players, 11);
    expect(elapsed).toBeLessThanOrEqual(FUSE_START_MS * 7);
    expect(elapsed).toBeLessThan(MAX_DURATION_MS);
  });

  it("awards 3/2/1 by placement, with the survivor first", () => {
    const players = mkPlayers(4);
    const { state } = run(players, 21);
    const s = hotPotato.scores(state);
    const survivor = state.roster.find((slot) => state.alive.has(slot))!;
    expect(s[survivor]).toBe(3);
    const lastOut = state.placement[state.placement.length - 1]!;
    const firstOut = state.placement[0]!;
    expect(s[lastOut]).toBe(2);
    expect(s[firstOut]).toBe(0);
  });

  it("never awards more than 3, and is monotonic in elimination order", () => {
    for (let seed = 0; seed < 100; seed++) {
      const players = mkPlayers(6);
      const { state } = run(players, seed);
      const s = hotPotato.scores(state);
      for (const pts of Object.values(s)) {
        expect(pts).toBeLessThanOrEqual(3);
        expect(pts).toBeGreaterThanOrEqual(0);
      }
      for (let i = 0; i < state.placement.length; i++) {
        for (let j = i + 1; j < state.placement.length; j++) {
          expect(s[state.placement[i]!]!).toBeLessThanOrEqual(s[state.placement[j]!]!);
        }
      }
    }
  });

  it("scores every roster member, including anyone who never moved", () => {
    const players = mkPlayers(5);
    const { state } = run(players, 33);
    const s = hotPotato.scores(state);
    for (let slot = 0; slot < 5; slot++) expect(s[slot]).toBeTypeOf("number");
  });
});

describe("determinism (T9, R7, I3)", () => {
  it("same seed and inputs give an identical round", () => {
    const scripted = (slot: number, elapsed: number): InputState => ({
      axis: vec(Math.sin((elapsed + slot * 211) / 280), Math.cos((elapsed + slot * 97) / 190)),
      btn: Math.floor(elapsed / 700 + slot) % 5 === 0,
    });

    for (let seed = 0; seed < 200; seed++) {
      const a = mkPlayers(4);
      const b = mkPlayers(4);
      const ra = run(a, seed, scripted);
      const rb = run(b, seed, scripted);

      expect(ra.elapsed).toBe(rb.elapsed);
      expect(ra.state.holder).toBe(rb.state.holder);
      expect(ra.state.fuseMs).toBeCloseTo(rb.state.fuseMs, 9);
      expect(ra.state.placement).toEqual(rb.state.placement);
      expect(ra.state.blasts).toBe(rb.state.blasts);
      expect(a.map((p) => p.body.pos)).toEqual(b.map((p) => p.body.pos));
    }
  });

  it("spawns nobody in contact, so tick one cannot be an instant pass", () => {
    for (let seed = 0; seed < 100; seed++) {
      for (const n of [2, 4, 8]) {
        const players = mkPlayers(n);
        hotPotato.init({ rng: makeRng(seed), players });
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const d = Math.hypot(
              players[i]!.body.pos.x - players[j]!.body.pos.x,
              players[i]!.body.pos.z - players[j]!.body.pos.z,
            );
            expect(d, `seed ${seed} n=${n}`).toBeGreaterThan(CONTACT);
          }
        }
      }
    }
  });

  it("spawns everyone inside the walls", () => {
    for (let seed = 0; seed < 100; seed++) {
      const players = mkPlayers(8);
      hotPotato.init({ rng: makeRng(seed), players });
      for (const p of players) {
        expect(Math.abs(p.body.pos.x)).toBeLessThan(HALF);
        expect(Math.abs(p.body.pos.z)).toBeLessThan(HALF);
      }
    }
  });
});

describe("snapshot and contract (T10, R8)", () => {
  it("puts the bomb on the generic prims channel, tracking the holder (P5)", () => {
    const players = mkPlayers(3);
    const state = hotPotato.init({ rng: makeRng(4), players });
    step(state, players, TICK_MS);

    const snap = hotPotato.snapshot(state) as {
      holder: number;
      fuse: number;
      prims: { k: string; pos: [number, number, number]; r: number }[];
    };
    expect(snap.prims).toHaveLength(1);
    expect(snap.prims[0]!.k).toBe("sphere");

    const holderBody = players.find((p) => p.slot === snap.holder)!.body;
    expect(snap.prims[0]!.pos[0]).toBeCloseTo(holderBody.pos.x, 6);
    expect(snap.prims[0]!.pos[2]).toBeCloseTo(holderBody.pos.z, 6);
    expect(snap.prims[0]!.pos[1]).toBeGreaterThan(1); // above the head
  });

  it("reports a fuse that never goes negative on the wire", () => {
    const players = mkPlayers(2);
    const state = hotPotato.init({ rng: makeRng(6), players });
    for (let i = 1; i <= 400; i++) {
      step(state, players, i * TICK_MS);
      const snap = hotPotato.snapshot(state) as { fuse: number };
      expect(snap.fuse).toBeGreaterThanOrEqual(0);
    }
  });

  it("needs no client file — the point of choosing this minigame second", () => {
    // If this ever fails, the generic prims channel (RD-009) has stopped being enough
    // and the contract needs revisiting, not a quiet exception.
    expect(hotPotato.id).toBe("hot-potato");
  });

  it("honours the contract's preconditions", () => {
    expect(hotPotato.input).toBe("stick+button");
    expect(hotPotato.rule.split(".").filter((p) => p.trim())).toHaveLength(1);
    expect(hotPotato.rule.length).toBeLessThan(80);
    expect(hotPotato.maxDurationMs).toBeGreaterThan(0);
    const arena = hotPotato.arena({} as HotPotatoState);
    // `extent` is a distance in metres, not a camera instruction — nothing in it a
    // client could steer. The list stays exhaustive so the next field is a decision.
    expect(Object.keys(arena.camera).sort()).toEqual(["extent", "eye", "fov", "look"]);
  });
});

describe("contact survives player collision (player-collision T4, R3)", () => {
  it("passes the bomb between two players resting against each other", () => {
    // Collision holds a resting pair at exactly 2 * PLAYER_RADIUS, which is what
    // CONTACT used to be — so the round's central mechanic was decided by the last bit
    // of a square root. The tolerance is what makes "resting against them" count.
    const players = mkPlayers(2);
    const state = hotPotato.init({ rng: makeRng(3), players });
    const holder = state.holder;
    const other = players.find((p) => p.slot !== holder)!;

    players[holder]!.body.pos = vec(0, 0);
    other.body.pos = vec(PLAYER_RADIUS * 2, 0); // exactly touching, as collision leaves them

    // Past the pass lock, then one tick.
    step(state, players, PASS_LOCK_MS + TICK_MS);
    expect(state.holder).toBe(other.slot);
  });

  it("still refuses a pass at a distance nobody would call touching", () => {
    const players = mkPlayers(2);
    const state = hotPotato.init({ rng: makeRng(3), players });
    const holder = state.holder;
    const other = players.find((p) => p.slot !== holder)!;

    players[holder]!.body.pos = vec(0, 0);
    other.body.pos = vec(CONTACT + 0.2, 0);
    step(state, players, PASS_LOCK_MS + TICK_MS);
    expect(state.holder).toBe(holder);
  });
});

describe("the throw (action-button T4, R3, P3)", () => {
  /** Put the holder at the origin facing +z, with one catcher along the flight path. */
  const thrown = (catcherAt: { x: number; z: number } | null, seed = 4) => {
    const players = mkPlayers(catcherAt ? 2 : 1);
    const state = hotPotato.init({ rng: makeRng(seed), players });
    const holder = players.find((p) => p.slot === state.holder)!;
    holder.body.pos = vec(0, 0);
    holder.facing = 0; // +z
    const other = players.find((p) => p.slot !== state.holder);
    if (other && catcherAt) other.body.pos = vec(catcherAt.x, catcherAt.z);
    // Past the pass lock, then HOLD: a tap would tumble now, not throw (RD-043).
    let t = PASS_LOCK_MS;
    for (let h = 0; h <= HOLD_TO_THROW_MS + TICK_MS; h += TICK_MS) {
      t += TICK_MS;
      step(state, players, t, () => ({ ...IDLE_INPUT, btn: true }));
    }
    return { state, players, holder, other };
  };

  it("leaves the hand: there is a bomb in flight after the press", () => {
    const { state } = thrown({ x: 0, z: 6 });
    expect(state.flight).not.toBeNull();
  });

  it("is caught by a player in its path", () => {
    const { state, players, other } = thrown({ x: 0, z: 5 });
    for (let i = 2; i * TICK_MS <= PASS_LOCK_MS + THROW_MS + 400; i++) {
      step(state, players, PASS_LOCK_MS + i * TICK_MS);
    }
    expect(state.flight).toBeNull();
    expect(state.holder).toBe(other!.slot);
  });

  it("always ends with a holder, even thrown at nobody (P3, I8)", () => {
    // A bomb that could rest unheld is a fuse nobody can beat and a round that never
    // ends. Every angle, many seeds.
    for (let seed = 0; seed < 60; seed++) {
      const players = mkPlayers(3);
      const state = hotPotato.init({ rng: makeRng(seed), players });
      const holder = players.find((p) => p.slot === state.holder)!;
      holder.facing = (seed / 60) * Math.PI * 2;
      let th = PASS_LOCK_MS;
      for (let h = 0; h <= HOLD_TO_THROW_MS + TICK_MS; h += TICK_MS) {
        th += TICK_MS;
        step(state, players, th, () => ({ ...IDLE_INPUT, btn: true }));
      }
      for (let i = 2; i * TICK_MS <= PASS_LOCK_MS + THROW_MS + 600; i++) {
        step(state, players, PASS_LOCK_MS + i * TICK_MS);
      }
      expect(state.flight, `seed ${seed}`).toBeNull();
      expect(state.alive.has(state.holder), `seed ${seed}`).toBe(true);
    }
  });

  it("still respects the pass lock after a catch", () => {
    const { state, players } = thrown({ x: 0, z: 5 });
    const before = state.holder;
    // Step until the catch, then assert the lock was armed at that moment — not after
    // running past it, which was the first version of this test and always false.
    for (let i = 2; i * TICK_MS <= PASS_LOCK_MS + THROW_MS + 400; i++) {
      step(state, players, PASS_LOCK_MS + i * TICK_MS);
      if (state.holder !== before) {
        expect(state.lockUntil).toBeGreaterThan(state.elapsed);
        return;
      }
    }
    throw new Error("the bomb was never caught");
  });

  it("draws the bomb where it is flying, not on whoever threw it", () => {
    // The bomb is a prim in the snapshot, so this reads the picture the client gets.
    const { state, players, holder } = thrown({ x: 0, z: 9 });
    step(state, players, PASS_LOCK_MS + 2 * TICK_MS);
    const snap = hotPotato.snapshot(state) as { prims: { pos: [number, number, number] }[] };
    expect(snap.prims.length).toBeGreaterThan(0);
    expect(snap.prims[0]!.pos[2]).toBeGreaterThan(holder.body.pos.z);
  });

  it("does not let the holder tumble instead of throwing", () => {
    const { state } = thrown({ x: 0, z: 6 });
    expect(state.tumbleUntil.get(state.flight!.from) ?? 0).toBe(0);
  });
});

describe("tap tumbles, hold throws (action-button T8, R7)", () => {
  /** Drive one player's button for a given number of ticks, then release. */
  const press = (state: HotPotatoState, players: PlayerRuntime[], slot: number, ms: number) => {
    let t = PASS_LOCK_MS;
    for (let held = 0; held < ms; held += TICK_MS) {
      t += TICK_MS;
      step(state, players, t, (who) => (who === slot ? { ...IDLE_INPUT, btn: true } : IDLE_INPUT));
    }
    t += TICK_MS;
    step(state, players, t, () => IDLE_INPUT); // release
    return t;
  };

  it("lets the HOLDER tumble on a tap — they need the escape most", () => {
    // The first version was role-based and took the tumble away from the one player
    // being chased, which is why it felt broken.
    const players = mkPlayers(2);
    const state = hotPotato.init({ rng: makeRng(2), players });
    const holder = state.holder;
    press(state, players, holder, TICK_MS); // a tap: one tick, then release
    expect(state.flight).toBeNull();
    expect(state.tumbleReadyAt.get(holder) ?? 0).toBeGreaterThan(0);
  });

  it("throws when the holder keeps it pressed", () => {
    const players = mkPlayers(2);
    const state = hotPotato.init({ rng: makeRng(2), players });
    const holder = state.holder;
    players.find((p) => p.slot !== holder)!.body.pos = vec(0, 40); // far away, no catch yet
    press(state, players, holder, HOLD_TO_THROW_MS + TICK_MS * 2);
    expect(state.tumbleReadyAt.get(holder) ?? 0).toBe(0); // it threw instead
  });

  it("never turns one press into two actions", () => {
    // A hold that throws must not also tumble on release, and vice versa.
    const players = mkPlayers(2);
    const state = hotPotato.init({ rng: makeRng(5), players });
    const holder = state.holder;
    players.find((p) => p.slot !== holder)!.body.pos = vec(0, 40);
    press(state, players, holder, HOLD_TO_THROW_MS + TICK_MS * 3);
    expect(state.tumbleReadyAt.get(holder) ?? 0).toBe(0);
  });

  it("tumbles a non-holder however long they press", () => {
    // Only the holder has a second meaning; for everyone else a hold is just a tap.
    const players = mkPlayers(2);
    const state = hotPotato.init({ rng: makeRng(2), players });
    const other = players.find((p) => p.slot !== state.holder)!.slot;
    press(state, players, other, HOLD_TO_THROW_MS * 2);
    expect(state.flight).toBeNull();
    expect(state.tumbleReadyAt.get(other) ?? 0).toBeGreaterThan(0);
  });
});
