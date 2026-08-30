/**
 * Fixed-timestep loop (R8, P8).
 *
 * Two things this must get right. First, the simulation only ever sees the fixed
 * `TICK_DT`, so a round is reproducible from its seed and inputs regardless of how
 * the host machine was scheduled. Second, the accumulator is *capped*: after a stall
 * (a laptop lid, a GC pause, a suspended tab on a debug client) a naive loop tries to
 * catch up on every missed tick at once, which takes longer than the stall and makes
 * the next frame worse. That is the spiral of death; MAX_CATCHUP_STEPS is the guard.
 */
import { MAX_CATCHUP_STEPS, TICK_MS } from "@ruckus/shared";

export class FixedLoop {
  private acc = 0;

  /**
   * Feed real elapsed milliseconds; get back how many fixed steps to run.
   * Time beyond the catch-up cap is *discarded*, not banked — banking it would just
   * move the spiral one frame later.
   */
  advance(elapsedMs: number): number {
    this.acc += elapsedMs;
    let steps = 0;
    while (this.acc >= TICK_MS && steps < MAX_CATCHUP_STEPS) {
      this.acc -= TICK_MS;
      steps++;
    }
    if (this.acc > TICK_MS * MAX_CATCHUP_STEPS) this.acc = 0;
    return steps;
  }

  reset(): void {
    this.acc = 0;
  }
}
