import { describe, expect, it } from "vitest";
import { ROUND_POINTS, awardByRank } from "./score.ts";
import { makeRng } from "./sim/rng.ts";

const by = (m: Record<number, number>) => (slot: number) => m[slot] ?? 0;

describe("awardByRank (scramble T1, R6)", () => {
  it("awards 3/2/1 down a strict order", () => {
    const keys = { 0: 10, 1: 8, 2: 6, 3: 4 };
    expect(awardByRank([0, 1, 2, 3], by(keys))).toEqual({ 0: 3, 1: 2, 2: 1, 3: 0 });
  });

  it("does not care what order the roster arrives in", () => {
    const keys = { 0: 10, 1: 8, 2: 6 };
    expect(awardByRank([2, 0, 1], by(keys))).toEqual(awardByRank([0, 1, 2], by(keys)));
  });

  it("gives a tied group the better rank and pushes the next group down by its size", () => {
    // Two tied for first take 3 and 3; the next player is rank 3, so takes 1, not 2.
    const keys = { 0: 9, 1: 9, 2: 5 };
    expect(awardByRank([0, 1, 2], by(keys))).toEqual({ 0: 3, 1: 3, 2: 1 });
  });

  it("drops a group past the podium entirely when the tie is wide enough", () => {
    const keys = { 0: 9, 1: 9, 2: 9, 3: 1 };
    expect(awardByRank([0, 1, 2, 3], by(keys))).toEqual({ 0: 3, 1: 3, 2: 3, 3: 0 });
  });

  it("gives everyone the same when everyone ties", () => {
    const keys = { 0: 4, 1: 4, 2: 4, 3: 4 };
    expect(awardByRank([0, 1, 2, 3], by(keys))).toEqual({ 0: 3, 1: 3, 2: 3, 3: 3 });
  });

  it("scores every roster member, so nobody is silently missing", () => {
    const out = awardByRank([0, 1, 2, 3, 4, 5], by({ 0: 1 }));
    for (let slot = 0; slot < 6; slot++) expect(out[slot]).toBeTypeOf("number");
  });

  it("treats a tie on zero as a genuine tie — the caller decides if that is wanted", () => {
    // One player scored, five did not. They tie for second and take 2 each, which is
    // right for a knockout round and wrong for an accumulation round. A minigame that
    // wants "nothing scores nothing" ranks only its scorers and merges zeros itself.
    const out = awardByRank([0, 1, 2, 3, 4, 5], by({ 0: 1 }));
    expect(out[0]).toBe(3);
    expect([out[1], out[2], out[3], out[4], out[5]]).toEqual([2, 2, 2, 2, 2]);

    // The caller-side idiom, which is what Scramble uses:
    const counts: Record<number, number> = { 0: 1 };
    const roster = [0, 1, 2, 3, 4, 5];
    const scorers = roster.filter((s) => (counts[s] ?? 0) > 0);
    const ranked = { ...Object.fromEntries(roster.map((s) => [s, 0])), ...awardByRank(scorers, by(counts)) };
    expect(ranked).toEqual({ 0: 3, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
  });

  it("never awards more than 3, and never a negative", () => {
    const r = makeRng(9);
    for (let t = 0; t < 500; t++) {
      const roster = [0, 1, 2, 3, 4, 5, 6, 7];
      const keys: Record<number, number> = {};
      for (const s of roster) keys[s] = r.int(5);
      for (const pts of Object.values(awardByRank(roster, by(keys)))) {
        expect(pts).toBeLessThanOrEqual(Math.max(...ROUND_POINTS));
        expect(pts).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("is monotonic — a larger key never scores less", () => {
    const r = makeRng(13);
    for (let t = 0; t < 500; t++) {
      const roster = [0, 1, 2, 3, 4, 5];
      const keys: Record<number, number> = {};
      for (const s of roster) keys[s] = r.int(6);
      const out = awardByRank(roster, by(keys));
      for (const a of roster) {
        for (const b of roster) {
          if (keys[a]! > keys[b]!) expect(out[a]!).toBeGreaterThanOrEqual(out[b]!);
        }
      }
    }
  });

  it("handles an empty roster and a single player", () => {
    expect(awardByRank([], by({}))).toEqual({});
    expect(awardByRank([4], by({ 4: 7 }))).toEqual({ 4: 3 });
  });

  it("ranks by the key, so a minigame chooses what 'better' means", () => {
    // Knockout rounds pass elimination time (survivors take Infinity); Scramble
    // passes items collected. Same function, opposite quantities.
    const elimAt = { 0: Number.POSITIVE_INFINITY, 1: 900, 2: 400 };
    expect(awardByRank([0, 1, 2], by(elimAt))).toEqual({ 0: 3, 1: 2, 2: 1 });
  });
});
