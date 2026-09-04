/**
 * The palette. Every colour in the game is here (kit-rules.md).
 *
 * Call sites reference names, never hex literals — that is what makes a global look
 * change a one-file edit instead of an archaeology exercise, and it is the discipline
 * that stops "just this once" from becoming a second, undocumented palette.
 */

// One definition, in shared: the server assigns, the client draws (RD-007).
export { PLAYER_COLOURS } from "@ruckus/shared";

/**
 * Paper stock (RD-021).
 *
 * Added alongside the existing arena tokens rather than replacing them: the 3D world
 * is still Lambert-lit and dark until visual-direction Phases B and C land, and
 * swapping its ground out from under it now would leave the game half-converted. The
 * interface can go first because it is a separate surface.
 */
export const PAPER = {
  /** Every outline and every drawn line. A printed black, warm, never pure. */
  ink: "#1b1a17",
  /** Panel faces — warm stock. */
  card: "#fdf8ee",
  /** The ground a card sits on. */
  ground: "#cfe4f2",
  /** One shade down, for a second plane. */
  cardDim: "#efe4cd",
  /** Text on stock. */
  text: "#1b1a17",
  textDim: "#6e6754",
  /** The one bright accent that is not a player's colour. */
  highlight: "#ffd23f",
} as const;

/**
 * The arena, retargeted to paper stock (visual-direction T4, RD-021).
 *
 * Held back until Phases B and C converted the world — a bright paper sky over a
 * Lambert-lit dungeon would have been worse than either look on its own. Now that
 * characters are unlit slabs and surfaces carry fibre, the ground can follow.
 */
export const PALETTE = {
  sky: "#cfe4f2",
  floor: "#f2e9d6",
  floorEdge: "#d9caa9",
  cracking: "#e08b3c",
  gone: "#b9a888",
  /* The urgency ramp: plenty of time -> none. Four named stops, not a hue sweep. */
  ok: "#3fae6d",
  warn: "#ffd23f",
  caution: "#e08b3c",
  hazard: "#e6484d",
  pickup: "#ffd23f",
  shadow: "#000000",
  text: "#1b1a17",
  textDim: "#6e6754",
  panel: "#fdf8ee",
  accent: "#0a7fc4",
} as const;

export type PaletteKey = keyof typeof PALETTE;

/**
 * How much time is left, as a colour (round-countdown R3, round-status R1).
 *
 * A pure function of the FRACTION remaining, not of seconds, so a three-second count and
 * a ninety-second round go red at the same *felt* point and one idea is expressed once.
 *
 * Stepped rather than interpolated on purpose: four named palette colours read as four
 * states in peripheral vision, where a smooth sweep reads as one colour that is slowly
 * wrong. It also keeps the palette closed — no colour is synthesised at a call site
 * (kit-rules).
 *
 * Total by construction: anything outside [0,1], and anything that is not a number at
 * all, clamps rather than returning undefined.
 */
/**
 * The starting light (round-countdown R3, RD-113).
 *
 * **Red, amber, green — in that order, ending on green.** Deliberately the OPPOSITE of
 * `statusColour`, and the reason is worth stating because the inversion looks like a bug
 * until you say it: this is not time running out, it is a race about to start. Green must
 * be last, because green means GO. A count that turned red on "1" would be telling a
 * player to stop at the instant they are meant to move.
 *
 * Anything outside the three counted seconds gets the last light, so a longer count would
 * hold on green rather than fall off the end.
 */
export function countColour(n: number): string {
  if (n >= 3) return PALETTE.hazard;
  if (n === 2) return PALETTE.warn;
  return PALETTE.ok;
}

export function statusColour(fraction: number): string {
  const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  if (f > 0.5) return PALETTE.ok;
  if (f > 0.25) return PALETTE.warn;
  if (f > 0.1) return PALETTE.caution;
  return PALETTE.hazard;
}

/** Parse "#rrggbb" to a 0xRRGGBB integer, which is what three.js actually wants. */
export function hexToInt(hex: string): number {
  return Number.parseInt(hex.replace("#", ""), 16);
}

/**
 * Your colour, on the controls (ui-identity R5, P7).
 *
 * The eight player colours were chosen for distinctness against an arena and for two
 * common colour-blindness types. They were NOT chosen as a surface behind a label, and
 * it shows: an ink label on raw maroon is 1.72:1, and `forest` fails against ink AND
 * against paper, so no automatic light-or-dark choice rescues it. Hence a tint for
 * anything carrying text, and a luminance-picked glyph for anything that does not
 * (RD-070). The palette itself is untouched — retuning eight colours for a role they
 * were never chosen for would cost the role they were.
 */

/** How far a text button's fill is mixed toward paper. Worst case then reads 4.90:1. */
export const TINT_FOR_LABEL = 0.45;

const channels = (hex: string): [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

const hex = (c: readonly number[]): string =>
  "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

/** WCAG relative luminance. The real formula, so the tests measure rather than compare. */
export function luminance(colour: string): number {
  const lin = channels(colour).map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

/** WCAG contrast ratio between two colours, 1..21. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Mix a colour toward the paper stock. `t` of 1 is paper. */
export function tint(colour: string, t = TINT_FOR_LABEL): string {
  const [a, b] = [channels(colour), channels(PAPER.card)];
  return hex(a.map((v, i) => v * (1 - t) + b[i]! * t));
}

/** Ink or paper, whichever can actually be read on this colour. */
export function readableInk(colour: string): string {
  return contrast(colour, PAPER.ink) >= contrast(colour, PAPER.card)
    ? PAPER.ink
    : PAPER.card;
}

