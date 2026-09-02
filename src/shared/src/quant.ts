/**
 * Wire quantization (design P3).
 *
 * Snapshots go out 20 times a second to up to 8 clients; sending full floats for
 * every position is most of a snapshot's bytes for precision no one can see. A
 * centimetre is far below the smallest visible movement at our camera distance.
 */

/** Metres → integer centimetres. */
export const quantPos = (m: number): number => Math.round(m * 100);
export const dequantPos = (q: number): number => q / 100;

/** Radians → one byte. Angles are only ever used to face a capsule. */
export const quantAngle = (rad: number): number => {
  const t = ((rad % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return Math.round((t / (Math.PI * 2)) * 255) & 255;
};
export const dequantAngle = (q: number): number => (q / 255) * Math.PI * 2;

/**
 * Centimetre precision, kept as a metre value (I5).
 *
 * `quantPos` above turns metres into integer centimetres for `SnapPlayer`, where the
 * client dequantizes on arrival. Prims are read straight off the wire by the renderer,
 * so they cannot change units — but they can stop shipping seventeen significant
 * figures of a double. `-4.123456789012345` is 18 bytes and `-4.12` is 5, for a
 * difference no one can see at any distance the camera allows.
 */
export const cm = (m: number): number => Math.round(m * 100) / 100;

/** Radians, to a thousandth — about a twentieth of a degree. */
export const rad3 = (r: number): number => Math.round(r * 1000) / 1000;

/**
 * Round every number in a prim to what the wire needs (I5).
 *
 * Applied by the shell to the per-tick `prims` channel, once, rather than by each
 * minigame in its own `snapshot()`. Same argument as the round timer and
 * `resolvePlayerOverlaps`: four minigames each remembering is four chances to forget,
 * and minigame five inherits the omission rather than the rule.
 *
 * This mattered more than it looks. `scramble` ships one sphere per pickup, and at
 * full-precision floats 30% of its snapshots exceeded the 1240-byte TCP payload of a
 * 1280-MTU path — so they were split across two packets, and losing either stalled the
 * whole stream until retransmission. Every other minigame already fitted in one.
 */
export function quantPrim<T>(prim: T): T {
  const p = prim as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { ...p };
  if (Array.isArray(p.pos)) out.pos = (p.pos as number[]).map(cm);
  if (Array.isArray(p.size)) out.size = (p.size as number[]).map(cm);
  if (typeof p.r === "number") out.r = cm(p.r);
  if (typeof p.h === "number") out.h = cm(p.h);
  if (typeof p.rotY === "number") out.rotY = rad3(p.rotY);
  return out as unknown as T;
}
