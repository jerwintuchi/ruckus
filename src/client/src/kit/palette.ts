/**
 * The palette. Every colour in the game is here (kit-rules.md).
 *
 * Call sites reference names, never hex literals — that is what makes a global look
 * change a one-file edit instead of an archaeology exercise, and it is the discipline
 * that stops "just this once" from becoming a second, undocumented palette.
 */

// One definition, in shared: the server assigns, the client draws (RD-007).
export { PLAYER_COLOURS } from "@ruckus/shared";

export const PALETTE = {
  sky: "#0e1014",
  floor: "#3b4152",
  floorEdge: "#2a2f3c",
  cracking: "#c8642f",
  gone: "#14161c",
  hazard: "#e6484d",
  pickup: "#ffc51e",
  shadow: "#000000",
  text: "#f2f4f8",
  textDim: "#9aa3b2",
  panel: "#181c25",
  accent: "#2f9bff",
} as const;

export type PaletteKey = keyof typeof PALETTE;

/** Parse "#rrggbb" to a 0xRRGGBB integer, which is what three.js actually wants. */
export function hexToInt(hex: string): number {
  return Number.parseInt(hex.replace("#", ""), 16);
}
