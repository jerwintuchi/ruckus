/**
 * Arena framing (arena-framing T2, T3, R1, P1, P2).
 *
 * The central test projects the arena's real silhouette through a real
 * `PerspectiveCamera` and asserts every point lands inside the viewport — checked
 * against what the renderer will actually do, not against the fit's own arithmetic.
 *
 * It also asserts the fit is **snug**, which is the half that was missing. The first
 * version passed "it all fits" while framing the arena at about half the height of a
 * landscape phone, because the snugness threshold was 0.3 — loose enough to accept
 * almost anything. A camera that retreats far enough always fits; the test has to say
 * how close it must come (RD-032).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import {
  ARENA_HEADROOM, MAX_ASPECT, MIN_ASPECT, fitCamera, fitDistance, horizontalFov,
  type ArenaCamera,
} from "./framing.ts";

/** The real cameras, as the four minigames declare them. `extent` is a half-WIDTH. */
const ARENAS: ArenaCamera[] = [
  { eye: [0, 26, 21], look: [0, 0, 0], fov: 45, extent: 11 },     // falling-floor
  { eye: [0, 24, 20], look: [0, 0, 0], fov: 45, extent: 10 },     // hot-potato
  { eye: [0, 27, 22], look: [0, 0, 0], fov: 45, extent: 10.5 },   // sweepers
  { eye: [0, 28, 23], look: [0, 0, 0], fov: 45, extent: 12 },     // scramble
];

/**
 * Every point the fit promises to keep on screen: the square footprint's edges, at
 * ground and head height. Sampled independently of the implementation's own sampling,
 * and more densely, so a fit that only checked corners would fail here.
 */
function silhouette(camera: ArenaCamera, perEdge = 40): Vector3[] {
  const [lx, ly, lz] = camera.look;
  const h = camera.extent!;
  const out: Vector3[] = [];
  for (let i = 0; i <= perEdge; i++) {
    const t = -h + (2 * h * i) / perEdge;
    for (const [dx, dz] of [[t, -h], [t, h], [-h, t], [h, t]] as const) {
      out.push(new Vector3(lx + dx, ly, lz + dz), new Vector3(lx + dx, ly + ARENA_HEADROOM, lz + dz));
    }
  }
  return out;
}

/**
 * The worst normalized-device coordinate the arena reaches, on either axis.
 * At most 1 means it is all on screen; near 1 means the frame is not wasted.
 */
function worstNdc(camera: ArenaCamera, aspect: number): number {
  const eye = fitCamera(camera, aspect)!;
  const cam = new PerspectiveCamera(camera.fov, aspect, 0.1, 500);
  cam.position.set(...eye);
  cam.lookAt(...camera.look);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();

  let worst = 0;
  for (const p of silhouette(camera)) {
    const ndc = p.clone().project(cam);
    worst = Math.max(worst, Math.abs(ndc.x), Math.abs(ndc.y));
  }
  return worst;
}

