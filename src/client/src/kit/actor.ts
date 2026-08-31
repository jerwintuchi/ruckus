/**
 * Procedural character animation (kit-rules.md).
 *
 * No rigs, no skeletons, no keyframes — a character's motion is a pure function of
 * its velocity, height and the clock. This is the whole animation system, it is about
 * forty lines, and it applies to every player in every minigame for free. That is the
 * point: the alternative is an animation pipeline, and an animation pipeline is an
 * art pipeline wearing a different hat (RD-001).
 */

export interface ActorPose {
  /** Hip/shoulder angles, radians. Legs and arms are always in counter-phase. */
  legSwing: number;
  armSwing: number;
  /** Extra yaw on a turn, so the slab shows its ink edge — the paper flip. */
  flip: number;
  /** Vertical bob applied to the body, in metres. */
  bob: number;
  /** Lean into the direction of travel, in radians. Clamped. */
  lean: number;
  /** Vertical scale; <1 is a squash, >1 a stretch. */
  squash: number;
  /** Counter-swing for the hands, in radians. */
  swing: number;
}

export const MAX_LEAN = 0.35;
export const MAX_LEG_SWING = 0.62;
export const MAX_ARM_SWING = 0.5;
export const MAX_FLIP = 0.34;
const BOB_HZ = 2.4;
const BOB_AMPLITUDE = 0.07;
const SWING_AMPLITUDE = 0.6;

/**
 * @param speed    horizontal speed in m/s
 * @param maxSpeed the speed at which the gait is at full amplitude
 * @param airborne height above the ground; drives squash and suppresses the bob
 * @param vy       vertical velocity, so a rise stretches and a fall squashes
 * @param t        seconds; the only time input, so the pose is reproducible
 * @param turning  how sharply the character is changing direction, 0..1 — drives the
 *                 flip that shows the slab's ink edge
 */
export function poseFor(
  speed: number,
  maxSpeed: number,
  airborne: number,
  vy: number,
  t: number,
  turning = 0,
): ActorPose {
  const gait = maxSpeed > 0 ? Math.min(1, Math.max(0, speed / maxSpeed)) : 0;
  const grounded = airborne <= 0.01;

  // A bob while falling reads as a glitch, so the gait only drives it on the ground.
  const phase = t * BOB_HZ * Math.PI * 2;
  const bob = grounded ? Math.abs(Math.sin(phase)) * BOB_AMPLITUDE * gait : 0;

  const lean = clamp(gait * MAX_LEAN, -MAX_LEAN, MAX_LEAN);

  // In the air, stretch on the way up and squash on the way down — the cheapest
  // possible read on "which way am I going", and it survives a small phone screen.
  const squash = grounded ? 1 - bob * 0.5 : clamp(1 + vy * 0.03, 0.7, 1.3);

  const swing = grounded ? Math.sin(phase) * SWING_AMPLITUDE * gait : 0.3;

  // Paper hinges; it does not deform. A sinusoid reads as rubber, so the curve is
  // sharpened toward its extremes — the limb snaps to a pose and holds it (R9).
  const snap = (v: number): number => Math.sign(v) * Math.pow(Math.abs(v), 0.55);
  const legSwing = grounded ? snap(Math.sin(phase)) * MAX_LEG_SWING * gait : -0.42;
  const armSwing = grounded ? -snap(Math.sin(phase)) * MAX_ARM_SWING * gait : 0.55;

  const flip = clamp(turning, 0, 1) * MAX_FLIP;

  return { bob, lean, squash, swing, legSwing, armSwing, flip };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
