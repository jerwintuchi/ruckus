import { describe, expect, it } from "vitest";
import { IDLE_INPUT, type ArenaDescriptor, type Minigame, type Prim } from "./minigame.ts";
import { makeBody } from "./sim/move.ts";
import { makeRng } from "./sim/rng.ts";
import { vec } from "./sim/vec.ts";

/**
 * A minimal conformance fixture (T5). Its real job is to type-check: if the contract
 * ever grows a member, this stops compiling, which is the signal we want. The runtime
 * assertions below just prove the fixture is wired to something real.
 */
interface FixtureState {
  ticks: number;
}

const fixture: Minigame<FixtureState> = {
  id: "fixture",
  displayName: "Fixture",
  rule: "Do nothing, briefly.",
  input: "stick",
  maxDurationMs: 1000,
  init: () => ({ ticks: 0 }),
  tick: (s) => {
    s.ticks += 1;
  },
  isOver: (s) => s.ticks >= 5,
  scores: () => ({ 0: 1 }),
  snapshot: (s) => ({ ticks: s.ticks }),
  arena: (): ArenaDescriptor => ({
    camera: { eye: [0, 20, 16], look: [0, 0, 0], fov: 45 },
    solids: [],
    statics: [],
    sky: "#101018",
  }),
};

const ctx = () => ({
  dt: 1 / 20,
  elapsed: 0,
  rng: makeRng(1),
  players: [{ slot: 0, body: makeBody(vec()), alive: true, connected: true, facing: 0 }],
  input: () => IDLE_INPUT,
});

describe("Minigame contract (T5, R6)", () => {
  it("a conforming implementation runs through the shell's whole call sequence", () => {
    const s = fixture.init({ rng: makeRng(1), players: ctx().players });
    expect(fixture.isOver(s, ctx())).toBe(false);
    for (let i = 0; i < 5; i++) fixture.tick(s, ctx());
    expect(fixture.isOver(s, ctx())).toBe(true);
    expect(fixture.scores(s)).toEqual({ 0: 1 });
    expect(fixture.snapshot(s)).toEqual({ ticks: 5 });
  });

  it("declares the things the shell needs before a round can start", () => {
    expect(fixture.rule.trim().length).toBeGreaterThan(0);
    expect(fixture.rule.split(".").filter((p) => p.trim()).length).toBe(1);
    expect(["stick", "stick+button", "tap"]).toContain(fixture.input);
    expect(fixture.maxDurationMs).toBeGreaterThan(0);
  });

  it("describes a fixed camera, never a controllable one (RD-005)", () => {
    const a = fixture.arena({ ticks: 0 });
    expect(a.camera.eye).toHaveLength(3);
    expect(a.camera.look).toHaveLength(3);
    expect(a.camera.fov).toBeGreaterThan(0);
    // There is deliberately no field by which a client could move the camera.
    expect(Object.keys(a.camera).sort()).toEqual(["eye", "fov", "look"]);
  });

  it("keeps Prim a closed union — the Kit can build every member (kit-rules.md)", () => {
    const all: Prim[] = [
      { k: "box", pos: [0, 0, 0], size: [1, 1, 1], colour: "#fff" },
      { k: "cyl", pos: [0, 0, 0], r: 1, h: 2, colour: "#fff" },
      { k: "sphere", pos: [0, 0, 0], r: 1, colour: "#fff" },
      { k: "plane", pos: [0, 0, 0], size: [1, 1], colour: "#fff" },
    ];
    expect(new Set(all.map((p) => p.k)).size).toBe(all.length);
  });

  it("IDLE_INPUT is what a disconnected player contributes (I8)", () => {
    expect(IDLE_INPUT).toEqual({ axis: { x: 0, z: 0 }, btn: false });
  });
});

describe("resync is optional, and the shell must not require it (RD-052)", () => {
  it("lets a minigame omit it entirely", () => {
    // Only a round that sends deltas needs one. The fixture has none, and calling it
    // through the optional chain is a no-op rather than a crash.
    expect(fixture.resync).toBeUndefined();
    expect(() => fixture.resync?.({ ticks: 0 })).not.toThrow();
  });
});
