/**
 * Types for `bots.mjs`, so a TypeScript test can import the real bots (RD-102).
 *
 * Hand-written because `bots.mjs` is deliberately plain JavaScript with no build step —
 * it must run with `node tools/bots.mjs` and nothing else. This file is the one place
 * that says what a strategy IS, and `bot-contract.test.ts` type-checks against it.
 */

/** What a strategy sees: only what a `snap` message carried (netcode I1/I2). */
export interface BotView {
  slot: number;
  game: string | null;
  extra: Record<string, unknown>;
  snapPlayers: { slot: number; x: number; y: number; z: number; alive: boolean }[];
  floor: { tiles: number[]; grid: number; tile: number };
  me(): { x: number; z: number; y: number } | null;
}

/** What a strategy returns: exactly the input a human thumb can produce. */
export interface BotInput {
  ax: number;
  ay: number;
  btn: boolean;
}

export type Strategy = (bot: BotView) => BotInput;

/** Keyed by minigame id, so a registered minigame with no strategy is visible. */
export declare const STRATEGIES: Record<string, Strategy | undefined>;
export declare function toward(from: { x: number; z: number }, to: { x: number; z: number }): BotInput;
export declare function wander(bot: BotView): BotInput;
