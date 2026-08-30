import { describe, expect, it } from "vitest";
import { STRATEGIES, toward, wander } from "./bots.mjs";

/**
 * The strategies are pure functions of what the wire carried, so they can be tested
 * rather than judged by watching a bot wander around. Each case asks the question that
 * actually matters: does the bot do the *right* thing, not merely a legal one.
 */

const mkBot = (over = {}) => ({
  slot: 0,
  game: null,
  extra: {},
  snapPlayers: [{ slot: 0, x: 0, z: 0, y: 0, alive: true }],
  floor: { tiles: [], grid: 0, tile: 0 },
  me() { const p = this.snapPlayers.find((q) => q.slot === this.slot); return p ? { x: p.x, z: p.z, y: p.y } : null; },
  ...over,
});
const mag = (o) => Math.hypot(o.ax, o.ay);
const dirTo = (o) => Math.atan2(o.ay, o.ax);

describe("toward / wander", () => {
  it("toward points at the target and is unit length", () => {
    const o = toward({ x: 0, z: 0 }, { x: 3, z: 4 });
    expect(mag(o)).toBeCloseTo(1, 9);
    expect(o.ax).toBeCloseTo(0.6, 9);
    expect(o.ay).toBeCloseTo(0.8, 9);
  });
  it("toward survives a coincident target without NaN", () => {
    const o = toward({ x: 2, z: 2 }, { x: 2, z: 2 });
    expect(Number.isFinite(o.ax) && Number.isFinite(o.ay)).toBe(true);
  });
  it("wander always produces a finite bounded axis", () => {
    for (let i = 0; i < 50; i++) {
      const o = wander(mkBot({ slot: i }));
      expect(mag(o)).toBeLessThanOrEqual(1.5);
      expect(Number.isFinite(o.ax) && Number.isFinite(o.ay)).toBe(true);
    }
  });
});

describe("scramble — go get the nearest pickup", () => {
  const bot = mkBot({
    game: "scramble",
    extra: { prims: [
      { pos: [10, 0.5, 0] },   // far
      { pos: [0, 0.5, 2] },    // nearest
      { pos: [-8, 0.5, -8] },  // far
    ] },
  });

  it("heads for the nearest one, not the first in the list", () => {
    const o = STRATEGIES.scramble(bot);
    expect(dirTo(o)).toBeCloseTo(Math.atan2(2, 0), 6); // straight at +z
  });

  it("dashes when the target is a long way off, and not when it is close", () => {
    const far = mkBot({ game: "scramble", extra: { prims: [{ pos: [12, 0.5, 0] }] } });
    const near = mkBot({ game: "scramble", extra: { prims: [{ pos: [1, 0.5, 0] }] } });
    expect(STRATEGIES.scramble(far).btn).toBe(true);
    expect(STRATEGIES.scramble(near).btn).toBe(false);
  });

  it("falls back to wandering when the floor is empty", () => {
    const o = STRATEGIES.scramble(mkBot({ game: "scramble", extra: { prims: [] } }));
    expect(Number.isFinite(o.ax)).toBe(true);
  });
});

describe("hot-potato — chase when holding, flee when not", () => {
  const two = [
    { slot: 0, x: 0, z: 0, y: 0, alive: true },
    { slot: 1, x: 4, z: 0, y: 0, alive: true },
  ];

  it("chases the nearest player while holding the bomb", () => {
    const bot = mkBot({ game: "hot-potato", slot: 0, snapPlayers: two, extra: { holder: 0 } });
    const o = STRATEGIES["hot-potato"](bot);
    expect(o.ax).toBeGreaterThan(0.9);   // straight at slot 1
  });

  it("runs the other way when somebody else is holding it", () => {
    const bot = mkBot({ game: "hot-potato", slot: 0, snapPlayers: two, extra: { holder: 1 } });
    const o = STRATEGIES["hot-potato"](bot);
    expect(o.ax).toBeLessThan(-0.9);     // directly away from slot 1
  });

  it("saves the dash for when it matters, in both roles", () => {
    const close = [{ slot: 0, x: 0, z: 0, alive: true }, { slot: 1, x: 1.5, z: 0, alive: true }];
    const far = [{ slot: 0, x: 0, z: 0, alive: true }, { slot: 1, x: 9, z: 0, alive: true }];
    expect(STRATEGIES["hot-potato"](mkBot({ snapPlayers: close, extra: { holder: 0 } })).btn).toBe(true);
    expect(STRATEGIES["hot-potato"](mkBot({ snapPlayers: far, extra: { holder: 0 } })).btn).toBe(false);
    expect(STRATEGIES["hot-potato"](mkBot({ snapPlayers: close, extra: { holder: 1 } })).btn).toBe(true);
    expect(STRATEGIES["hot-potato"](mkBot({ snapPlayers: far, extra: { holder: 1 } })).btn).toBe(false);
  });
});

