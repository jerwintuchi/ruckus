/**
 * Player colours.
 *
 * These live in shared because both halves need the same eight: the server assigns a
 * colour on join, the client draws it. They were briefly duplicated in each half with
 * a test asserting the copies matched — one definition is better than two and a test.
 *
 * Chosen by search against a hard constraint (RD-007): every pair must stay distinct
 * under normal vision AND deuteranopia AND protanopia, at CIE76 deltaE > 25. The
 * first hand-picked set failed — its blue and violet simulated to deltaE 1.1 under
 * deuteranopia, i.e. the same colour, in a game whose whole identity system is
 * "which colour am I".
 *
 * The set spreads across LIGHTNESS as much as hue, because a dichromat's usable space
 * is roughly lightness plus a blue-yellow axis. Two of the eight are deliberately
 * dark; brightening them uniformly for a more "party" look re-breaks the constraint,
 * and `palette.test.ts` will say so.
 */
export const PLAYER_COLOURS = [
  "#1ab0ff", // blue
  "#ff3f18", // red-orange
  "#ffef14", // yellow
  "#69f982", // mint
  "#b013b0", // magenta
  "#875e35", // brown
  "#08865a", // forest
  "#870909", // maroon
] as const;
