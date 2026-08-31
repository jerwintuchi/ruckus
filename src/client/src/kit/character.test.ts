import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { Mesh, MeshBasicMaterial, type Material } from "three";
import { PLAYER_COLOURS } from "@ruckus/shared";
import { BODY, Character, MESHES_PER_CHARACTER, OUT_BLINK_S, blinkVisible } from "./character.ts";
import { EDGE_FACES, FRONT_FACE, SLAB_DEPTH, materialForFace } from "./paper.ts";
import { PAPER } from "./palette.ts";

const SRC_DIR = dirname(new URL(import.meta.url).pathname);
const INK = Number.parseInt(PAPER.ink.slice(1), 16);
const meshes = (c: Character): Mesh[] => {
  const out: Mesh[] = [];
  c.root.traverse((o) => { if ((o as Mesh).isMesh) out.push(o as Mesh); });
  return out;
};
const colourOf = (m: Material): number => (m as unknown as { color: { getHex(): number } }).color.getHex();

describe("a player is cut from paper (T10, R7)", () => {
  it("is built entirely from slabs, plus its shadow", () => {
    const c = new Character(PLAYER_COLOURS[0]!, 0);
    const parts = meshes(c);
    expect(parts).toHaveLength(MESHES_PER_CHARACTER);
    // Six slabs — head, torso, two arms, two legs — and one shadow.
    const slabs = parts.filter((m) => Array.isArray(m.material));
    expect(slabs).toHaveLength(6);
  });

  it("gives every slab ink edges, so the whole figure is outlined for free", () => {
    const c = new Character(PLAYER_COLOURS[3]!, 3);
    for (const m of meshes(c)) {
      if (!Array.isArray(m.material)) continue;
      // By face, not by array index: identical neighbouring faces share a group, so
      // the materials array is indexed by group once they coalesce (RD-028).
      for (const i of EDGE_FACES) expect(colourOf(materialForFace(m, i)!)).toBe(INK);
    }
  });

  it("makes every part the same depth — one sheet of paper", () => {
    const c = new Character(PLAYER_COLOURS[1]!, 1);
    for (const m of meshes(c)) {
      if (!Array.isArray(m.material)) continue;
      expect(m.scale.z).toBeCloseTo(SLAB_DEPTH, 9);
    }
  });

  it("shares one geometry and one material set across a whole lobby", () => {
    // Eight characters must not mean eight copies of anything.
    const crowd = PLAYER_COLOURS.map((c, slot) => new Character(c, slot));
    const geometries = new Set<unknown>();
    for (const c of crowd) for (const m of meshes(c)) geometries.add(m.geometry);
    // Two slab layouts — a plain slab, and the head whose front differs from its back
    // — plus one shadow circle. Still nothing allocated per character (RD-028).
    expect(geometries.size).toBeLessThanOrEqual(3);
  });

  it("keeps the footprint and height the capsule had, so no collision moves", () => {
    expect(BODY.height).toBeGreaterThan(1.7);
    expect(BODY.height).toBeLessThan(1.95);
    // Widest part must stay inside the collision radius the server simulates.
    expect(BODY.torsoW / 2 + BODY.armW).toBeLessThanOrEqual(0.45);
  });

  it("stays within the per-character mesh budget for 8 on screen (T12)", () => {
    expect(MESHES_PER_CHARACTER).toBeLessThanOrEqual(8);
    expect(MESHES_PER_CHARACTER * 8).toBeLessThanOrEqual(64);
  });
});

