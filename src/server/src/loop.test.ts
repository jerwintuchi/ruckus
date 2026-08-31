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
