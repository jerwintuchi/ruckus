/**
 * The constants that only mean something in relation to each other
 * (responsiveness T1, T3, P3).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { INTERP_DELAY_MS, TICK_HZ, TICK_MS } from "./constants.ts";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..", "..");

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

describe("the tick and the buffer are one decision (R1, R2)", () => {
  it("keeps the buffer at more than two snapshots", () => {
    // Raising the tick is what made the shorter buffer safe. Changing either alone
    // breaks the trade this pair encodes (RD-036).
    expect(INTERP_DELAY_MS / TICK_MS).toBeGreaterThanOrEqual(2);
  });

  it("runs fast enough that a snapshot is not a visible step", () => {
    expect(TICK_HZ).toBeGreaterThanOrEqual(30);
    expect(TICK_MS).toBeCloseTo(1000 / TICK_HZ, 9);
  });
});

describe("nothing in the sim is measured in ticks (P3)", () => {
  it("expresses every minigame duration in milliseconds or seconds, never in ticks", () => {
    // A constant counted in ticks silently retunes every round when TICK_HZ changes:
    // "12 ticks of airtime" is 600ms at 20Hz and 400ms at 30Hz. Durations must be
    // wall-clock, and the sim converts with TICK_DT.
    const offences: string[] = [];
    for (const file of walk(join(ROOT, "server", "src", "minigames"))) {
      if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      // A constant NAMED in ticks is the smell; TICK_DT and TICK_HZ themselves are fine.
      for (const m of code.matchAll(/const\s+([A-Z0-9_]*TICKS?[A-Z0-9_]*)\s*=/g)) {
        const name = m[1]!;
        if (name === "TICK_DT" || name === "TICK_HZ" || name === "TICK_MS") continue;
        offences.push(`${file.replace(ROOT, "")}: ${name}`);
      }
    }
    expect(offences).toEqual([]);
  });
});

describe("input is sent at the rate the server can read (T3, R3)", () => {
  it("derives the send interval from TICK_MS rather than a literal", () => {
    // These drifted apart once already: a 50ms send against a 33ms tick.
    const main = readFileSync(join(ROOT, "client", "src", "main.ts"), "utf8");
    const send = main.slice(main.indexOf("net.connected && now - lastSent"));
    expect(send.slice(0, 80)).toContain("TICK_MS");
  });
});
