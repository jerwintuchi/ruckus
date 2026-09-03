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

/**
 * The wire form of a run of prims that differ only in position (RD-085).
 *
 * A prim is mostly constant: `scramble` ships one sphere per pickup and 40 of its 66
 * bytes are `"k":"sphere"`, `"r":0.35` and `"colour":"#ffd23f"` — repeated, in full,
 * for every single pickup. At fifteen pickups that is 600 bytes of the 1006 saying the
 * same three things over and over.
 */
export type PrimGroup = Record<string, unknown> & { at: [number, number, number][] };

/** Everything about a prim except where it is, with keys in a stable order. */
function signature(p: Record<string, unknown>): string {
  return JSON.stringify(
    Object.keys(p).filter((k) => k !== "pos").sort().map((k) => [k, p[k]]),
  );
}

/**
 * Group prims that differ only in position, so the constants travel once (RD-085).
 *
 * Order within a group is preserved, and groups appear in first-seen order. Order
 * across groups is not preserved when kinds are interleaved — which is safe because
 * `Renderer.setPrims` clears and rebuilds every prim independently, so nothing reads a
 * prim's index. That is a real coupling, and it is why the renderer's behaviour was
 * checked before this was written rather than after.
 */
export function packPrims<T>(prims: readonly T[]): PrimGroup[] {
  const groups = new Map<string, PrimGroup>();
  for (const prim of prims) {
    const p = prim as unknown as Record<string, unknown>;
    const key = signature(p);
    let g = groups.get(key);
    if (!g) {
      g = { at: [] };
      for (const k of Object.keys(p)) if (k !== "pos") g[k] = p[k];
      groups.set(key, g);
    }
    g.at.push(p.pos as [number, number, number]);
  }
  return [...groups.values()];
}

/** Expand what `packPrims` produced, back into ordinary prims. */
export function unpackPrims<T>(groups: readonly PrimGroup[]): T[] {
  const out: T[] = [];
  for (const g of groups) {
    const { at, ...constants } = g;
    for (const pos of at) out.push({ ...constants, pos } as unknown as T);
  }
  return out;
}

/**
 * Encode a minigame's `snapshot()` for the wire: quantize its prims, then group them.
 *
 * Extracted from `GameServer.sendSnapshot` so there is exactly ONE description of what
 * a minigame's extra looks like on the wire. RD-101 happened because there were two:
 * the shell did this, and `tools/bots.test.mjs` hand-wrote what it thought the result
 * was. The hand-written one stopped matching, kept passing, and the bots played every
 * scramble round blind for four playtests.
 *
 * Anything reading a snapshot — the client, a bot, a test — is reading the output of
 * this function, so a change here breaks all of them at once, loudly, which is the
 * entire point.
 *
 * Mutates and returns `extra`: the object is freshly built by `snapshot()` every tick
 * and is not shared, and copying it per tick per room is exactly the allocation I5
 * exists to avoid.
 */
export function encodeSnapshotExtra<T>(extra: T): T {
  const e = extra as { prims?: unknown[] } | null | undefined;
  if (e && Array.isArray(e.prims)) {
    e.prims = packPrims(e.prims.map((p) => quantPrim(p)));
  }
  return extra;
}
