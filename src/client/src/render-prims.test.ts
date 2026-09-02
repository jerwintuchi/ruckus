import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Prim } from "@ruckus/shared";
import { PAPER_VARIANTS, buildPrim } from "./render.ts";
import { textureCount } from "./kit/textures.ts";
import { GEO, blobShadow, materialCount, shadowMat } from "./kit/prims.ts";

const ALL: Prim[] = [
  { k: "box", pos: [1, 2, 3], size: [2, 3, 4], colour: "#112233" },
  { k: "cyl", pos: [-1, 0, 2], r: 0.7, h: 3, colour: "#445566" },
  { k: "sphere", pos: [0, 5, 0], r: 1.25, colour: "#778899" },
  { k: "plane", pos: [0, 0, 0], size: [8, 6], colour: "#aabbcc" },
];

describe("generic prims channel (hot-potato T2, R8)", () => {
  it("builds a mesh for every kind in the closed union", () => {
    for (const p of ALL) {
      const m = buildPrim(p);
      expect(m, p.k).toBeTruthy();
      expect(m.geometry, p.k).toBeTruthy();
      expect(m.material, p.k).toBeTruthy();
    }
  });

  it("places each mesh where the descriptor says", () => {
    for (const p of ALL) {
      const m = buildPrim(p);
      expect([m.position.x, m.position.y, m.position.z], p.k).toEqual(p.pos);
    }
  });

  it("reuses the Kit's cached geometries rather than allocating per prim", () => {
    // The mobile budget lives or dies on this: a minigame publishing prims every
    // tick at 20 Hz must not allocate geometry 20 times a second.
    const shared = new Set<object>(Object.values(GEO));
    for (const p of ALL) expect(shared.has(buildPrim(p).geometry)).toBe(true);
  });

  it("reuses cached materials, so repeated prims cost nothing new", () => {
    // Warm the cache, then assert a thousand more of the same colour add none.
    for (const p of ALL) buildPrim(p);
    const before = materialCount();
    for (let i = 0; i < 1000; i++) for (const p of ALL) buildPrim(p);
    expect(materialCount()).toBe(before);
  });

  it("scales from the unit geometries, so size is in the transform not the mesh", () => {
    const b = buildPrim({ k: "box", pos: [0, 0, 0], size: [2, 3, 4], colour: "#fff" });
    expect([b.scale.x, b.scale.y, b.scale.z]).toEqual([2, 3, 4]);

    const s = buildPrim({ k: "sphere", pos: [0, 0, 0], r: 1.5, colour: "#fff" });
    expect(s.scale.x).toBeCloseTo(3, 10); // unit sphere has radius 0.5
  });

  it("gives a distinct colour its own material, so prims are not silently merged", () => {
    const a = buildPrim({ k: "box", pos: [0, 0, 0], size: [1, 1, 1], colour: "#010203" });
    const b = buildPrim({ k: "box", pos: [0, 0, 0], size: [1, 1, 1], colour: "#040506" });
    expect(a.material).not.toBe(b.material);
  });

  it("draws a plane as a thin box, so it takes the light like every other slab", () => {
    // A PlaneGeometry is single-sided and unlit from behind; an arena floor is a slab.
    const m = buildPrim({ k: "plane", pos: [0, 0, 0], size: [10, 6], colour: "#fff" });
    expect(m.scale.x).toBe(10);
    expect(m.scale.z).toBe(6);
    expect(m.scale.y).toBeLessThan(1);
  });

  it("does not grow the caches with box SIZE (RD-062)", () => {
    // The sharing tests above vary colour and count. This varies SIZE, which is what
    // was actually unbounded: the paper seed was derived from the box's largest
    // dimension, so every distinct size minted its own 12 KiB DataTexture and its own
    // material, from a cache nothing clears. A round with a growing platform would
    // have allocated one per frame, on the render path, which kit-rules.md forbids.
    const texturesBefore = textureCount();
    const seen = new Set<unknown>();
    for (let i = 0; i < 400; i++) {
      const side = 2 + i * 0.0149; // continuous, across the whole fibre band
      seen.add(buildPrim({
        k: "box", pos: [0, 0, 0], size: [side, 1, side], colour: "#8a63d2",
      }).material);
    }
    expect(seen.size).toBeLessThanOrEqual(PAPER_VARIANTS);
    expect(textureCount() - texturesBefore).toBeLessThanOrEqual(PAPER_VARIANTS);
  });
});

