/**
 * Framing the arena for the screen it is actually on (arena-framing T2, R1).
 *
 * **The bug this exists to fix.** Every arena declares `fov: 45`, and in Three.js that
 * is the *vertical* field of view. The horizontal extent is therefore
 * `2·atan(tan(fov/2) · aspect)` — a consequence of the viewport, not a decision anyone
 * made. On a portrait phone at aspect 0.46 that works out to about 21° across, which is
 * how a 24 m arena arrived on a phone as one enormous character.
 *
 * **What is fitted: the arena, not a ball around it.** An arena is a flat disc on the
 * ground with a few metres of headroom for characters and walls. The first version of
 * this file fitted the bounding *sphere* — correct at any camera angle, easy to prove,
 * and far too conservative: a sphere of radius 17 m reaches 17 m straight up into empty
 * sky, and the camera retreats to fit all of that nothing. On a short landscape phone
 * that left the arena filling about half the height with sky either side (RD-032).
 *
 * So the fit is numeric: back the camera off until the arena's own silhouette — its rim
 * at ground level and at `ARENA_HEADROOM` — projects inside the viewport, and no
 * further. A closed form for a tilted disc under perspective is a quartic; a bisection
 * over distance is a dozen lines, provably monotone, and runs on resize only.
 *
 * Pure and DOM-free: this is arithmetic, and it should not need a canvas to assert.
 */

/** 6% air, so the outermost tile is not flush against the edge of the screen. */
export const FIT_MARGIN = 1.06;

/**
 * Metres above the ground that must stay on screen: a 1.8 m character plus the top of
 * a jump, which is the tallest thing that ever reaches the arena's rim. Sweepers is a
 * game about jumping, and a jump that leaves the frame is a jump you cannot judge.
 */
export const ARENA_HEADROOM = 3;

/** A tall phone in portrait. */
export const MIN_ASPECT = 0.4;
/** A phone in landscape with the browser's chrome showing. */
export const MAX_ASPECT = 3.2;

/** Points sampled around the rim. Enough that the worst point is never missed. */
const RIM_SAMPLES = 48;
/** Bisection steps: 40 halvings takes the bracket below a micrometre. */
const SEARCH_STEPS = 40;

/**
 * Aspect ratios outside this are a browser mid-relayout, not a screen. Clamping keeps
 * the distance finite: as aspect approaches zero the horizontal field does too, and an
 * unclamped fit would ask the camera to retreat to infinity.
 */
const ASPECT_FLOOR = 0.05;
const ASPECT_CEIL = 20;

/** The fallback when a number arrives unusable — a bad descriptor must not blank the screen. */
const DEFAULT_FOV = 45;

/** NaN-safe: `Math.min(hi, Math.max(lo, NaN))` is NaN, which would poison the fit. */
const clamp = (v: number, lo: number, hi: number, fallback: number): number =>
  Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

/** Vertical fov (degrees) and an aspect to the horizontal fov, in radians. */
export function horizontalFov(fovDeg: number, aspect: number): number {
  return 2 * Math.atan(Math.tan((fovDeg * Math.PI) / 360) * aspect);
}

export interface ArenaCamera {
  eye: [number, number, number];
  look: [number, number, number];
  fov: number;
  extent?: number;
}

type Vec3 = [number, number, number];

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const norm = (a: Vec3): Vec3 => {
  const len = Math.hypot(...a);
  return len === 0 ? [0, 0, 1] : scale(a, 1 / len);
};

/**
 * The arena's silhouette: its rim at ground level and at head height.
 *
 * The rim is what leaves the frame first — the centre never does — so sampling the two
 * circles that bound the playable volume is enough, and far cheaper than a mesh.
 */
