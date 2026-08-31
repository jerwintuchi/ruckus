/**
 * Arena framing (arena-framing T2, R1, P1, P2).
 *
 * The central test projects the arena's real extent disc through a real
 * `PerspectiveCamera` and asserts every point lands inside the viewport. That is
 * deliberately not a restatement of `fitDistance`'s formula: it checks the arithmetic
 * against what the renderer will actually do, so an approximation that looks right on
 * paper — a perpendicular-plane fit, say, which underestimates badly at these steep
 * camera angles — fails here rather than on someone's phone.
 */
import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import {
  FIT_MARGIN, MAX_ASPECT, MIN_ASPECT, fitCamera, fitDistance, horizontalFov,
  type ArenaCamera,
} from "./framing.ts";

/** The real cameras, as the four minigames declare them. */
const ARENAS: ArenaCamera[] = [
  { eye: [0, 26, 21], look: [0, 0, 0], fov: 45, extent: 11 * Math.SQRT2 },      // falling-floor
  { eye: [0, 24, 20], look: [0, 0, 0], fov: 45, extent: 10 * Math.SQRT2 },      // hot-potato
  { eye: [0, 27, 22], look: [0, 0, 0], fov: 45, extent: 10.5 * Math.SQRT2 },    // sweepers
  { eye: [0, 28, 23], look: [0, 0, 0], fov: 45, extent: 12 * Math.SQRT2 },      // scramble
];

/**
 * The worst normalized-device coordinate reached by the extent disc, on either axis.
 * At most 1 means the whole arena is on screen.
 */
function worstNdc(camera: ArenaCamera, aspect: number, samples = 72): number {
  const eye = fitCamera(camera, aspect)!;
  const cam = new PerspectiveCamera(camera.fov, aspect, 0.1, 500);
  cam.position.set(...eye);
  cam.lookAt(...camera.look);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();

  const [lx, ly, lz] = camera.look;
  let worst = 0;
  for (let i = 0; i < samples; i++) {
    const a = (i / samples) * Math.PI * 2;
    // The arena is a disc on the ground plane, which is where the tiles and walls are.
    const p = new Vector3(lx + Math.cos(a) * camera.extent!, ly, lz + Math.sin(a) * camera.extent!);
    p.project(cam);
    worst = Math.max(worst, Math.abs(p.x), Math.abs(p.y));
  }
  return worst;
}

