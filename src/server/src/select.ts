/**
 * Minigame selection: a shuffled bag, dealt without replacement (R4).
 *
 * A plain random pick repeats, and a repeat inside a ten-minute match is the most
 * noticeable possible flaw — people remember playing the same round twice far more
 * than they remember which rounds they got. The bag makes a repeat impossible until
 * every minigame has been seen once.
 */
import type { Rng } from "@ruckus/shared";

export class Bag<T> {
  private remaining: T[] = [];

  private readonly items: readonly T[];
  private readonly rng: Rng;

  constructor(items: readonly T[], rng: Rng) {
    if (items.length === 0) throw new Error("Bag needs at least one item");
    this.items = items;
    this.rng = rng;
  }

  next(): T {
    if (this.remaining.length === 0) this.remaining = this.rng.shuffle([...this.items]);
    return this.remaining.pop()!;
  }

  /** Exposed for the test that proves no repeat occurs before the bag empties. */
  get left(): number {
    return this.remaining.length;
  }
}
