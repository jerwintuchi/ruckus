/**
 * The frame budget, measured (visual-direction T18, R13).
 *
 * R13 assumed unlit fill and geometry outlines would make the paper build cheaper than
 * the Lambert one. Half of that turned out to be true and half of it did not, and this
 * file is where the halves are pinned so neither can drift back (RD-028):
 *
 * - triangles collapsed, because a slab is 12 and a capsule is hundreds
 * - draw calls **rose**, because the renderer bills per geometry group and a slab has
 *   more groups than a capsule has meshes
 *
 * These are static costs — work handed to the driver, countable with no GPU. The
 * millisecond question is a phone question, and `bench.ts` is what asks it there.
 */
import { describe, expect, it } from "vitest";
import { Group, Mesh, MeshLambertMaterial, CapsuleGeometry, SphereGeometry, BoxGeometry } from "three";
import { PLAYER_COLOURS } from "@ruckus/shared";
import { Character, MESHES_PER_CHARACTER } from "./character.ts";
import { costOf, formatCost } from "./cost.ts";
import { disposePaper } from "./paper.ts";

/** Eight players, the full lobby the budget is written against. */
const lobby = (): Group => {
  const g = new Group();
  PLAYER_COLOURS.forEach((c, slot) => g.add(new Character(c, slot).root));
  return g;
};

/**
 * The build this one replaced: capsule body, sphere head, two box hands, blob shadow,
 * one Lambert material each. Reconstructed here rather than measured from git, because
 * a "before" you cannot re-run is a number nobody can check.
 */
const lambertCharacter = (): Group => {
  const g = new Group();
  const m = new MeshLambertMaterial();
  g.add(new Mesh(new CapsuleGeometry(0.35, 0.8, 4, 12), m));
  g.add(new Mesh(new SphereGeometry(0.3, 12, 10), m));
  g.add(new Mesh(new BoxGeometry(0.18, 0.18, 0.18), m));
  g.add(new Mesh(new BoxGeometry(0.18, 0.18, 0.18), m));
  g.add(new Mesh(new BoxGeometry(0.9, 0.01, 0.9), m));
  return g;
};

const lambertLobby = (): Group => {
  const g = new Group();
  for (let i = 0; i < 8; i++) g.add(lambertCharacter());
  return g;
};

describe("the cost model counts what the renderer counts", () => {
  it("bills a multi-material mesh per group, not per mesh", () => {
    const geo = new BoxGeometry(1, 1, 1); // six groups as shipped
    const mesh = new Mesh(geo, [0, 1, 2, 3, 4, 5].map(() => new MeshLambertMaterial()));
    const c = costOf(mesh);
    expect(c.meshes).toBe(1);
    expect(c.drawCalls).toBe(6);
    expect(c.triangles).toBe(12);
  });

  it("skips what the renderer would cull, including a hidden ancestor", () => {
    const root = new Group();
    const branch = new Group();
    branch.add(new Mesh(new BoxGeometry(), new MeshLambertMaterial()));
    root.add(branch);
    expect(costOf(root).drawCalls).toBe(1);
    branch.visible = false;
    expect(costOf(root).drawCalls).toBe(0);
  });

  it("counts distinct geometries and materials, not references to them", () => {
    const shared = new BoxGeometry();
    const m = new MeshLambertMaterial();
    const g = new Group();
    for (let i = 0; i < 5; i++) g.add(new Mesh(shared, m));
    const c = costOf(g);
    expect(c.meshes).toBe(5);
    expect(c.geometries).toBe(1);
    expect(c.materials).toBe(1);
  });
});

describe("eight players on screen, measured (T18, R13)", () => {
  it("shares geometry and materials across the whole lobby", () => {
    disposePaper();
    const c = costOf(lobby());
    expect(c.meshes).toBe(MESHES_PER_CHARACTER * 8);
    // Two slab layouts, one shadow circle. Eight players are not eight copies.
    expect(c.geometries).toBeLessThanOrEqual(3);
    // Eight player colours, ink, eight faces, one shadow — and nothing per-instance.
    expect(c.materials).toBeLessThanOrEqual(20);
  });

  it("collapses triangles against the Lambert build it replaced", () => {
    // The half of R13 that held: a slab is 12 triangles, a capsule is hundreds.
    const before = costOf(lambertLobby()).triangles;
    const after = costOf(lobby()).triangles;
    expect(after).toBeLessThan(before / 4);
  });

  it("keeps draw calls inside the budget a mid-range phone can hold", () => {
    // The half of R13 that did NOT hold. Before: 40 draws for eight characters. After
    // the paper rebuild: 296, because six materials on a slab are six groups. Merging
    // the runs of identical ink brought it to 112 with an identical picture (RD-028).
    //
    // 112 is still nearly 3x the Lambert build, and that is the honest position: the
    // outline is free per fragment and is NOT free per draw. The ceiling below is what
    // leaves room for an arena underneath on a mid-range phone; if a change pushes
    // through it, that is a decision to take, not a number to raise.
    const c = costOf(lobby());
    expect(c.drawCalls, formatCost(c)).toBeLessThanOrEqual(120);
  });

  it("costs the same per player however many are on screen", () => {
    // No hidden per-lobby cost: eight players are exactly eight times one.
    disposePaper();
    const one = costOf(new Character(PLAYER_COLOURS[0]!, 0).root);
    const eight = costOf(lobby());
    expect(eight.drawCalls).toBe(one.drawCalls * 8);
  });

  it("keeps drawing an eliminated player, and stays inside the budget anyway", () => {
    // This assertion is reversed. Eliminated players used to be hidden, so the draw
    // count FELL as a round went on — and the arena emptied, which is what a playtester
    // reported as "the bots are invisible" (RD-048). They stay drawn now, greyed, so
    // losing is watchable (vision pillar 3).
    //
    // The honest cost: the peak is unchanged, but it is now sustained for the whole
    // round rather than decaying. The budget was always written against 8 live players,
    // so the ceiling still holds — but the average is higher than RD-028 measured.
    const c = new Character(PLAYER_COLOURS[0]!, 0);
    const live = costOf(c.root).drawCalls;
    c.setEliminated();
    expect(costOf(c.root).drawCalls, "still on screen, still drawn").toBe(live);

    disposePaper();
    const all = costOf(lobby());
    for (const ch of PLAYER_COLOURS.map((col, slot) => new Character(col, slot))) {
      ch.setEliminated();
    }
    expect(all.drawCalls, formatCost(all)).toBeLessThanOrEqual(120);
  });

  it("adds no new material for the whole crowd going out at once", () => {
    // One shared "out" colour, not one per player: eight eliminations must not be
    // eight new materials on a phone.
    disposePaper();
    const crowd = PLAYER_COLOURS.map((c, slot) => new Character(c, slot));
    const group = new Group();
    for (const c of crowd) group.add(c.root);
    const before = costOf(group).materials;
    for (const c of crowd) c.setEliminated();
    expect(costOf(group).materials).toBeLessThanOrEqual(before + 1);
  });
});
