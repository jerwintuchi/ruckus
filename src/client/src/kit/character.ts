/**
 * A player character: capsule body, sphere head, two box hands. That is the entire
 * model (kit-rules.md) — a low-poly bean is a capsule, so there is nothing to author.
 */
import { Group, type Mesh } from "three";
import { MAX_SPEED } from "@ruckus/shared";
import { blobShadow, box, capsule, sphere } from "./prims.ts";
import { poseFor } from "./actor.ts";
import { PALETTE } from "./palette.ts";

export class Character {
  readonly root = new Group();
  private readonly body: Mesh;
  private readonly head: Mesh;
  private readonly handL: Mesh;
  private readonly handR: Mesh;
  private readonly shadow: Mesh;
  private readonly pivot = new Group();

  constructor(colour: string) {
    this.body = capsule(colour);
    this.body.position.y = 0.75;

    this.head = sphere(colour, 0.3);
    this.head.position.y = 1.6;

    this.handL = box(colour, 0.18, 0.18, 0.18);
    this.handR = box(colour, 0.18, 0.18, 0.18);
    this.handL.position.set(-0.5, 0.9, 0);
    this.handR.position.set(0.5, 0.9, 0);

    this.shadow = blobShadow(0.45, 0.35);
    this.shadow.position.y = 0.02;

    this.pivot.add(this.body, this.head, this.handL, this.handR);
    this.root.add(this.pivot, this.shadow);
  }

  /**
   * @param height  metres above the ground plane
   * @param speed   horizontal speed, m/s
   * @param vy      vertical velocity, for squash/stretch
   * @param facing  yaw in radians
   * @param t       seconds
   */
  update(height: number, speed: number, vy: number, facing: number, t: number): void {
    const pose = poseFor(speed, MAX_SPEED, height, vy, t);

    this.pivot.position.y = height + pose.bob;
    this.pivot.rotation.y = facing;
    this.pivot.rotation.x = pose.lean * 0.5;
    this.pivot.scale.y = pose.squash;

    this.handL.position.z = Math.sin(pose.swing) * 0.25;
    this.handR.position.z = -Math.sin(pose.swing) * 0.25;

    // The shadow stays on the ground and shrinks with height — the only depth cue a
    // fixed camera gives you for free, and the one that makes falling readable.
    const shrink = Math.max(0.25, 1 - height * 0.12);
    this.shadow.scale.setScalar(0.9 * shrink);
    (this.shadow.material as { opacity: number }).opacity = 0.35 * shrink;
  }

  setVisible(v: boolean): void {
    this.root.visible = v;
  }

  /** Eliminated players stay on screen, greyed — losing must be watchable. */
  setEliminated(): void {
    this.pivot.visible = false;
    this.shadow.visible = false;
    void PALETTE;
  }
}
