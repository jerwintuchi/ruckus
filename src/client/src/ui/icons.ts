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
  // A closed loop with an arrowhead: a roll. Drawn heavy and simple, because it is read
  // at arm's length on a phone rather than in a toolbar.
  tumble: "M18 12a6 6 0 1 1-3.2-5.3 M15.4 3.4l-.6 3.6 3.6.6",
  // A ball on a rising arc.
  pass: "M3 18c5-9 12-12 18-12 M6.5 19.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4",
  // Straight up, off the ground.
  jump: "M12 3.5v10 M7.5 8 12 3.5 16.5 8 M4 20.5h16",
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
