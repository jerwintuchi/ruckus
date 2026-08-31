/**
 * A player, cut from paper (visual-direction T10–T11, R7, R9).
 *
 * Every part is a slab: coloured front and back, ink edges, so the whole figure is
 * outlined by construction with no shader and no extra pass. Turning shows the edge —
 * the flip that reads as paper is also the depth cue Sweepers and Hot Potato depend on.
 *
 * **Not a billboard.** A camera-facing quad is the more authentic Paper Mario read and
 * would remove depth judgement entirely, in a game about timing a jump over a sweeping
 * bar. That was a gameplay decision, not an art one (RD-021).
 */
import { Group, type Mesh } from "three";
import { MAX_SPEED } from "@ruckus/shared";
import { poseFor } from "./actor.ts";
import { faceFor } from "./face.ts";
import { PAPER } from "./palette.ts";
import { SLAB_DEPTH, slab } from "./paper.ts";
import { blobShadow } from "./prims.ts";

/** Proportions. Footprint and height stay as the capsule's, so no collision moves. */
export const BODY = {
  headSize: 0.44,
  torsoW: 0.60,
  torsoH: 0.66,
  armW: 0.14,
  armH: 0.52,
  legW: 0.19,
  legH: 0.50,
  /** Total, feet to crown. */
  height: 1.80,
} as const;

/** Meshes per character, asserted so the 8-on-screen budget cannot drift (T12). */
export const MESHES_PER_CHARACTER = 7;

export class Character {
  readonly root = new Group();
  private readonly pivot = new Group();
  private readonly head: Mesh;
  private readonly torso: Mesh;
  private readonly armL = new Group();
  private readonly armR = new Group();
  private readonly legL = new Group();
  private readonly legR = new Group();
  private readonly shadow: Mesh;

  constructor(colour: string, slot: number) {
    // The head carries the generated face on its front (+Z) slab face.
    this.head = slab(colour, BODY.headSize, BODY.headSize, SLAB_DEPTH, {
      front: faceFor(slot, colour),
    });
    this.head.position.y = BODY.legH + BODY.torsoH + BODY.headSize / 2;

    this.torso = slab(colour, BODY.torsoW, BODY.torsoH, SLAB_DEPTH);
    this.torso.position.y = BODY.legH + BODY.torsoH / 2;

    // Limbs hang from a pivot at the shoulder or hip, so they rotate rather than bend.
    const hang = (w: number, h: number, x: number, y: number, into: Group): void => {
      const part = slab(colour, w, h, SLAB_DEPTH);
      part.position.y = -h / 2;
      into.add(part);
      into.position.set(x, y, 0);
    };
    const shoulderY = BODY.legH + BODY.torsoH * 0.92;
    hang(BODY.armW, BODY.armH, -(BODY.torsoW / 2 + BODY.armW / 2), shoulderY, this.armL);
    hang(BODY.armW, BODY.armH, BODY.torsoW / 2 + BODY.armW / 2, shoulderY, this.armR);
    hang(BODY.legW, BODY.legH, -BODY.legW * 0.75, BODY.legH, this.legL);
    hang(BODY.legW, BODY.legH, BODY.legW * 0.75, BODY.legH, this.legR);

    this.shadow = blobShadow(0.45, 0.34);
    this.shadow.position.y = 0.02;

    this.pivot.add(this.head, this.torso, this.armL, this.armR, this.legL, this.legR);
    this.root.add(this.pivot, this.shadow);
  }

  /**
   * @param height   metres above the ground plane
   * @param speed    horizontal speed, m/s
   * @param vy       vertical velocity, for squash and stretch
   * @param facing   yaw in radians
   * @param t        seconds
   * @param turning  0..1, how sharply direction is changing — drives the paper flip
   */
  update(
    height: number, speed: number, vy: number, facing: number, t: number,
    turning = 0, tumbling = 0,
  ): void {
    const pose = poseFor(speed, MAX_SPEED, height, vy, t, turning, tumbling);

    this.pivot.position.y = height + pose.bob;
    // The flip adds yaw on a turn so the ink edge comes into view — the paper tell.
    this.pivot.rotation.y = facing + pose.flip;
    // The roll is about the same axis as the lean, so they add: a tumbling character
    // is leaning into a rotation rather than fighting it.
    this.pivot.rotation.x = pose.lean * 0.4 + pose.tumble;
    this.pivot.scale.y = pose.squash;

    this.legL.rotation.x = pose.legSwing;
    this.legR.rotation.x = -pose.legSwing;
    this.armL.rotation.x = pose.armSwing;
    this.armR.rotation.x = -pose.armSwing;

    // The shadow stays on the ground and shrinks with height — with a fixed camera it
    // is the cheapest depth cue there is, and it makes falling readable.
    const shrink = Math.max(0.25, 1 - height * 0.12);
    this.shadow.scale.setScalar(0.9 * shrink);
    (this.shadow.material as { opacity: number }).opacity = 0.34 * shrink;
  }

  setVisible(v: boolean): void {
    this.root.visible = v;
  }

  /** Eliminated players stay on screen — losing must be watchable (vision pillar 3). */
  setEliminated(): void {
    this.pivot.visible = false;
    this.shadow.visible = false;
    void PAPER;
  }
}