describe("the whole arena fits, at every aspect a phone can produce (P1)", () => {
  it("keeps the arena on screen across the whole range, for every real arena", () => {
    // 200 aspects across the range, because the failure is a continuum: three
    // hand-picked viewport sizes are exactly how the fixed fov shipped.
    const STEPS = 200;
    for (const arena of ARENAS) {
      for (let i = 0; i <= STEPS; i++) {
        const aspect = MIN_ASPECT + ((MAX_ASPECT - MIN_ASPECT) * i) / STEPS;
        expect(worstNdc(arena, aspect), `aspect ${aspect.toFixed(3)}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("covers the aspects real phones actually report", () => {
    // 2.99 came off an iPhone in landscape with Safari's chrome showing, and it was
    // outside the range this file first declared. The range is measured now, not guessed.
    expect(MAX_ASPECT).toBeGreaterThanOrEqual(2.99);
    expect(MIN_ASPECT).toBeLessThanOrEqual(0.46); // the same phone in portrait
  });

  it("fills the frame it is given, rather than retreating into orbit", () => {
    // The assertion that was missing. A fit that flies far enough away passes "it all
    // fits" and leaves the arena unreadable — which is exactly what a bounding SPHERE
    // did: it reserved `extent` metres of empty sky above a flat arena.
    for (const arena of ARENAS) {
      for (const aspect of [0.46, 1, 1.78, 2.4, 2.99]) {
        expect(worstNdc(arena, aspect), `aspect ${aspect}`).toBeGreaterThan(0.85);
      }
    }
  });

  it("is much tighter than fitting the circle that circumscribes the arena", () => {
    // The square is what the arena occupies; the circle around it reaches the
    // half-diagonal, 41% further along every axis. Fitting that circle is what left the
    // characters too small to read on a phone (RD-033).
    const scramble = ARENAS[3]!;
    const circumscribed: ArenaCamera = { ...scramble, extent: scramble.extent! * Math.SQRT2 };
    expect(fitDistance(scramble, 2.17)).toBeLessThan(fitDistance(circumscribed, 2.17) * 0.8);
  });

  it("fails the way the old framing did, if the extent is ignored", () => {
    // The original regression, pinned: the authored camera at a portrait aspect puts
    // the arena well outside the viewport.
    const arena = ARENAS[0]!;
    const cam = new PerspectiveCamera(arena.fov, 0.46, 0.1, 500);
    cam.position.set(...arena.eye);
    cam.lookAt(...arena.look);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    expect(Math.abs(new Vector3(arena.extent!, 0, 0).project(cam).x)).toBeGreaterThan(1);
  });
});

describe("headroom is part of what must be visible (R1)", () => {
  it("keeps a jumping character at the rim on screen", () => {
    // Sweepers is a game about timing a jump; a jump that leaves the frame cannot be
    // judged. Fitting the ground disc alone would clip exactly this.
    expect(ARENA_HEADROOM).toBeGreaterThanOrEqual(3);
    const sweepers = ARENAS[2]!;
    const eye = fitCamera(sweepers, 2.99)!;
    const cam = new PerspectiveCamera(sweepers.fov, 2.99, 0.1, 500);
    cam.position.set(...eye);
    cam.lookAt(...sweepers.look);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    // The nearest corner of the footprint, at the top of a jump.
    const head = new Vector3(sweepers.extent!, ARENA_HEADROOM, sweepers.extent!).project(cam);
    expect(Math.abs(head.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(head.x)).toBeLessThanOrEqual(1);
  });
});

describe("the binding axis is whichever one is tighter (R1)", () => {
  it("pulls further back the narrower the screen gets", () => {
    let previous = Infinity;
    for (const aspect of [0.4, 0.6, 0.8, 1]) {
      const d = fitDistance(ARENAS[0]!, aspect);
      expect(d, `aspect ${aspect}`).toBeLessThan(previous);
      previous = d;
    }
  });

  it("pulls back again as the screen gets extremely wide and short", () => {
    // Wide and short binds vertically, and a phone in landscape with chrome is short.
    expect(fitDistance(ARENAS[0]!, 3.2)).toBeGreaterThanOrEqual(fitDistance(ARENAS[0]!, 1.78));
  });

  it("derives a horizontal field that widens with the aspect", () => {
    expect(horizontalFov(45, 1)).toBeCloseTo((45 * Math.PI) / 180, 9);
    expect(horizontalFov(45, 2)).toBeGreaterThan(horizontalFov(45, 1));
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
      for (let i = 0; i < 3; i++) expect(after[i]!).toBeCloseTo(before[i]!, 6);
    }
  });

  it("is a pure function of its arguments", () => {
    const arena = ARENAS[2]!;
    expect(fitCamera(arena, 1.7)).toEqual(fitCamera(arena, 1.7));
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

  it("frames an arena that is not at the world origin", () => {
    const offset: ArenaCamera = { eye: [10, 26, 31], look: [10, 0, 10], fov: 45, extent: 15 };
    expect(worstNdc(offset, 1.78)).toBeLessThanOrEqual(1);
    expect(worstNdc(offset, 1.78)).toBeGreaterThan(0.85);
  });
});

describe("degenerate input stays finite (R3)", () => {
  const arena = ARENAS[0]!;

  it("survives every aspect a browser can report mid-relayout", () => {
    for (const aspect of [0, -1, 1e-9, 1e9, Number.NaN, Number.POSITIVE_INFINITY]) {
      const d = fitDistance(arena, aspect);
      expect(Number.isFinite(d), `aspect ${aspect}`).toBe(true);
      expect(d, `aspect ${aspect}`).toBeGreaterThan(0);
    }
  });

  it("survives an absurd field of view", () => {
    for (const fov of [1, 179, 0, 360, Number.NaN]) {
      const d = fitDistance({ ...arena, fov }, 1);
      expect(Number.isFinite(d), `fov ${fov}`).toBe(true);
      expect(d, `fov ${fov}`).toBeGreaterThan(0);
    }
  });

  it("returns no fit for an arena with no size", () => {
    expect(fitDistance({ ...arena, extent: 0 }, 1)).toBe(0);
    expect(fitDistance({ ...arena, extent: -5 }, 1)).toBe(0);
  });
});

describe("the renderer fits on resize, never per frame (T3, P3)", () => {
  const src = readFileSync(join(dirname(new URL(import.meta.url).pathname), "..", "render.ts"), "utf8");

  const body = (signature: string): string => {
    const start = src.indexOf(signature);
    expect(start, signature).toBeGreaterThan(-1);
    return src.slice(start, src.indexOf("\n  }", start));
  };

  it("re-fits when the viewport changes shape", () => {
    expect(body("resize(): void {")).toContain("placeCamera");
  });

  it("fits when the arena arrives", () => {
    expect(body("setArena(arena: ArenaDescriptor): void {")).toContain("placeCamera");
  });

  it("does no fitting inside the render loop", () => {
    // A camera that recomputes itself every frame is a camera that can drift every
    // frame, and a fixed camera is a promise (RD-005). The fit is a bisection now, so
    // this also keeps a search out of the 60fps budget.
    const render = body("render(): void {");
    expect(render).not.toContain("placeCamera");
    expect(render).not.toContain("fitCamera");
    expect(render.trim()).toBe("render(): void {\n    this.gl.render(this.scene, this.camera);");
  });

  it("places the camera through the fit, not from the descriptor directly", () => {
    expect(body("setArena(arena: ArenaDescriptor): void {"))
      .not.toContain("position.set(...arena.camera.eye)");
    expect(src).toContain("fitCamera");
  });

  it("sizes the drawing buffer from the canvas, not the window (RD-031)", () => {
    // window.innerHeight excludes the browser's chrome; a fixed inset:0 canvas spans
    // the visual viewport underneath it. On the phone that found this they differed by
    // 160px, so the scene was projected at aspect 0.56 into a box whose real aspect was
    // 0.46. window.* survives only as the fallback for a zero-sized element.
    const resize = body("resize(): void {");
    expect(resize).toContain("clientWidth");
    expect(resize).toContain("clientHeight");
    expect(resize).toContain("|| window.innerWidth");
  });
});

describe("the canvas box is watched, not just the window (RD-033)", () => {
  const src = readFileSync(join(dirname(new URL(import.meta.url).pathname), "..", "render.ts"), "utf8");

  it("observes the element itself", () => {
    // The canvas box can change with no window resize event: entering standalone from
    // the home screen, the browser's chrome collapsing, a resumed page. The buffer then
    // keeps the old shape and the picture is stretched into the new one — square tiles
    // arrived on a phone as tall strips.
    expect(src).toContain("ResizeObserver");
    expect(src).toContain(".observe(canvas)");
  });

  it("keeps the window listener as a fallback", () => {
    expect(src).toContain('window.addEventListener("resize"');
    // Guarded, because ResizeObserver is not universal.
    expect(src).toContain('typeof ResizeObserver !== "undefined"');
  });
});

describe("the canvas is sized in CSS, like every replaced element (RD-031, RD-044)", () => {
  it("declares a CSS size rather than inheriting its drawing buffer", () => {
    // The original instance of the bug class: no CSS size, so the canvas laid out at
    // its buffer size — twice the viewport on a 2x display, anchored top-left. The
    // same trap took the cooldown ring (RD-043) and the action icon (RD-044).
    const kit = readFileSync(
      join(dirname(new URL(import.meta.url).pathname), "..", "ui", "kit.ts"), "utf8");
    const canvas = kit.slice(kit.indexOf("canvas{"), kit.indexOf("}", kit.indexOf("canvas{")));
    expect(canvas).toContain("width:100%");
    expect(canvas).toContain("height:100%");
  });
});
