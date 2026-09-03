import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MAX_CATCHUP_STEPS, TICK_HZ, TICK_MS } from "@ruckus/shared";
import { FixedLoop } from "./loop.ts";

describe("FixedLoop (T10, R8, P8)", () => {
  it("runs exactly TICK_HZ steps per simulated second when fed evenly", () => {
    const loop = new FixedLoop();
    let steps = 0;
    for (let i = 0; i < TICK_HZ; i++) steps += loop.advance(TICK_MS);
    expect(steps).toBe(TICK_HZ);
  });

  it("caps catch-up after a stall — no spiral of death (P8)", () => {
    const loop = new FixedLoop();
    expect(loop.advance(1000)).toBe(MAX_CATCHUP_STEPS);
  });

  it("does not bank the discarded time into the next frame", () => {
    const loop = new FixedLoop();
    loop.advance(10_000); // a very long stall
    // The next ordinary frame must behave ordinarily, not unleash a backlog.
    expect(loop.advance(TICK_MS)).toBe(1);
  });

  it("accumulates sub-tick frames instead of dropping them", () => {
    const loop = new FixedLoop();
    let steps = 0;
    // Ten sub-tick frames: no single one is a whole tick, but together they are.
    for (let i = 0; i < 10; i++) steps += loop.advance(TICK_MS / 10);
    // TICK_MS is 33.333… at 30Hz, so ten tenths can accumulate a hair under one tick
    // in floating point. Nudge past the boundary rather than asserting that ten
    // divisions of an irrational number sum exactly.
    steps += loop.advance(1e-6);
    expect(steps).toBe(1);
  });

  it("reset clears the accumulator", () => {
    const loop = new FixedLoop();
    loop.advance(TICK_MS * 0.9);
    loop.reset();
    expect(loop.advance(TICK_MS * 0.9)).toBe(0);
  });
});

describe("a clock that jumps cannot stop the simulation (RD-098)", () => {
  // The root cause of a multi-day freeze hunt. A WSL2 guest clock resyncs with its host
  // — measured here at ~5.14s roughly every 65s. Fed to a fixed-timestep accumulator,
  // a BACKWARD jump drives `acc` negative and no tick runs until real time repays the
  // debt: a five-second freeze for every client at once, with no packet lost and
  // nothing on the wire for any network probe to find.
  it("ignores a backward step instead of banking it", () => {
    const loop = new FixedLoop();
    expect(loop.advance(-5000)).toBe(0);
    // The very next ordinary frame must still produce a tick. Before the guard, this
    // returned 0 for the next ~5000ms of real time.
    let steps = 0;
    for (let i = 0; i < 3; i++) steps += loop.advance(TICK_MS);
    expect(steps).toBeGreaterThan(0);
  });

  it("measures the freeze the unguarded version caused", () => {
    // Kept as a regression: the number is the point.
    const loop = new FixedLoop();
    loop.advance(-5000);
    let ms = 0;
    for (let i = 0; i < 400 && loop.advance(TICK_MS) === 0; i++) ms += TICK_MS;
    expect(ms).toBeLessThan(TICK_MS * 2);
  });

  it("ignores zero and NaN as well, since neither is elapsed time", () => {
    const loop = new FixedLoop();
    expect(loop.advance(0)).toBe(0);
    expect(loop.advance(Number.NaN)).toBe(0);
    // NaN must not have poisoned the accumulator.
    expect(loop.advance(TICK_MS * 2)).toBeGreaterThan(0);
  });

  it("still catches up on a forward jump, capped", () => {
    const loop = new FixedLoop();
    expect(loop.advance(5000)).toBe(MAX_CATCHUP_STEPS);
  });

  it("the server drives it from a monotonic clock, never the wall clock", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "net.ts"), "utf8");
    const pump = src.slice(src.indexOf("private pump()"), src.indexOf("private pump()") + 200);
    expect(pump).toContain("performance.now()");
    expect(pump).not.toContain("Date.now()");
  });
});