describe("the whole arena fits, at every aspect a phone can produce (P1)", () => {
  it("keeps the extent on screen across [0.4, 2.4], for every real arena", () => {
    // 200 aspects across the range, because the failure is a continuum: three
    // hand-picked viewport sizes are exactly how the fixed fov shipped.
    const STEPS = 200;
    for (const arena of ARENAS) {
      for (let i = 0; i <= STEPS; i++) {
        const aspect = MIN_ASPECT + ((MAX_ASPECT - MIN_ASPECT) * i) / STEPS;
        const worst = worstNdc(arena, aspect);
        expect(worst, `aspect ${aspect.toFixed(3)}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("frames it snugly, rather than retreating into orbit", () => {
    // A fit that simply flew the camera far enough away would pass the test above and
    // make the game unreadable. The arena must still fill a real share of the screen.
    for (const arena of ARENAS) {
      for (const aspect of [0.46, 1, 1.78, 2.4]) {
        expect(worstNdc(arena, aspect), `aspect ${aspect}`).toBeGreaterThan(0.3);
      }
    }
  });

  it("fails the way the old framing did, if the extent is ignored", () => {
    // The regression, pinned: the authored camera at a portrait aspect puts the arena
    // well outside the viewport. This is the phone screenshot that opened the spec.
    const arena = ARENAS[0]!;
    const cam = new PerspectiveCamera(arena.fov, 0.46, 0.1, 500);
    cam.position.set(...arena.eye);
    cam.lookAt(...arena.look);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    const corner = new Vector3(arena.extent!, 0, 0).project(cam);
    expect(Math.abs(corner.x)).toBeGreaterThan(1);
  });
});

describe("the binding axis is whichever one is tighter (R1)", () => {
  it("is horizontal on a tall screen and vertical on a wide one", () => {
    const extent = 15;
    const fov = 45;
    const vertical = extent / Math.sin((fov * Math.PI) / 360);
    const horizontalAt = (a: number): number => extent / Math.sin(horizontalFov(fov, a) / 2);

    // Portrait: the horizontal field is the narrow one and decides the distance.
    expect(fitDistance(extent, 0.5, fov)).toBeCloseTo(horizontalAt(0.5) * FIT_MARGIN, 9);
    expect(horizontalAt(0.5)).toBeGreaterThan(vertical);

    // Landscape: the vertical field is the narrow one.
    expect(fitDistance(extent, 2, fov)).toBeCloseTo(vertical * FIT_MARGIN, 9);
    expect(horizontalAt(2)).toBeLessThan(vertical);

    // Square: they meet.
    expect(fitDistance(extent, 1, fov)).toBeCloseTo(vertical * FIT_MARGIN, 9);
  });

  it("pulls further back the narrower the screen gets", () => {
    let previous = Infinity;
    for (const aspect of [0.4, 0.6, 0.8, 1]) {
      const d = fitDistance(12, aspect, 45);
      expect(d).toBeLessThan(previous);
      previous = d;
    }
  });
});

describe("fitCamera keeps the author's angle and changes only the distance (P2)", () => {
  it("moves the eye along its own view direction, never off it", () => {
    for (const arena of ARENAS) {
      const eye = fitCamera(arena, 0.5)!;
      const dir = (e: readonly number[]): number[] => {
        const d = [e[0]! - arena.look[0], e[1]! - arena.look[1], e[2]! - arena.look[2]];
        const len = Math.hypot(...d);
        return d.map((c) => c / len);
      };
      const before = dir(arena.eye);
      const after = dir(eye);
      for (let i = 0; i < 3; i++) expect(after[i]!).toBeCloseTo(before[i]!, 9);
    }
  });

  it("is a pure function of its arguments", () => {
    const arena = ARENAS[2]!;
    expect(fitCamera(arena, 1.7)).toEqual(fitCamera(arena, 1.7));
    // And it does not mutate what it is handed.
    const snapshot = JSON.stringify(arena);
    fitCamera(arena, 0.6);
    expect(JSON.stringify(arena)).toBe(snapshot);
  });

  it("leaves an arena that declares no extent exactly where its author put it", () => {
    const authored: ArenaCamera = { eye: [0, 26, 21], look: [0, 0, 0], fov: 45 };
    expect(fitCamera(authored, 0.5)).toBeNull();
    expect(fitCamera({ ...authored, extent: 0 }, 0.5)).toBeNull();
    expect(fitCamera({ ...authored, extent: Number.NaN }, 0.5)).toBeNull();
  });

  it("declines an eye that sits on its own look point, naming no direction", () => {
    expect(fitCamera({ eye: [3, 3, 3], look: [3, 3, 3], fov: 45, extent: 10 }, 1)).toBeNull();
  });
});

describe("degenerate input stays finite (R3)", () => {
  it("survives every aspect a browser can report mid-relayout", () => {
    for (const aspect of [0, -1, 1e-9, 1e9, Number.NaN, Number.POSITIVE_INFINITY]) {
      const d = fitDistance(12, aspect, 45);
      expect(Number.isFinite(d), `aspect ${aspect}`).toBe(true);
      expect(d, `aspect ${aspect}`).toBeGreaterThan(0);
    }
  });

  it("survives an absurd field of view", () => {
    for (const fov of [1, 179, 0, 360, Number.NaN]) {
      expect(Number.isFinite(fitDistance(12, 1, fov)), `fov ${fov}`).toBe(true);
    }
  });

  it("returns zero distance for an arena with no size", () => {
    expect(fitDistance(0, 1, 45)).toBe(0);
    expect(fitDistance(-5, 1, 45)).toBe(0);
  });
});
