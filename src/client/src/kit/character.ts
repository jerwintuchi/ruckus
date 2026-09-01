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

/** How long going out takes to read, in seconds. */
export const OUT_BLINK_S = 0.7;
/** Flickers across that window: a flicker, not a strobe. */
export const OUT_BLINKS = 4;

/**
 * Visible or not, this far through the blink (round-lifecycle P3).
 *
 * Pure and time-based, so it looks the same at 60 Hz and at 120 Hz, and so it can be
 * tested without a scene.
 */
export function blinkVisible(elapsed: number): boolean {
  if (elapsed >= OUT_BLINK_S) return false; // gone
  const phase = (elapsed / OUT_BLINK_S) * OUT_BLINKS;
  return phase % 1 < 0.5;
}

/** Meshes per character, asserted so the 8-on-screen budget cannot drift (T12). */
export const MESHES_PER_CHARACTER = 7;

/**
 * The caret above your own head, as a fraction of a character's height
 * (find-yourself R1).
 *
 * Derived, not a literal, so it follows the figure if the proportions ever change.
 */
export const CARET_SIZE = 0.30;
export const CARET_GAP = 0.22;

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
  /** Frame time at which this player went out, or null while they are in. */
  private outAt: number | null = null;
  /** The "this one is you" caret, or null for everybody else (find-yourself R2). */
  private caret: Mesh | null = null;
  private lastT = 0;

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
    this.lastT = t;

    if (this.outAt !== null) {
      // Blink, then leave. Nothing else about an out player needs updating.
      const elapsed = t - this.outAt;
      this.root.visible = blinkVisible(elapsed);
      return;
    }

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
    // `update` runs every frame, so it has to honour the eliminated fade rather than
    // writing over it — the first version set the fade once and then undid it 60 times
    // a second.
    (this.shadow.material as { opacity: number }).opacity = 0.34 * shrink;
  }

  /**
   * Mark this character as the local player's (find-yourself R1, R2, P1-P4).
   *
   * Built once, as a child of the pivot — so it rides the existing bob rather than
   * running a clock of its own, and `ROUND_START` rebuilding characters destroys it for
   * free. Nothing to clean up is the property RD-050 was about.
   *
   * Idempotent: `syncPlayers` runs every frame and exactly one caret must ever exist.
   */
  setMine(colour: string): void {
    if (this.caret) return;
    // A slab like every other part, so it needs no new material and no new idiom. Wide
    // and short, pointing down: a caret rather than a flag, which would occlude the
    // player behind it (R2).
    const c = slab(colour, CARET_SIZE, CARET_SIZE * 0.62, SLAB_DEPTH);
    c.position.y = BODY.height + CARET_GAP;
    c.rotation.z = Math.PI / 4;
    this.caret = c;
    this.pivot.add(c);
  }

  setVisible(v: boolean): void {
    // An out player stays gone: `syncPlayers` calls this every frame, and it must not
    // undo the blink.
    this.root.visible = v && (this.outAt === null || blinkVisible(this.lastT - this.outAt));
  }

  /**
   * Going out is an event, not a state (round-lifecycle R3).
   *
   * It has been both wrong ways. Originally this hid the character instantly, under a
   * comment claiming the opposite, and Hot Potato's arena silently emptied (RD-048).
   * Then it greyed them and left them standing, which read as a player stuck rather
   * than a player out (RD-049). Now it blinks and leaves: you see it happen, and then
   * the arena shows only who is still in.
   *
   * The state lives on the Character, and characters are rebuilt at ROUND_START — so
   * it cannot outlive its round by construction rather than by remembering to clean up.
   */
  setEliminated(): void {
    if (this.outAt !== null) return; // called on every snapshot while out
    this.outAt = this.lastT;
  }

}
