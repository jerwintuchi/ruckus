/**
 * Players are solid (player-collision T1, T2, R1–R3, P1–P3).
 */
import { describe, expect, it } from "vitest";
import { PLAYER_RADIUS } from "../constants.ts";
import { CONTACT_DISTANCE, resolvePlayerOverlaps, type Collidable } from "./collide.ts";
import { makeBody, type Solid } from "./move.ts";
import { makeRng } from "./rng.ts";
import { vec } from "./vec.ts";

const at = (slot: number, x: number, z: number, alive = true): Collidable =>
  ({ slot, body: makeBody(vec(x, z)), alive });

const gap = (a: Collidable, b: Collidable): number =>
  Math.hypot(a.body.pos.x - b.body.pos.x, a.body.pos.z - b.body.pos.z);

/** A box arena, as every real one is. */
const WALLS: Solid[] = [
  { min: vec(-11, -11), max: vec(11, -10) },
  { min: vec(-11, 10), max: vec(11, 11) },
  { min: vec(-11, -11), max: vec(-10, 11) },
  { min: vec(10, -11), max: vec(11, 11) },
];

describe("nobody overlaps anybody (R1, P1)", () => {
  it("separates a pair that started on top of each other", () => {
    const a = at(0, 0, 0);
    const b = at(1, 0.1, 0);
    resolvePlayerOverlaps([a, b], []);
    expect(gap(a, b)).toBeGreaterThanOrEqual(CONTACT_DISTANCE - 1e-9);
  });

  it("separates a pile-up, over many seeds", () => {
    // The failure mode a single pass has: three or more bodies in one spot, where
    // fixing one pair re-breaks another.
    const rng = makeRng(11);
    for (let seed = 0; seed < 200; seed++) {
      const n = 2 + (seed % 7);
      const players = Array.from({ length: n }, (_, i) =>
        at(i, rng.range(-1, 1), rng.range(-1, 1)));
      resolvePlayerOverlaps(players, []);
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          expect(gap(players[i]!, players[j]!), `seed ${seed}: ${i} vs ${j}`)
            .toBeGreaterThanOrEqual(CONTACT_DISTANCE - 1e-6);
        }
      }
    }
  });

  it("leaves players alone when they already have room", () => {
    const a = at(0, 0, 0);
    const b = at(1, 5, 5);
    resolvePlayerOverlaps([a, b], []);
    expect(a.body.pos).toEqual(vec(0, 0));
    expect(b.body.pos).toEqual(vec(5, 5));
  });

  it("separates coincident players deterministically (P3)", () => {
    // No axis exists between two bodies at the same point, so the choice must come
    // from the slots rather than from whatever noise is in the coordinates.
    const run = (): [number, number] => {
      const a = at(0, 3, 3);
      const b = at(1, 3, 3);
      resolvePlayerOverlaps([a, b], []);
      return [a.body.pos.x, b.body.pos.x];
    };
    expect(run()).toEqual(run());
    const a = at(0, 3, 3);
    const b = at(1, 3, 3);
    resolvePlayerOverlaps([a, b], []);
    expect(gap(a, b)).toBeGreaterThanOrEqual(CONTACT_DISTANCE - 1e-9);
  });
});

describe("pushing is symmetric, and only the living are solid (R2, P2)", () => {
  it("moves both players the same distance", () => {
    // Equal split: a stationary player is not an immovable object.
    const a = at(0, 0, 0);
    const b = at(1, 0.3, 0);
    resolvePlayerOverlaps([a, b], []);
    expect(Math.abs(a.body.pos.x - 0)).toBeCloseTo(Math.abs(b.body.pos.x - 0.3), 9);
  });

  it("ignores an eliminated body — a corpse is not a wall", () => {
    const a = at(0, 0, 0);
    const dead = at(1, 0.05, 0, false);
    resolvePlayerOverlaps([a, dead], []);
    expect(a.body.pos).toEqual(vec(0, 0));
    expect(dead.body.pos).toEqual(vec(0.05, 0));
  });

  it("is a pure function of the bodies it is given", () => {
    const players = [at(0, 0, 0), at(1, 0.2, 0.1), at(2, -0.1, 0.2)];
    resolvePlayerOverlaps(players, []);
    const after = players.map((p) => ({ ...p.body.pos }));
    resolvePlayerOverlaps(players, []); // already resolved: nothing should move
    expect(players.map((p) => ({ ...p.body.pos }))).toEqual(after);
  });
});

describe("solids win (R3, P1)", () => {
  it("never leaves a shoved player inside a wall, from any angle", () => {
    // The property that makes the ordering matter: separate first, then re-resolve
    // against geometry. The other way round lets two players squeeze a third out.
    const rng = makeRng(5);
    for (let seed = 0; seed < 300; seed++) {
      const angle = rng.range(0, Math.PI * 2);
      const x = Math.cos(angle) * 9.7;
      const z = Math.sin(angle) * 9.7;
      const shoved = at(0, x, z);
      const shover = at(1, x * 0.97, z * 0.97);
      resolvePlayerOverlaps([shoved, shover], WALLS);
      for (const p of [shoved, shover]) {
        expect(Math.abs(p.body.pos.x), `seed ${seed}`).toBeLessThanOrEqual(10 - PLAYER_RADIUS + 1e-6);
        expect(Math.abs(p.body.pos.z), `seed ${seed}`).toBeLessThanOrEqual(10 - PLAYER_RADIUS + 1e-6);
      }
    }
  });

  it("keeps a player crushed between a wall and another player out of the wall", () => {
    const wall = at(0, 9.6, 0);
    const crusher = at(1, 9.2, 0);
    resolvePlayerOverlaps([wall, crusher], WALLS);
    expect(wall.body.pos.x).toBeLessThanOrEqual(10 - PLAYER_RADIUS + 1e-6);
  });

  it("does not push anyone out of an arena with no walls at all", () => {
    // falling-floor ships solids: [] — the grid is not collision geometry.
    const a = at(0, 40, 40);
    resolvePlayerOverlaps([a], []);
    expect(a.body.pos).toEqual(vec(40, 40));
  });
});

describe("contact means what hot-potato needs it to mean (R3)", () => {
  it("holds a resting pair at exactly two radii", () => {
    // This is the distance hot-potato's CONTACT is compared against, so the two
    // constants have to agree about what "touching" is.
    const a = at(0, 0, 0);
    const b = at(1, 0.01, 0);
    resolvePlayerOverlaps([a, b], []);
    expect(gap(a, b)).toBeCloseTo(CONTACT_DISTANCE, 6);
    expect(CONTACT_DISTANCE).toBe(PLAYER_RADIUS * 2);
  });
});
