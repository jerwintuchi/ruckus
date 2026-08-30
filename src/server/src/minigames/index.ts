/**
 * The minigame registry — the ONLY shell file a new minigame touches (R6, P4).
 *
 * If adding a round ever requires editing `match.ts`, the contract is missing
 * something; fix the contract, not the caller. Hot Potato was added by appending one
 * line here and nothing else, which is the property this file exists to protect.
 */
import type { Minigame } from "@ruckus/shared";
import { fallingFloor } from "./falling-floor/index.ts";
import { hotPotato } from "./hot-potato/index.ts";

export const MINIGAMES: readonly Minigame<never>[] = [
  fallingFloor as Minigame<never>,
  hotPotato as Minigame<never>,
];

export function byId(id: string): Minigame<never> | undefined {
  return MINIGAMES.find((m) => m.id === id);
}
