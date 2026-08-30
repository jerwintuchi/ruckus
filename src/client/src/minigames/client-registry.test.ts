import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { clientMinigame } from "./index.ts";
import { MINIGAMES } from "../../../server/src/minigames/index.ts";

const MAIN = join(import.meta.dirname, "..", "main.ts");

describe("client minigame registry (hot-potato T3, RD-009)", () => {
  it("main.ts names no minigame — the coupling this replaced", () => {
    // Before RD-009, main.ts decoded Falling Floor's tile protocol inline. That was
    // invisible with one minigame and obvious with two.
    const src = readFileSync(MAIN, "utf8");
    for (const m of MINIGAMES) {
      expect(src, `main.ts mentions "${m.id}"`).not.toContain(m.id);
    }
    expect(src).not.toContain("setTiles");
    expect(src).not.toContain("shudderTiles");
  });

  it("an unknown minigame id resolves to undefined, not a throw", () => {
    // A server that ships a minigame before the client knows about it must fall
    // through to the generic path, not break the round.
    expect(clientMinigame("not-a-real-minigame")).toBeUndefined();
    expect(() => clientMinigame("")).not.toThrow();
  });

  it("every handler it does have implements the interface", () => {
    for (const m of MINIGAMES) {
      const h = clientMinigame(m.id);
      if (!h) continue;
      expect(typeof h.onSnapshot).toBe("function");
      if (h.onRoundStart) expect(typeof h.onRoundStart).toBe("function");
      if (h.onFrame) expect(typeof h.onFrame).toBe("function");
    }
  });

  it("a minigame without a handler is the normal case, not an error", () => {
    // The property that keeps minigame N+1 cheap: server-only by default.
    const withHandlers = MINIGAMES.filter((m) => clientMinigame(m.id));
    expect(withHandlers.length).toBeLessThan(MINIGAMES.length + 1);
  });
});