describe("rotY on prims (sweepers T2, R8)", () => {
  it("rotates a box about the vertical axis", () => {
    const m = buildPrim({ k: "box", pos: [0, 0, 0], size: [8, 1, 1], colour: "#fff", rotY: 1.2 });
    expect(m.rotation.y).toBeCloseTo(1.2, 10);
  });

  it("rotates a cylinder too", () => {
    const m = buildPrim({ k: "cyl", pos: [0, 0, 0], r: 1, h: 2, colour: "#fff", rotY: -0.4 });
    expect(m.rotation.y).toBeCloseTo(-0.4, 10);
  });

  it("leaves a prim without rotY unrotated — nothing that existed before changes", () => {
    const m = buildPrim({ k: "box", pos: [0, 0, 0], size: [1, 1, 1], colour: "#fff" });
    expect(m.rotation.y).toBe(0);
    const s = buildPrim({ k: "sphere", pos: [0, 0, 0], r: 1, colour: "#fff" });
    expect(s.rotation.y).toBe(0);
  });

  it("still reuses the cached geometry — rotation lives in the transform", () => {
    const m = buildPrim({ k: "box", pos: [0, 0, 0], size: [8, 1, 1], colour: "#fff", rotY: 2 });
    expect(m.geometry).toBe(GEO.box);
  });
});

describe("a round's world leaves with the round", () => {
  // The lobby used to keep the last round's arena, tiles and pickups, with the camera
  // still parked wherever that round's fit had put it — so a fresh lobby showed a
  // leftover pickup floating in an empty sky. The Renderer needs a WebGL context, so
  // this is asserted against the source, the same way the no-fullscreen-pass claim is.
  const SRC = join(dirname(new URL(import.meta.url).pathname), "render.ts");
  const MAIN = join(dirname(new URL(import.meta.url).pathname), "main.ts");
  const src = readFileSync(SRC, "utf8");
  const main = readFileSync(MAIN, "utf8");

  const body = (source: string, signature: string): string => {
    const start = source.indexOf(signature);
    expect(start, signature).toBeGreaterThan(-1);
    return source.slice(start, source.indexOf("\n  }", start));
  };

  it("empties every collection a round can fill", () => {
    const clear = body(src, "clearWorld(): void {");
    for (const collection of ["clearPlayers", "statics.clear", "prims.clear", "tileMeshes"]) {
      expect(clear, collection).toContain(collection);
    }
    // And forgets the arena camera, so a stale fit cannot survive into the next round.
    expect(clear).toContain("arenaCamera = null");
  });

  it("is what the lobby calls, not clearPlayers alone", () => {
    const lobby = main.slice(main.indexOf('if (msg.state === "LOBBY")'));
    const branch = lobby.slice(0, lobby.indexOf("\n      }"));
    expect(branch).toContain("clearWorld");
    expect(branch).toContain("clearHud");
  });
});

describe("nothing survives ROUND_START (round-lifecycle T4, R4)", () => {
  // The class of bug this whole spec exists for: state from a previous round, or from
  // a round you were not in, arriving in the current one.
  const main = readFileSync(
    join(dirname(new URL(import.meta.url).pathname), "main.ts"), "utf8");
  const roundStart = main.slice(main.indexOf('case "roundStart"'), main.indexOf("break;", main.indexOf('case "roundStart"')));

  it("replaces the arena, the tiles, the prims and the characters", () => {
    // `clearWorld` rather than `clearPlayers`: the players were only part of what a
    // previous round left behind (RD-050).
    for (const call of ["setArena", "clearWorld", "setPrims"]) {
      expect(roundStart, call).toContain(call);
    }
  });

  it("replaces the controls, so a previous round's verb is not left on the button", () => {
    expect(roundStart).toContain("controls.show");
  });

  it("clears the banner, so an intro or a scoreboard does not sit over the round", () => {
    expect(roundStart).toContain("hideBanner");
  });
});

