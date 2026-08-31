/**
 * What a scene actually costs to draw (visual-direction T18, R13).
 *
 * The point of this file is that **draw calls are not mesh counts**. `WebGLRenderer`
 * walks the graph and pushes one render item per *geometry group*, so a mesh carrying
 * an array of materials costs one draw per group — which is exactly the shape a slab
 * has. Counting meshes and calling it a budget is how the paper build quietly went
 * from 40 draws to 296 for the same eight players (RD-028).
 *
 * This mirrors `WebGLRenderer.projectObject`'s accounting rather than sampling a real
 * frame, so it runs in a test with no GPU and no browser. It answers "how much work is
 * being handed to the driver", not "how many milliseconds did it take" — that second
 * question needs a real phone, and `bench.ts` is what asks it there.
 */
import type { BufferGeometry, Material, Mesh, Object3D } from "three";

export interface Cost {
  /** Render items the driver is handed — one per geometry group, not per mesh. */
  drawCalls: number;
  triangles: number;
  meshes: number;
  /** Distinct geometries. Sharing is the whole reason a lobby of eight is affordable. */
  geometries: number;
  /** Distinct materials. Each distinct one is a shader program the GPU compiles. */
  materials: number;
}

const indexCount = (g: BufferGeometry): number =>
  g.index ? g.index.count : (g.attributes.position?.count ?? 0);

/**
 * Walk a subtree and total what drawing it would cost.
 *
 * Invisible objects are skipped, the same way the renderer skips them — an eliminated
 * player still in the graph is not still on the bill.
 */
export function costOf(root: Object3D): Cost {
  let drawCalls = 0;
  let triangles = 0;
  let meshes = 0;
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();

  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || !o.visible) return;
    // `traverse` descends into hidden branches, so check the ancestry the renderer
    // would have culled: one invisible Group hides everything under it.
    for (let p = o.parent; p; p = p.parent) if (!p.visible) return;

    meshes++;
    geometries.add(mesh.geometry);

    if (Array.isArray(mesh.material)) {
      for (const group of mesh.geometry.groups) {
        const m = mesh.material[group.materialIndex ?? 0];
        if (!m?.visible) continue;
        drawCalls++;
        materials.add(m);
        triangles += group.count / 3;
      }
    } else if (mesh.material.visible) {
      drawCalls++;
      materials.add(mesh.material);
      triangles += indexCount(mesh.geometry) / 3;
    }
  });

  return { drawCalls, triangles, meshes, geometries: geometries.size, materials: materials.size };
}

/** One line, for the on-device overlay and for a failing test's message. */
export const formatCost = (c: Cost): string =>
  `${c.drawCalls} draws · ${Math.round(c.triangles)} tris · ${c.meshes} meshes · ` +
  `${c.geometries} geo · ${c.materials} mat`;
