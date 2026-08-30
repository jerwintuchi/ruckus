/**
 * The scene: one fixed camera, one directional light, one ambient (kit-rules.md).
 *
 * The camera comes from the arena descriptor and is never touched again — that is
 * what buys back the second thumb and makes occlusion a per-arena design decision
 * rather than a per-frame hazard (RD-005).
 */
import {
  AmbientLight,
  Color,
  DirectionalLight,
  Group,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  type Mesh,
} from "three";
import type { ArenaDescriptor, Prim } from "@ruckus/shared";
import { Character } from "./kit/character.ts";
import { PALETTE } from "./kit/palette.ts";
import { box, cylinder, sphere } from "./kit/prims.ts";
import type { LerpedPlayer } from "./net.ts";

export class Renderer {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  private readonly gl: WebGLRenderer;
  private readonly statics = new Group();
  private readonly dynamics = new Group();
  private readonly prims = new Group();
  private readonly characters = new Map<number, Character>();
  private tileMeshes: Mesh[] = [];
  private tileStates: number[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.gl = new WebGLRenderer({ canvas, antialias: false });
    // Cap the pixel ratio: a 3x phone display costs 9x the fragments for a look
    // nobody can tell apart at arm's length, and it is the first thing to blow the
    // 60fps budget on mid-range hardware.
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.background = new Color(PALETTE.sky);

    this.camera = new PerspectiveCamera(45, 1, 0.1, 200);
    this.scene.add(this.statics, this.dynamics, this.prims);

    const key = new DirectionalLight(0xffffff, 2.1);
    key.position.set(6, 14, 8);
    this.scene.add(key, new AmbientLight(0xffffff, 1.1));

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Apply an arena: fixed camera, static geometry, clear colour. */
  setArena(arena: ArenaDescriptor): void {
    this.statics.clear();
    this.camera.position.set(...arena.camera.eye);
    this.camera.lookAt(...arena.camera.look);
    this.camera.fov = arena.camera.fov;
    this.camera.updateProjectionMatrix();
    this.scene.background = new Color(arena.sky);
    for (const p of arena.statics) this.statics.add(buildPrim(p));
  }

  /** Build the tile grid once; thereafter only colours and heights change. */
  setTiles(states: number[], grid: number, tile: number): void {
    for (const m of this.tileMeshes) this.dynamics.remove(m);
    this.tileMeshes = [];
    this.tileStates = [...states];
    const half = (grid * tile) / 2;
    states.forEach((_, i) => {
      const col = i % grid;
      const row = Math.floor(i / grid);
      const m = box(PALETTE.floor, tile * 0.94, 0.5, tile * 0.94);
      m.position.set(col * tile - half + tile / 2, -0.25, row * tile - half + tile / 2);
      this.dynamics.add(m);
      this.tileMeshes.push(m);
    });
    states.forEach((s, i) => this.setTile(i, s));
  }

  setTile(i: number, state: number): void {
    const m = this.tileMeshes[i];
    if (!m) return;
    this.tileStates[i] = state;
    if (state === 0) {
      m.material = box(PALETTE.floor).material;
      m.position.y = -0.25;
      m.visible = true;
    } else if (state === 1) {
      m.material = box(PALETTE.cracking).material;
      m.visible = true;
    } else {
      m.visible = false;
    }
  }

  /**
   * A cracking tile shudders in place — the one visual affordance the rule needs,
   * and it is procedural, so it costs no asset (kit-rules.md). The phase is offset by
   * tile index so the grid rattles instead of pulsing in unison.
   */
  shudderTiles(t: number): void {
    for (let i = 0; i < this.tileMeshes.length; i++) {
      const m = this.tileMeshes[i];
      if (!m || this.tileStates[i] !== 1) continue;
      m.position.y = -0.25 + Math.sin(t * 40 + i * 1.7) * 0.04;
    }
  }

  /**
   * Draw a minigame's dynamic primitives (hot-potato T2).
   *
   * Any minigame may put `prims` in its snapshot and have them drawn without a line
   * of client code — the generic path that keeps minigame N+1 cheap. Meshes are
   * rebuilt each frame rather than diffed: the counts here are single digits, and a
   * diff would be more code than it saves. Geometries and materials still come from
   * the Kit's caches, so nothing is allocated but the Mesh wrappers.
   */
  setPrims(prims: readonly Prim[] | undefined): void {
    this.prims.clear();
    if (!prims?.length) return;
    for (const p of prims) this.prims.add(buildPrim(p));
  }

  syncPlayers(players: LerpedPlayer[], colours: Map<number, string>, t: number): void {
    const seen = new Set<number>();
    for (const p of players) {
      seen.add(p.slot);
      let c = this.characters.get(p.slot);
      if (!c) {
        c = new Character(colours.get(p.slot) ?? PALETTE.accent);
        this.characters.set(p.slot, c);
        this.dynamics.add(c.root);
      }
      c.root.position.set(p.x, 0, p.z);
      c.setVisible(true);
      if (!p.alive) c.setEliminated();
      c.update(p.y, p.speed, p.vy, p.facing, t);
    }
    for (const [slot, c] of this.characters) {
      if (!seen.has(slot)) c.setVisible(false);
    }
  }

  clearPlayers(): void {
    for (const c of this.characters.values()) this.dynamics.remove(c.root);
    this.characters.clear();
  }

  render(): void {
    this.gl.render(this.scene, this.camera);
  }
}

/**
 * One `Prim` descriptor to one Mesh. Exported so it can be tested without a WebGL
 * context: this mapping is the part of the generic prims channel that can actually
 * be wrong, and it should not need a browser to assert.
 */
export function buildPrim(p: Prim): Mesh {
  switch (p.k) {
    case "box": {
      const m = box(p.colour, ...p.size);
      m.position.set(...p.pos);
      if (p.rotY) m.rotation.y = p.rotY;
      return m;
    }
    case "cyl": {
      const m = cylinder(p.colour, p.r, p.h);
      m.position.set(...p.pos);
      if (p.rotY) m.rotation.y = p.rotY;
      return m;
    }
    case "sphere": {
      const m = sphere(p.colour, p.r);
      m.position.set(...p.pos);
      return m;
    }
    case "plane": {
      const m = box(p.colour, p.size[0], 0.1, p.size[1]);
      m.position.set(...p.pos);
      return m;
    }
  }
}
