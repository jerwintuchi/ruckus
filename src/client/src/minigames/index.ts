/**
 * Client-side minigame handlers (hot-potato T3, RD-009).
 *
 * Most minigames need nothing here: they publish `prims` in their snapshot and the
 * generic renderer draws them. A handler exists only for a minigame whose snapshot
 * needs decoding the generic path cannot express — currently just Falling Floor,
 * whose 121-tile grid is sent as a delta because sending it as prims every tick
 * would be a hundred times the bytes for the same picture.
 *
 * `main.ts` knows no minigame by name; it looks one up here and falls through to the
 * generic path when there is none. That fall-through is the property that keeps
 * adding a minigame a server-only job.
 */
import type { Renderer } from "../render.ts";

export interface ClientMinigame {
  /** Called on every snapshot for this minigame, before the generic prims pass. */
  onSnapshot(renderer: Renderer, extra: Record<string, unknown>): void;
  /** Called once when the round starts, before any snapshot. */
  onRoundStart?(renderer: Renderer): void;
  /** Called every frame, for procedural motion the snapshot does not carry. */
  onFrame?(renderer: Renderer, t: number): void;
}

const fallingFloor: ClientMinigame = {
  onSnapshot(renderer, extra) {
    const full = extra.full as number[] | undefined;
    const grid = extra.grid as number | undefined;
    const tile = extra.tile as number | undefined;
    if (full && grid && tile) {
      renderer.setTiles(full, grid, tile);
      return;
    }
    const changed = extra.changed as [number, number][] | undefined;
    if (changed) for (const [i, state] of changed) renderer.setTile(i, state);
  },
  onFrame(renderer, t) {
    renderer.shudderTiles(t);
  },
};

const HANDLERS: Record<string, ClientMinigame> = {
  "falling-floor": fallingFloor,
};

export function clientMinigame(id: string): ClientMinigame | undefined {
  return HANDLERS[id];
}
