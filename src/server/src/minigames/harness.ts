/**
 * Shared test harness for minigames.
 *
 * `mkPlayers` was copied byte-for-byte into five test files, so a change to
 * `PlayerRuntime` meant five identical edits and five chances to let one drift. The
 * per-minigame drivers below it stay in their own files on purpose — `falling-floor`
 * wants a tile grid, `hot-potato` wants a fuse, and forcing those into one shape would
 * make every test read through an abstraction instead of reading a round.
 *
 * Not a `.test.ts` file: it is imported BY tests, and vitest would otherwise collect it
 * as a suite with no cases in it.
 */
import {
  IDLE_INPUT,
  TICK_DT,
  TICK_MS,
  makeBody,
  makeRng,
  vec,
  type InputState,
  type PlayerRuntime,
  type Rng,
  type TickCtx,
} from "@ruckus/shared";

/** `n` players at the origin, alive and connected — the state the shell hands `init`. */
export const mkPlayers = (n: number): PlayerRuntime[] =>
  Array.from({ length: n }, (_, slot) => ({
    slot,
    body: makeBody(vec()),
    alive: true,
    connected: true,
    facing: 0,
    lastAppliedSeq: 0,
    speedMul: 1,
  }));

/**
 * A round's context, advanced tick by tick the way the shell advances it.
 *
 * ONE rng for the whole round, never one per tick (RD-013). The shell used to build a
 * fresh rng each tick, which handed every tick the same sequence — a bug no test could
 * see while each test built its own context the same wrong way. Anything driving a
 * minigame should get its context from here so that discipline is stated once.
 */
export class Round {
  readonly players: PlayerRuntime[];
  readonly rng: Rng;
  elapsed = 0;

  constructor(playerCount: number, seed: number) {
    this.players = mkPlayers(playerCount);
    this.rng = makeRng(seed);
  }

  /** The context for the next tick, advancing the clock by exactly one timestep. */
  next(input: (slot: number) => InputState = () => IDLE_INPUT): TickCtx {
    this.elapsed += TICK_MS;
    return { dt: TICK_DT, elapsed: this.elapsed, rng: this.rng, players: this.players, input };
  }

  /** The context as it stands, without advancing — for `isOver` and `snapshot` calls. */
  now(input: (slot: number) => InputState = () => IDLE_INPUT): TickCtx {
    return { dt: TICK_DT, elapsed: this.elapsed, rng: this.rng, players: this.players, input };
  }
}
