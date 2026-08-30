/**
 * Seeded RNG — mulberry32.
 *
 * Server-only in practice (netcode I3), but it lives in shared because a minigame's
 * determinism test needs it too. Chosen over Math.random for the obvious reason and
 * over a heavier PRNG because 32 bits of state is plenty for round generation and it
 * is trivially portable — the same seed must give the same round on any machine, in
 * any year (P5).
 */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
  /** Uniform in [lo, hi). */
  range(lo: number, hi: number): number;
  /** Fisher-Yates, in place, returned for convenience. */
  shuffle<T>(items: T[]): T[];
  pick<T>(items: readonly T[]): T;
}

export function makeRng(seed: number): Rng {
  // Force to uint32 so a float or negative seed still behaves.
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number): number => Math.floor(next() * n);
  return {
    next,
    int,
    range: (lo, hi) => lo + next() * (hi - lo),
    shuffle<T>(items: T[]): T[] {
      for (let i = items.length - 1; i > 0; i--) {
        const j = int(i + 1);
        const tmp = items[i]!;
        items[i] = items[j]!;
        items[j] = tmp;
      }
      return items;
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error("pick from empty");
      return items[int(items.length)]!;
    },
  };
}

/** A seed derived from a room code + round index, so a round is reproducible by name. */
export function seedFrom(code: string, round: number): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < code.length; i++) {
    h ^= code.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= round + 0x9e3779b9;
  return h >>> 0;
}
