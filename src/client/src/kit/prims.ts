/**
 * Primitive builders — the only way geometry enters the game (kit-rules.md).
 *
 * Geometries and materials are created ONCE and reused. A minigame that allocates a
 * BoxGeometry per tile per frame is the difference between 60fps and 20fps on the
 * mid-range Android that is the actual target, and the allocation is invisible in
 * review, so the Kit removes the opportunity rather than the mistake.
 */
import {
  BoxGeometry,
  CapsuleGeometry,
  CircleGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  SphereGeometry,
  type Material,
} from "three";
import { hexToInt } from "./palette.ts";

/** Unit geometries. Everything is scaled from these; nothing allocates a new one. */
export const GEO = {
  box: new BoxGeometry(1, 1, 1),
  sphere: new SphereGeometry(0.5, 10, 8),
  capsule: new CapsuleGeometry(0.5, 1, 4, 8),
  cylinder: new CylinderGeometry(0.5, 0.5, 1, 12),
  icosa: new IcosahedronGeometry(0.5, 0),
  circle: new CircleGeometry(0.5, 14),
} as const;

const materials = new Map<string, MeshLambertMaterial>();

/** Flat-shaded lambert, cached by colour. No textures, no PBR (kit-rules.md). */
export function mat(colour: string): MeshLambertMaterial {
  let m = materials.get(colour);
  if (!m) {
    m = new MeshLambertMaterial({ color: hexToInt(colour), flatShading: true });
    materials.set(colour, m);
  }
  return m;
}

const shadowMaterials = new Map<number, MeshBasicMaterial>();

/** Blob shadows are geometry, because shadow maps are the single biggest mobile cost. */
export function shadowMat(opacity: number): MeshBasicMaterial {
  const key = Math.round(opacity * 100);
  let m = shadowMaterials.get(key);
  if (!m) {
    m = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity });
    shadowMaterials.set(key, m);
  }
  return m;
}

export function box(colour: string, w = 1, h = 1, d = 1): Mesh {
  const m = new Mesh(GEO.box, mat(colour));
  m.scale.set(w, h, d);
  return m;
}

export function cylinder(colour: string, r = 0.5, h = 1): Mesh {
  const m = new Mesh(GEO.cylinder, mat(colour));
  m.scale.set(r * 2, h, r * 2);
  return m;
}

export function sphere(colour: string, r = 0.5): Mesh {
  const m = new Mesh(GEO.sphere, mat(colour));
  m.scale.setScalar(r * 2);
  return m;
}

export function capsule(colour: string): Mesh {
  return new Mesh(GEO.capsule, mat(colour));
}

export function icosa(colour: string, r = 0.5): Mesh {
  const m = new Mesh(GEO.icosa, mat(colour));
  m.scale.setScalar(r * 2);
  return m;
}

export function blobShadow(r = 0.5, opacity = 0.35): Mesh {
  const m = new Mesh(GEO.circle, shadowMat(opacity));
  m.rotation.x = -Math.PI / 2;
  m.scale.setScalar(r * 2);
  return m;
}

/** How many distinct materials the Kit has handed out — asserted by the perf test. */
export function materialCount(): number {
  return materials.size + shadowMaterials.size;
}

export function disposeAll(): void {
  for (const m of materials.values()) (m as Material).dispose();
  for (const m of shadowMaterials.values()) (m as Material).dispose();
  materials.clear();
  shadowMaterials.clear();
}
