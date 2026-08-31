/**
 * Action icons, as path data (action-button T5, R5; RD-047).
 *
 * **No icon files and no icon dependency.** `kit_check` rejects image files on RD-001's
 * grounds, and a package would be the project's first UI dependency — so these are SVG
 * path strings compiled into the bundle, the same argument that produced the procedural
 * textures (RD-020). What changed is where the *shapes* come from: they were hand-drawn
 * and looked it, so they are Lucide's now.
 *
 * ---
 * Icon paths adapted from Lucide (https://lucide.dev), ISC Licence:
 *
 *   Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of
 *   Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors
 *   2022.
 *
 *   Permission to use, copy, modify, and/or distribute this software for any purpose
 *   with or without fee is hereby granted, provided that the above copyright notice and
 *   this permission notice appear in all copies.
 *
 *   THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
 *   REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
 *   FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT,
 *   OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA
 *   OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
 *   ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 * ---
 *
 * The UI maps a verb token to a shape here and never learns which minigame is running
 * (RD-009): the round sends a verb, this file turns it into a picture.
 */
import type { ActionVerb } from "@ruckus/shared";

/** Lucide draws on a 24x24 grid, which is why the viewBox is 24. */
export const ICON_BOX = 24;

const PATHS: Record<ActionVerb, string> = {
  // Lucide "refresh-cw" — a closed loop with two arrowheads. Reads as "roll" at the
  // size this is drawn, and is symmetrical, which the hand-drawn one was not.
  tumble:
    "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8 M21 3v5h-5 " +
    "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16 M8 16H3v5",
  // Lucide "send" — an arrow leaving the hand. The clearest "throw" in the set.
  pass: "M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z M21.854 2.147l-10.94 10.939",
  // Lucide "arrow-big-up" — a solid, unmistakable jump at a glance.
  jump: "M9 18v-6H5l7-7 7 7h-4v6H9z",
};

/** The word a screen reader gets, and the fallback if a verb is ever unknown. */
const LABELS: Record<ActionVerb, string> = {
  tumble: "tumble",
  pass: "throw the bomb",
  jump: "jump",
};

export const iconPath = (verb: ActionVerb): string => PATHS[verb] ?? PATHS.tumble;
export const iconLabel = (verb: ActionVerb): string => LABELS[verb] ?? verb;

/** Every verb the minigames can send has a shape. Asserted, not assumed. */
export const ICON_VERBS = Object.keys(PATHS) as ActionVerb[];
