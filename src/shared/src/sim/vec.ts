/** 2D vectors on the X/Z ground plane. The sim is 2.5D — height is a separate scalar. */

export interface Vec2 {
  x: number;
  z: number;
}

export const vec = (x = 0, z = 0): Vec2 => ({ x, z });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, z: a.z + b.z });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, z: a.z - b.z });
export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, z: a.z * k });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.z * b.z;
export const len = (a: Vec2): number => Math.hypot(a.x, a.z);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z);

export function normalize(a: Vec2): Vec2 {
  const l = len(a);
  return l === 0 ? vec() : { x: a.x / l, z: a.z / l };
}

/**
 * Clamp to the unit disc.
 *
 * Netcode I2 in miniature: an out-of-range stick axis is **clamped, never rejected**.
 * Rejecting it would let a malformed or malicious client drop its own inputs on the
 * floor and stall a round that waits on movement.
 */
export function clampUnit(a: Vec2): Vec2 {
  const l = len(a);
  if (l <= 1 || l === 0) return { x: a.x, z: a.z };
  return { x: a.x / l, z: a.z / l };
}

/** Move `from` toward `to` by at most `maxDelta`. Used for acceleration and friction. */
export function moveToward(from: Vec2, to: Vec2, maxDelta: number): Vec2 {
  const d = sub(to, from);
  const l = len(d);
  if (l <= maxDelta || l === 0) return { x: to.x, z: to.z };
  return add(from, scale(d, maxDelta / l));
}