function rimPoints(look: Vec3, extent: number): Vec3[] {
  const points: Vec3[] = [];
  for (let i = 0; i < RIM_SAMPLES; i++) {
    const a = (i / RIM_SAMPLES) * Math.PI * 2;
    const x = look[0] + Math.cos(a) * extent;
    const z = look[2] + Math.sin(a) * extent;
    points.push([x, look[1], z]);
    points.push([x, look[1] + ARENA_HEADROOM, z]);
  }
  return points;
}

/**
 * Does every point project inside the viewport, with the eye this far back?
 *
 * Monotone in `distance` — every point's angular size shrinks as the camera retreats —
 * which is what makes a bisection valid rather than a guess.
 */
function allVisible(
  points: readonly Vec3[],
  look: Vec3,
  dir: Vec3,
  distance: number,
  tanH: number,
  tanV: number,
): boolean {
  const eye: Vec3 = [
    look[0] + dir[0] * distance,
    look[1] + dir[1] * distance,
    look[2] + dir[2] * distance,
  ];
  // Camera basis: forward toward `look`, right and up from the world up vector.
  const forward = norm(sub(look, eye));
  const worldUp: Vec3 = Math.abs(forward[1]) > 0.999 ? [0, 0, 1] : [0, 1, 0];
  const right = norm(cross(forward, worldUp));
  const up = cross(right, forward);

  for (const p of points) {
    const v = sub(p, eye);
    const depth = dot(v, forward);
    if (depth <= 0) return false; // behind the camera: no distance fits this point
    if (Math.abs(dot(v, right)) > depth * tanH) return false;
    if (Math.abs(dot(v, up)) > depth * tanV) return false;
  }
  return true;
}

/**
 * Where to put the eye so the whole arena is on screen.
 *
 * The author's `eye` still chooses the *angle* the arena is viewed from — only the
 * distance along that direction is recomputed. A minigame that declares no extent is
 * left exactly where its author put it (R2).
 *
 * Returns `null` when there is nothing to do, so the caller can tell "no extent
 * declared" from "fitted, and it happened to be where it already was".
 */
export function fitCamera(camera: ArenaCamera, aspect: number): Vec3 | null {
  const { extent } = camera;
  if (extent === undefined || !Number.isFinite(extent) || extent <= 0) return null;

  const look = camera.look as Vec3;
  const offset = sub(camera.eye as Vec3, look);
  // An eye sitting on its own look point names no direction to back away along.
  if (Math.hypot(...offset) === 0) return null;
  const dir = norm(offset);

  const a = clamp(aspect > 0 ? aspect : 1, ASPECT_FLOOR, ASPECT_CEIL, 1);
  const fovV = clamp(camera.fov, 1, 179, DEFAULT_FOV);
  const tanV = Math.tan((fovV * Math.PI) / 360);
  const tanH = Math.tan(horizontalFov(fovV, a) / 2);

  const points = rimPoints(look, extent);

  // The bounding-sphere distance always fits, whatever the angle, so it is a guaranteed
  // upper bracket for the search — the conservative answer, kept as a bound rather than
  // used as the result.
  let hi = (extent + ARENA_HEADROOM) / Math.min(Math.sin((fovV * Math.PI) / 360),
    Math.sin(horizontalFov(fovV, a) / 2));
  let lo = 0;
  // Guard the bracket: if even `hi` does not fit (an absurd fov), do not search below it.
  if (!allVisible(points, look, dir, hi, tanH, tanV)) hi *= 2;

  for (let i = 0; i < SEARCH_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (allVisible(points, look, dir, mid, tanH, tanV)) hi = mid;
    else lo = mid;
  }

  const distance = hi * FIT_MARGIN;
  return [
    look[0] + dir[0] * distance,
    look[1] + dir[1] * distance,
    look[2] + dir[2] * distance,
  ];
}

/** The fitted distance from `look`, for tests and for the debug readout. */
export function fitDistance(camera: ArenaCamera, aspect: number): number {
  const eye = fitCamera(camera, aspect);
  return eye === null ? 0 : Math.hypot(...sub(eye, camera.look as Vec3));
}
