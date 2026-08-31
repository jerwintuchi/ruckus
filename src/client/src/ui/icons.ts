/**
 * Action icons, drawn in code (action-button T5, R5).
 *
 * **No icon files and no icon dependency.** `kit_check` rejects image files on RD-001's
 * grounds, and a library would be a dependency needing its own decision — so these are
 * SVG path strings written by hand, exactly the argument that produced the procedural
 * textures (RD-020). Three paths is not a library worth installing.
 *
 * The UI maps a verb token to a path here and never learns which minigame is running
 * (RD-009): the round sends a verb, this file turns it into a shape.
 */
import type { ActionVerb } from "@ruckus/shared";

/** Paths are drawn in a 24x24 box, stroked, so they inherit the ink colour. */
export const ICON_BOX = 24;

const PATHS: Record<ActionVerb, string> = {
  // A body curling through a roll: an arc with an arrowhead coming back on itself.
  tumble: "M7 8a6 6 0 1 1-1.5 5.5 M7 8l-3 .6 M7 8l.8 3",
  // A ball leaving the hand along an arc.
  pass: "M4 17c4-8 10-11 16-11 M20 6l-4.5.4 M20 6l-.6 4.4 M6 19.5a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2",
  // Straight up, off the ground.
  jump: "M12 4v11 M7.5 8.5 12 4l4.5 4.5 M5 20h14",
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
