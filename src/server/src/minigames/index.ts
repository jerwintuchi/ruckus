/**
 * The minigame registry — the ONLY shell file a new minigame touches (R6, P4).
 *
 * If adding a round ever requires editing `match.ts`, the contract is missing
 * something; fix the contract, not the caller.
 */
import type { Minigame } from "@ruckus/shared";
import { fallingFloor } from "./falling-floor/index.ts";

export const MINIGAMES: readonly Minigame<never>[] = [
  fallingFloor as Minigame<never>,
];

export function byId(id: string): Minigame<never> | undefined {
  return MINIGAMES.find((m) => m.id === id);
}
