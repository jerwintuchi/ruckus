/**
 * Movement and collision on the X/Z plane, with height as a scalar.
 *
 * This is the whole physics of the game (RD-005): no engine, no solver, no
 * broadphase. 3D is a rendering choice and the server never knows about it.
 */
import { ACCEL, FRICTION, GRAVITY, MAX_SPEED, PLAYER_RADIUS } from "../constants.ts";
import { type Vec2, add, clampUnit, len, moveToward, scale, vec } from "./vec.ts";

/** An axis-aligned solid. `y`/`height` are only used to decide standable ground. */
export interface Solid {
  min: Vec2;
  max: Vec2;
}

export interface Body {
  pos: Vec2;
  vel: Vec2;
  /** Height above the ground plane. */
  y: number;
  vy: number;
  grounded: boolean;
  radius: number;
}

export interface MoveInput {
  /** Stick axis. Any magnitude; clamped here, never rejected (I2). */
  axis: Vec2;
  jump: boolean;
}

export function makeBody(pos: Vec2, radius = PLAYER_RADIUS): Body {
  return { pos: { ...pos }, vel: vec(), y: 0, vy: 0, grounded: true, radius };
}

/**
 * Resolve a circle out of an AABB along the axis of least penetration.
 *
 * P6: idempotent — a body already outside is returned unchanged, so re-resolving a
 * resolved position is a no-op and the order of solids cannot cause drift.
 */
export function resolveCircleAabb(pos: Vec2, radius: number, s: Solid): Vec2 {
  const cx = Math.max(s.min.x, Math.min(pos.x, s.max.x));
  const cz = Math.max(s.min.z, Math.min(pos.z, s.max.z));
  const dx = pos.x - cx;
  const dz = pos.z - cz;
  const d2 = dx * dx + dz * dz;

  if (d2 > radius * radius) return pos; // outside — nothing to do (P6)

  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    const push = radius - d;
    return { x: pos.x + (dx / d) * push, z: pos.z + (dz / d) * push };
  }

  // Centre is inside the box: push out along the shallowest face.
  const toLeft = pos.x - s.min.x;
  const toRight = s.max.x - pos.x;
  const toBack = pos.z - s.min.z;
  const toFront = s.max.z - pos.z;
  const m = Math.min(toLeft, toRight, toBack, toFront);
  if (m === toLeft) return { x: s.min.x - radius, z: pos.z };
  if (m === toRight) return { x: s.max.x + radius, z: pos.z };
  if (m === toBack) return { x: pos.x, z: s.min.z - radius };
  return { x: pos.x, z: s.max.z + radius };
}

/**
 * Advance one body by one fixed step.
 *
 * `groundHeight` returns the standable height under a position, or `null` where
 * there is no ground — which is how Falling Floor eliminates people without the
 * minigame needing its own physics (P3).
 *
 * `speedMul` scales the terminal speed for this step. It exists so a minigame can
 * express a dash, a boost or a slow without reaching into the integrator or keeping
 * a private copy of it — Hot Potato's dash is the first user. Callers that pass a
 * multiplier above 1 must check the tunnelling guard against the MULTIPLIED speed,
 * not the base one; `MIN_SOLID_THICKNESS` is the budget.
 */
export function stepMovement(
  body: Body,
  input: MoveInput,
  dt: number,
  solids: readonly Solid[],
  groundHeight: (p: Vec2) => number | null,
  jumpSpeed = 0,
  speedMul = 1,
): void {
  const axis = clampUnit(input.axis); // I2: clamp, never reject
  const wish = scale(axis, MAX_SPEED * speedMul);

  // Accelerate toward the wish velocity; friction only when there is no input.
  // Acceleration scales with the multiplier too, or a dash would take longer to reach
  // its own top speed than the dash lasts.
  const rate = (len(axis) > 0.001 ? ACCEL : FRICTION) * Math.max(1, speedMul);
  body.vel = moveToward(body.vel, wish, rate * dt);

  body.pos = add(body.pos, scale(body.vel, dt));
  for (const s of solids) body.pos = resolveCircleAabb(body.pos, body.radius, s);

  if (input.jump && body.grounded && jumpSpeed > 0) {
    body.vy = jumpSpeed;
    body.grounded = false;
  }

  const ground = groundHeight(body.pos);
  body.vy -= GRAVITY * dt;
  body.y += body.vy * dt;

  if (ground !== null && body.y <= ground && body.vy <= 0) {
    body.y = ground;
    body.vy = 0;
    body.grounded = true;
  } else {
    body.grounded = false;
  }
}
