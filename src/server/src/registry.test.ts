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
      const state = m.init({
        rng: { next: () => 0.5, int: () => 0, range: (a) => a, shuffle: (x) => x, pick: (x) => x[0]! },
        players: [],
      });
      const arena = m.arena(state);
      expect(Object.keys(arena.camera).sort()).toEqual(["eye", "fov", "look"]);
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