describe("sweepers — hold the rim, jump on time", () => {
  const at = (x, z, bars) => mkBot({
    game: "sweepers",
    snapPlayers: [{ slot: 0, x, z, y: 0, alive: true }],
    extra: { bars },
  });

  it("moves outward when too near the pivot, inward when too far", () => {
    const inner = STRATEGIES.sweepers(at(2, 0, []));
    const outer = STRATEGIES.sweepers(at(9.5, 0, []));
    expect(inner.ax).toBeGreaterThan(0);   // pushing out along +x
    expect(outer.ax).toBeLessThan(0);      // pulling back in
  });

  it("jumps when an armed bar is about to arrive, and not before", () => {
    // Bot sits at angle 0. A bar at -0.28 rad closing at 1 rad/s arrives in 0.28s,
    // which is inside the clearance window.
    const soon = at(7.6, 0, [{ angle: -0.28, speed: 1, armed: true }]);
    expect(STRATEGIES.sweepers(soon).btn).toBe(true);

    // The same bar much further away must not trigger a jump yet.
    const later = at(7.6, 0, [{ angle: -2.0, speed: 1, armed: true }]);
    expect(STRATEGIES.sweepers(later).btn).toBe(false);
  });

  it("ignores a bar that is not armed yet", () => {
    const unarmed = at(7.6, 0, [{ angle: -0.28, speed: 1, armed: false }]);
    expect(STRATEGIES.sweepers(unarmed).btn).toBe(false);
  });

  it("reads a bar sweeping the other way", () => {
    // Negative speed means it approaches from the other side: the gap is measured
    // the long way round, so the same raw angle must NOT fire.
    const other = at(7.6, 0, [{ angle: -0.28, speed: -1, armed: true }]);
    expect(STRATEGIES.sweepers(other).btn).toBe(false);
  });
});

describe("falling-floor — stand on something solid", () => {
  const GRID = 5, TILE = 2;
  const tiles = (fn) => Array.from({ length: GRID * GRID }, (_, i) => fn(i % GRID, (i / GRID) | 0));
  const at = (x, z, tileFn) => mkBot({
    game: "falling-floor",
    snapPlayers: [{ slot: 0, x, z, y: 0, alive: true }],
    floor: { grid: GRID, tile: TILE, tiles: tiles(tileFn) },
  });

  it("stays put when the tile underfoot is solid", () => {
    const o = STRATEGIES["falling-floor"](at(0, 0, () => 0));
    expect(mag(o)).toBe(0);
  });

  it("moves when the tile underfoot starts to crack", () => {
    // Everything cracking except one solid tile in the far corner.
    const o = STRATEGIES["falling-floor"](at(0, 0, (c, r) => (c === 0 && r === 0 ? 0 : 1)));
    expect(mag(o)).toBeGreaterThan(0.5);
    expect(o.ax).toBeLessThan(0);   // heads toward the corner, which is -x/-z
    expect(o.ay).toBeLessThan(0);
  });

  it("never walks onto a tile that is already gone", () => {
    // Only one tile survives; the bot must aim at it however far it is.
    const survivor = { c: GRID - 1, r: GRID - 1 };
    const o = STRATEGIES["falling-floor"](
      at(-4, -4, (c, r) => (c === survivor.c && r === survivor.r ? 0 : 2)),
    );
    expect(o.ax).toBeGreaterThan(0);
    expect(o.ay).toBeGreaterThan(0);
  });

  it("wanders rather than throwing when it has no grid yet", () => {
    const o = STRATEGIES["falling-floor"](mkBot({ game: "falling-floor" }));
    expect(Number.isFinite(o.ax)).toBe(true);
  });
});