describe("a round boundary empties everything that holds round state (RD-050)", () => {
  const main = readFileSync(
    join(dirname(new URL(import.meta.url).pathname), "main.ts"), "utf8");
  const between = (from: string, to: string): string =>
    main.slice(main.indexOf(from), main.indexOf(to, main.indexOf(from)));

  it("clears the whole world at roundStart, not only the players", () => {
    // setArena clears `statics`, but the tile grid lives in `dynamics` — so
    // falling-floor's floor used to survive into the next minigame.
    const roundStart = between('case "roundStart"', "break;");
    expect(roundStart).toContain("clearWorld");
    expect(roundStart).toContain("buffer.clear");
  });

  it("clears them at the end of a match too", () => {
    // Otherwise the last round's bodies stand behind the result card until someone
    // happens to walk back to the lobby.
    const matchEnd = between('case "matchEnd"', "break;");
    expect(matchEnd).toContain("clearWorld");
    expect(matchEnd).toContain("buffer.clear");
  });

  it("clears them on returning to the lobby", () => {
    const lobby = between('if (msg.state === "LOBBY")', "} else if");
    expect(lobby).toContain("clearWorld");
    expect(lobby).toContain("buffer.clear");
  });
});

describe("exactly one character is marked as yours (find-yourself T2, R1, R3)", () => {
  // `Renderer` cannot be constructed here: its constructor makes a WebGLRenderer and
  // there is no GL context in Node. The behaviour that matters — built once, idempotent,
  // dies with the character — is covered in `character.test.ts` against a real
  // Character. What is left is WHERE the call sits, and that is a source claim, made
  // honestly rather than dressed up as a behavioural one.
  const src = readFileSync(join(dirname(new URL(import.meta.url).pathname), "render.ts"), "utf8");

  it("marks only where a character is BUILT, never per frame", () => {
    // Called in the per-frame path it would be a caret per frame, which is eight
    // hundred a round.
    const sync = src.slice(src.indexOf("syncPlayers("), src.indexOf("clearWorld"));
    const build = sync.slice(sync.indexOf("if (!c) {"), sync.indexOf("this.dynamics.add"));
    expect(build).toContain("setMine(colour)");
    expect((sync.match(/setMine\(/g) ?? [])).toHaveLength(1);
  });

  it("marks nobody for a spectator, or before welcome", () => {
    // -1 is the slot of a mid-round joiner with no character, and of every client
    // before `welcome` arrives (the spectating R4 shape).
    const sync = src.slice(src.indexOf("syncPlayers("), src.indexOf("clearWorld"));
    expect(sync).toContain("p.slot === mine && mine >= 0");
    expect(sync).toContain("mine = -1");
  });

  it("gives the caret the player's own colour, not the accent fallback", () => {
    // So the caret, the lobby dot and the character are one colour by construction.
    const sync = src.slice(src.indexOf("syncPlayers("), src.indexOf("clearWorld"));
    expect(sync).toContain("const colour = colours.get(p.slot) ?? PALETTE.accent");
    expect(sync).toContain("new Character(colour, p.slot)");
  });
});

describe("a shadow fade shares, it does not mutate (RD-089)", () => {
  it("hands the same material to two shadows asking for the same opacity", () => {
    // Sharing is the point — the cost guard asserts nothing is per-instance.
    expect(blobShadow(0.45, 0.34).material).toBe(blobShadow(0.45, 0.34).material);
  });

  it("hands a DIFFERENT material for a different opacity", () => {
    // Which is what makes fading possible without writing to a shared object.
    expect(shadowMat(0.34)).not.toBe(shadowMat(0.17));
  });

  it("quantizes, so a continuous fade cannot grow the cache without bound", () => {
    const before = materialCount();
    for (let k = 0; k < 500; k++) shadowMat(0.34 * (k / 500));
    // A hundredth of opacity per entry: at most ~35 for this range, not 500.
    expect(materialCount() - before).toBeLessThan(40);
  });

  it("Character.update asks for a material rather than writing to one", () => {
    // The actual bug: eight characters mutated one shared object every frame, so all
    // eight shadows landed on whatever the last one drawn wanted — one player's jump
    // faded everybody's shadow.
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "kit/character.ts"), "utf8");
    expect(src).toContain("this.shadow.material = shadowMat(");
    expect(src).not.toMatch(/shadow\.material as \{ opacity/);
  });
});