describe("it is never a billboard (T10, R7)", () => {
  it("does not face the camera — that would remove the depth cue", () => {
    // A camera-facing quad is the more authentic Paper Mario read and would make
    // "am I in front of or behind that bar?" guesswork, in a game about timing a
    // jump over one. This was a gameplay decision, not an art one (RD-021).
    //
    // Comments are stripped before the check: the explanation above legitimately uses
    // the words the CODE must not, and weakening the assertion to accommodate prose
    // would be the wrong way round.
    const src = readFileSync(join(SRC_DIR, "character.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const forbidden of ["lookAt", "Sprite", "quaternion", "camera"]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
  });

  it("yaws to the direction of travel, and nothing else drives its rotation", () => {
    const c = new Character(PLAYER_COLOURS[0]!, 0);
    c.update(0, 0, 0, 1.2, 0);
    const pivot = c.root.children[0]!;
    expect(pivot.rotation.y).toBeCloseTo(1.2, 6);
  });
});

describe("the face lands on the head (T10, R8)", () => {
  it("puts a texture on the head's front face and nowhere else", () => {
    const c = new Character(PLAYER_COLOURS[2]!, 2);
    const textured = meshes(c).filter(
      (m) => Array.isArray(m.material) &&
        (materialForFace(m, FRONT_FACE) as MeshBasicMaterial | undefined)?.map,
    );
    expect(textured).toHaveLength(1);
    const head = textured[0]!;
    // The head is the topmost part.
    const heights = meshes(c).map((m) => m.position.y);
    expect(head.position.y).toBe(Math.max(...heights));
  });

  it("gives different slots different faces", () => {
    const a = new Character("#ffffff", 0);
    const b = new Character("#ffffff", 1);
    const mapOf = (c: Character) => {
      const head = meshes(c).find(
        (m) => Array.isArray(m.material) &&
          (materialForFace(m, FRONT_FACE) as MeshBasicMaterial | undefined)?.map,
      );
      return (materialForFace(head!, FRONT_FACE) as MeshBasicMaterial).map;
    };
    expect(mapOf(a)).not.toBe(mapOf(b));
  });
});

describe("limbs hinge, and the pose is only ever a function of its inputs (T11)", () => {
  const angles = (c: Character): number[] =>
    c.root.children[0]!.children.map((o) => o.rotation.x);

  it("swings legs and arms in counter-phase", () => {
    const c = new Character(PLAYER_COLOURS[0]!, 0);
    c.update(0, 5, 0, 0, 0.12);
    const pivot = c.root.children[0]!;
    const [, , armL, armR, legL, legR] = pivot.children;
    expect(Math.sign(legL!.rotation.x)).toBe(-Math.sign(legR!.rotation.x));
    expect(Math.sign(armL!.rotation.x)).toBe(-Math.sign(armR!.rotation.x));
    // Arms oppose legs, which is what makes a walk read as a walk.
    expect(Math.sign(armL!.rotation.x)).toBe(-Math.sign(legL!.rotation.x));
  });

  it("stands still at rest", () => {
    const c = new Character(PLAYER_COLOURS[0]!, 0);
    c.update(0, 0, 0, 0, 3.7);
    for (const a of angles(c)) expect(a).toBeCloseTo(0, 6);
  });

  it("poses differently in the air than on the ground", () => {
    const ground = new Character(PLAYER_COLOURS[0]!, 0);
    const air = new Character(PLAYER_COLOURS[0]!, 0);
    ground.update(0, 5, 0, 0, 0.3);
    air.update(1.2, 5, -4, 0, 0.3);
    expect(angles(air)).not.toEqual(angles(ground));
  });

  it("shows the ink edge on a turn — the paper flip", () => {
    const straight = new Character(PLAYER_COLOURS[0]!, 0);
    const turning = new Character(PLAYER_COLOURS[0]!, 0);
    straight.update(0, 5, 0, 0, 0.2, 0);
    turning.update(0, 5, 0, 0, 0.2, 1);
    expect(Math.abs(turning.root.children[0]!.rotation.y))
      .toBeGreaterThan(Math.abs(straight.root.children[0]!.rotation.y));
  });

  it("is finite for every extreme input", () => {
    const c = new Character(PLAYER_COLOURS[0]!, 0);
    for (const args of [
      [0, 1e9, 0, 0, 1e9, 0], [-50, -5, 1e6, -99, -3, 5], [1e6, 0, -1e6, 0, 0, -1],
    ] as const) {
      c.update(...(args as unknown as [number, number, number, number, number, number]));
      const pivot = c.root.children[0]!;
      for (const v of [pivot.position.y, pivot.rotation.x, pivot.rotation.y, pivot.scale.y]) {
        expect(Number.isFinite(v)).toBe(true);
      }
      for (const a of angles(c)) expect(Number.isFinite(a)).toBe(true);
    }
  });
});

describe("going out is an event, not a state (round-lifecycle T3, R3, P3, P4)", () => {
  // This has been wrong both ways. It first hid the character instantly under a comment
  // claiming the opposite, so Hot Potato's arena silently emptied (RD-048). Then it
  // greyed them and left them standing, which read as a player stuck rather than out
  // (RD-049). It blinks and leaves now.
  it("is visible the moment it happens, so the elimination is seen", () => {
    const c = new Character(PLAYER_COLOURS[0]!, 0);
    c.update(0, 0, 0, 0, 10);
    c.setEliminated();
    c.update(0, 0, 0, 0, 10);
    expect(c.root.visible).toBe(true);
  });

  it("flickers across the window and is gone after it", () => {
    const c = new Character(PLAYER_COLOURS[0]!, 0);
    c.update(0, 0, 0, 0, 10);
    c.setEliminated();

    const seen = new Set<boolean>();
    for (let dt = 0; dt < OUT_BLINK_S; dt += OUT_BLINK_S / 32) {
      c.update(0, 0, 0, 0, 10 + dt);
      seen.add(c.root.visible);
    }
    expect(seen.has(true) && seen.has(false), "it actually flickers").toBe(true);

    c.update(0, 0, 0, 0, 10 + OUT_BLINK_S + 0.01);
    expect(c.root.visible, "and then leaves").toBe(false);
  });

  it("blinks as a pure function of elapsed time", () => {
    expect(blinkVisible(0)).toBe(true);
    expect(blinkVisible(OUT_BLINK_S)).toBe(false);
    expect(blinkVisible(OUT_BLINK_S * 10)).toBe(false);
    expect(blinkVisible(0.1)).toBe(blinkVisible(0.1));
  });

  it("cannot be undone by the per-frame visibility call", () => {
    // syncPlayers calls setVisible(true) every frame; it must not resurrect a body.
    const c = new Character(PLAYER_COLOURS[1]!, 1);
    c.update(0, 0, 0, 0, 5);
    c.setEliminated();
    c.update(0, 0, 0, 0, 5 + OUT_BLINK_S + 0.01);
    c.setVisible(true);
    expect(c.root.visible).toBe(false);
  });

  it("is never out when freshly built, so it cannot outlive its round (P4)", () => {
    // Characters are rebuilt at ROUND_START, which is what makes elimination
    // round-scoped by construction rather than by remembering to clear it.
    const c = new Character(PLAYER_COLOURS[2]!, 2);
    c.update(0, 4, 0, 0, 0.3);
    expect(c.root.visible).toBe(true);
    const pivot = c.root.children[0]!;
    expect(Math.abs(pivot.children[4]!.rotation.x), "and it animates").toBeGreaterThan(0);
  });
});
