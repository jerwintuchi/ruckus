/**
 * Framing the arena for the screen it is actually on (arena-framing T2, R1).
 *
 * **The bug this exists to fix.** Every arena declares `fov: 45`, and in Three.js that
 * is the *vertical* field of view. The horizontal extent is therefore
 * `2·atan(tan(fov/2) · aspect)` — a consequence of the viewport, not a decision anyone
 * made. On a portrait phone at aspect 0.46 that works out to about 21° across, which is
 * how a 24 m arena arrived on a phone as one enormous character. `resize()` updated
 * `camera.aspect` correctly and never re-framed, so the arena fitted the desktop it was
 * authored on and nothing else.
 *
 * **What is fitted.** The arena declares a radius (`ArenaDescriptor.camera.extent`) and
 * this fits the *sphere* of that radius, not the flat disc. The camera looks down at a
 * steep angle, so the near edge of a flat disc is far closer to the eye than its centre
 * and projects much larger — a formula that assumes the extent lies perpendicular to
 * the view direction underestimates, and by a lot at these angles. A sphere bound is
 * independent of the viewing angle, is provably a superset of the disc, and costs a few
 * metres of extra air. The property test projects the real disc through a real camera,
 * so a return to the perpendicular formula fails it.
 *
 * Pure and DOM-free: this is arithmetic, and it should not need a canvas to assert.
 */

/** 8% air, so the outermost tile is not flush against the edge of the screen. */
export const FIT_MARGIN = 1.08;

/** A tall phone in portrait. */
export const MIN_ASPECT = 0.4;
/** A phone in landscape with the browser's chrome showing. */
export const MAX_ASPECT = 2.4;

/**
 * Aspect ratios outside this are a browser mid-relayout, not a screen. Clamping keeps
 * the distance finite: as aspect approaches zero the horizontal field does too, and an
 * unclamped fit would ask the camera to retreat to infinity.
 */
const ASPECT_FLOOR = 0.05;
const ASPECT_CEIL = 20;

/**
 * The fallback when a number arrives unusable. A broken descriptor should cost a
 * badly-framed round, never a black screen — nothing here is allowed to stall play.
 */
const DEFAULT_FOV = 45;

/** NaN-safe: `Math.min(hi, Math.max(lo, NaN))` is NaN, which would poison the fit. */
const clamp = (v: number, lo: number, hi: number, fallback: number): number =>
  Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

/** Vertical fov (degrees) and an aspect to the horizontal fov, in radians. */
export function horizontalFov(fovDeg: number, aspect: number): number {
  return 2 * Math.atan(Math.tan((fovDeg * Math.PI) / 360) * aspect);
}

/**
 * How far the eye must sit from `look` for a sphere of `extent` to fit both axes.
 *
 * `d = r / sin(θ)` is the standard bounding-sphere fit for a half-angle θ. Taking the
 * max over both axes is the entire point of this function: on a tall screen the
 * horizontal field is the binding constraint and on a wide one the vertical is, and the
 * fixed `fov: 45` accounted for neither.
 */
export function fitDistance(extent: number, aspect: number, fovDeg: number): number {
  if (!Number.isFinite(extent) || extent <= 0) return 0;
  const a = clamp(aspect > 0 ? aspect : 1, ASPECT_FLOOR, ASPECT_CEIL, 1);
  const fovV = clamp(fovDeg, 1, 179, DEFAULT_FOV);

  const halfV = (fovV * Math.PI) / 360;
  const halfH = horizontalFov(fovV, a) / 2;

  return Math.max(extent / Math.sin(halfV), extent / Math.sin(halfH)) * FIT_MARGIN;
}

export interface ArenaCamera {
  eye: [number, number, number];
  look: [number, number, number];
  fov: number;
  extent?: number;
}

/**
 * Where to put the eye so the whole arena is on screen.
 *
 * The author's `eye` still chooses the *angle* the arena is viewed from — only the
 * distance along that direction is recomputed. A minigame that declares no extent is
 * left exactly where its author put it (R2), so this can land before every arena has
 * one and change nothing for those that have not.
 *
 * Returns `null` when there is nothing to do, so the caller can tell "no extent
 * declared" from "fitted, and it happened to be where it already was".
 */
export function fitCamera(camera: ArenaCamera, aspect: number): [number, number, number] | null {
  const { extent } = camera;
  if (extent === undefined || !Number.isFinite(extent) || extent <= 0) return null;

  const [ex, ey, ez] = camera.eye;
  const [lx, ly, lz] = camera.look;
  const dx = ex - lx;
  const dy = ey - ly;
  const dz = ez - lz;
  const len = Math.hypot(dx, dy, dz);
  // An eye sitting on its own look point names no direction to back away along; there
  // is no framing that fixes that, so leave the author's camera alone and say so.
  if (len === 0) return null;

  const d = fitDistance(extent, aspect, camera.fov);
  return [lx + (dx / len) * d, ly + (dy / len) * d, lz + (dz / len) * d];
}
