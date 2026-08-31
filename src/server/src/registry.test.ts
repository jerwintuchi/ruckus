import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MINIGAMES, byId } from "./minigames/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const MINIGAME_DIR = join(HERE, "minigames");

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

/** Enough of an `InitCtx` to build an arena; the arena never depends on the roster. */
const stubCtx = () => ({
  rng: { next: () => 0.5, int: () => 0, range: (a: number) => a, shuffle: <T>(x: T) => x,
    pick: <T>(x: T[]) => x[0]! },
  players: [],
}) as unknown as Parameters<(typeof MINIGAMES)[number]["init"]>[0];

describe("registry contract (T11, R6)", () => {
  it("registers at least one minigame", () => {
    expect(MINIGAMES.length).toBeGreaterThan(0);
  });

  it("gives every minigame a unique id, findable by id", () => {
    const ids = MINIGAMES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(byId(id)?.id).toBe(id);
    expect(byId("does-not-exist")).toBeUndefined();
  });

  it("holds every minigame to the shell's preconditions", () => {
    for (const m of MINIGAMES) {
      expect(m.id).toMatch(/^[a-z0-9-]+$/);
      expect(m.displayName.length).toBeGreaterThan(0);
      expect(m.maxDurationMs).toBeGreaterThan(0);
      expect(["stick", "stick+button", "tap"]).toContain(m.input);

      // Vision pillar 1: the rule is the entire explanation the party gets.
      const sentences = m.rule.split(".").filter((s) => s.trim().length > 0);
      expect(sentences).toHaveLength(1);
      expect(m.rule.length).toBeLessThan(80);

      for (const fn of ["init", "tick", "isOver", "scores", "snapshot", "arena"] as const) {
        expect(typeof m[fn]).toBe("function");
      }
    }
  });

  it("keeps every arena camera fixed — no field a client could drive (RD-005)", () => {
    for (const m of MINIGAMES) {
      const arena = m.arena(m.init(stubCtx()));
      // `extent` joins the allowlist deliberately: it is a distance in metres, not a
      // camera instruction, and there is nothing in it a client could steer. The
      // allowlist stays exhaustive so the next field is a decision, not a drift.
      expect(Object.keys(arena.camera).sort()).toEqual(["extent", "eye", "fov", "look"]);
    }
  });

  it("makes every arena declare the size it needs on screen (arena-framing T1, R2)", () => {
    for (const m of MINIGAMES) {
      const { extent } = m.arena(m.init(stubCtx())).camera;
      expect(extent, m.id).toBeDefined();
      expect(Number.isFinite(extent), m.id).toBe(true);
      expect(extent, m.id).toBeGreaterThan(0);
    }
  });

  it("declares an extent that covers everything the arena puts inside it", () => {
    // The lower bound anyone can check from the descriptor alone: nothing in `solids`
    // or `statics` may sit outside the disc the arena claims. `falling-floor`'s grid is
    // in neither — it arrives via `setTiles` — so its own test covers that half, which
    // is also why this cannot be the only assertion.
    for (const m of MINIGAMES) {
      const arena = m.arena(m.init(stubCtx()));
      const [cx, , cz] = arena.camera.look;
      let needed = 0;
      const reach = (x: number, z: number): void => {
        needed = Math.max(needed, Math.hypot(x - cx, z - cz));
      };

      for (const s of arena.solids) {
        for (const x of [s.min.x, s.max.x]) for (const z of [s.min.z, s.max.z]) reach(x, z);
      }
      for (const p of arena.statics) {
        const [px, , pz] = p.pos;
        if (p.k === "cyl" || p.k === "sphere") {
          needed = Math.max(needed, Math.hypot(px - cx, pz - cz) + p.r);
          continue;
        }
        // Boxes are the walls, and a wall is a long thin slab: "centre + bounding
        // radius" assumes its worst-case rotation and demands a disc a third too big.
        // Its four corners, rotated by rotY, are exact.
        const [hw, hd] = p.k === "box"
          ? [p.size[0] / 2, p.size[2] / 2]
          : [p.size[0] / 2, p.size[1] / 2];
        // Only a box carries a rotation; a plane is always axis-aligned.
        const rot = p.k === "box" ? (p.rotY ?? 0) : 0;
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);
        for (const [ox, oz] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]] as const) {
          reach(px + ox * cos - oz * sin, pz + ox * sin + oz * cos);
        }
      }

      expect(arena.camera.extent, `${m.id} claims a disc smaller than its own geometry`)
        .toBeGreaterThanOrEqual(needed - 1e-9);
    }
  });
});

/**
 * P4 — the architectural guard.
 *
 * A minigame that reaches into the shell stops being a plugin, and the cheapness of
 * adding the next one goes with it. This is the kind of coupling that is invisible in
 * review and obvious in a module graph, so it is asserted rather than trusted.
 */
describe("minigame isolation (T11, P4)", () => {
  const FORBIDDEN = ["match.js", "match.ts", "room.js", "room.ts", "net.js", "net.ts", "loop.js", "select.js"];

  it("no minigame imports a shell module", () => {
    const offences: string[] = [];
    for (const file of walk(MINIGAME_DIR)) {
      if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
      if (resolve(file) === resolve(join(MINIGAME_DIR, "index.ts"))) continue;
      const src = readFileSync(file, "utf8");
      for (const spec of src.matchAll(/from\s+["']([^"']+)["']/g)) {
        const target = spec[1]!;
        if (FORBIDDEN.some((f) => target.endsWith(f))) {
          offences.push(`${file} imports ${target}`);
        }
      }
    }
    expect(offences).toEqual([]);
  });

  it("minigames depend only on @ruckus/shared and their own directory", () => {
    const offences: string[] = [];
    for (const file of walk(MINIGAME_DIR)) {
      if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
      if (resolve(file) === resolve(join(MINIGAME_DIR, "index.ts"))) continue;
      const src = readFileSync(file, "utf8");
      for (const spec of src.matchAll(/from\s+["']([^"']+)["']/g)) {
        const target = spec[1]!;
        const ok =
          target === "@ruckus/shared" ||
          target.startsWith("node:") ||
          (target.startsWith(".") && !target.startsWith("../../"));
        if (!ok) offences.push(`${file} imports ${target}`);
      }
    }
    expect(offences).toEqual([]);
  });
});
