/**
 * The paper renderer's building blocks (visual-direction T8–T9, R3–R6).
 *
 * **The outline is geometry, not a shader.** A slab is a box a few centimetres deep
 * whose four edge faces are near-black; rendered, that outlines the silhouette by
 * construction — no inverted hull on the common path, no depth-buffer edge detection,
 * no fullscreen pass, and no per-frame cost at all (RD-021).
 *
 * `BoxGeometry` orders its face groups +X, -X, +Y, -Y, +Z, -Z, so handing it an array
 * of six materials paints the front and back one way and the four edges another. That
 * ordering is the whole trick, and a test pins it.
 */
import {
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Material,
  type Texture,
} from "three";
import { PAPER } from "./palette.ts";

/** Thick enough to read as an outline at phone size, thin enough to read as paper. */
export const SLAB_DEPTH = 0.08;

/** A 3x display costs 2.25x the fragments for something nobody can see at arm's length. */
export const PIXEL_RATIO_CAP = 2;

/** How much bigger an inverted hull is than the mesh it outlines. */
export const HULL_SCALE = 1.06;

const hexToInt = (hex: string): number => Number.parseInt(hex.replace("#", ""), 16);

/** BoxGeometry's face order. Named because the slab trick depends on it entirely. */
export const FACE_ORDER = ["+X", "-X", "+Y", "-Y", "+Z", "-Z"] as const;
export const FRONT_FACE = 4; // +Z — where a face texture goes
export const BACK_FACE = 5;
export const EDGE_FACES = [0, 1, 2, 3] as const;

const unlitCache = new Map<string, MeshBasicMaterial>();
const litCache = new Map<string, MeshLambertMaterial>();

/**
 * Unlit flat fill. Paper does not receive light (R5), and this is cheaper than the
 * Lambert it replaces — the look and the frame budget pull the same way for once.
 */
export function unlit(colour: string, map?: Texture): MeshBasicMaterial {
  const key = `${colour}:${map?.uuid ?? ""}`;
  let m = unlitCache.get(key);
  if (!m) {
    m = new MeshBasicMaterial({ color: hexToInt(colour) });
    if (map) m.map = map;
    unlitCache.set(key, m);
  }
  return m;
}

/** Softly lit, for arena surfaces — so a floor still reads as a surface. */
export function lit(colour: string, map?: Texture): MeshLambertMaterial {
  const key = `${colour}:${map?.uuid ?? ""}`;
  let m = litCache.get(key);
  if (!m) {
    m = new MeshLambertMaterial({ color: hexToInt(colour) });
    if (map) m.map = map;
    litCache.set(key, m);
  }
  return m;
}

export const inkMaterial = (): MeshBasicMaterial => unlit(PAPER.ink);

/** One unit box, shared by every slab. Size lives in the transform, never the geometry. */
export const SLAB_GEOMETRY = new BoxGeometry(1, 1, 1);

export interface SlabOptions {
  /** Drawn on the front (+Z) face — a generated face texture, say. */
  front?: Texture;
  /** Softly lit rather than unlit. Arena surfaces want this; characters do not. */
  shaded?: boolean;
  /** Override the back face; defaults to the front colour, one shade of nothing. */
  back?: string;
}

/**
 * A slab: coloured front and back, ink edges.
 *
 * The six-material array is what produces the outline. Turning the slab shows the ink
 * edge, so the flip that reads as paper is also the depth cue the gameplay needs — a
 * billboard would have removed it (R7).
 */
export function slab(
  colour: string,
  width: number,
  height: number,
  depth = SLAB_DEPTH,
  opts: SlabOptions = {},
): Mesh {
  const ink = inkMaterial();
  const face = opts.shaded ? lit(colour, opts.front) : unlit(colour, opts.front);
  const back = opts.shaded ? lit(opts.back ?? colour) : unlit(opts.back ?? colour);

  const materials: Material[] = [ink, ink, ink, ink, face, back];
  const mesh = new Mesh(SLAB_GEOMETRY, materials);
  mesh.scale.set(width, height, depth);
  return mesh;
}

/**
 * An opt-in outline for something that is not a slab — a cylinder pickup, say.
 *
 * One extra draw for that one object, never a global effect. Anything that can be a
 * slab should be, because a slab's outline is free and this one is not.
 */
export function invertedHull(source: Mesh, scale = HULL_SCALE): Mesh {
  const hull = new Mesh(source.geometry, new MeshBasicMaterial({
    color: hexToInt(PAPER.ink),
    side: DoubleSide,
  }));
  hull.scale.copy(source.scale).multiplyScalar(scale);
  hull.position.copy(source.position);
  hull.rotation.copy(source.rotation);
  hull.renderOrder = -1; // behind the thing it outlines
  return hull;
}

/** A cylinder that carries its own outline, for pickups and posts. */
export function outlinedCylinder(colour: string, radius: number, height: number): Mesh[] {
  const geo = new CylinderGeometry(0.5, 0.5, 1, 14);
  const mesh = new Mesh(geo, unlit(colour));
  mesh.scale.set(radius * 2, height, radius * 2);
  return [invertedHull(mesh), mesh];
}

/** Counts, for the budget assertions in the tests. */
export function materialCount(): number {
  return unlitCache.size + litCache.size;
}

export function disposePaper(): void {
  for (const m of unlitCache.values()) m.dispose();
  for (const m of litCache.values()) m.dispose();
  unlitCache.clear();
  litCache.clear();
}
