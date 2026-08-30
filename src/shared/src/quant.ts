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
