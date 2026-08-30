/**
 * Round scoring, shared by every minigame.
 *
 * This logic was copy-pasted into three minigames before the fourth made the
 * duplication undeniable (RD-015). Each copy built groups of tied players, awarded
 * `[3, 2, 1]` by standard competition ranking, and defaulted everyone else to zero —
 * which is three chances to get the tie semantics subtly different, in the one part of
 * a minigame a player will definitely notice.
 *
 * The quantity being ranked differs per minigame, which is why this takes a key
 * function rather than a placement array: elimination time for the three knockout
 * rounds, items collected for Scramble.
 */

/** Points for the top three finishers. The same scale in every minigame, so a match stays balanced. */
export const ROUND_POINTS = [3, 2, 1] as const;

/**
 * Award round points by rank.
 *
 * @param roster every slot that played, so nobody is silently missing from the result
 * @param keyOf  a comparable score for a slot — **higher is better**; equal keys tie
 *
 * Ties use standard competition ranking: a tied group all take that group's best rank,
 * and the next group is pushed down by the size of the tie. Two players tied for first
 * therefore take 3 and 3, and the next player takes 1, not 2.
 *
 * **A tie on a "did nothing" key is still a tie.** Five players who all collected
 * nothing tie for second and take 2 each, which is right for a knockout round (everyone
 * has an elimination time) and wrong for an accumulation round (scoring nothing should
 * score nothing). That judgement belongs to the minigame, not here: pass only the
 * players who should be ranked, and merge zeros for the rest. Scramble does exactly
 * that; the knockout rounds pass everyone.
 */
export function awardByRank(
  roster: readonly number[],
  keyOf: (slot: number) => number,
): Record<number, number> {
  const out: Record<number, number> = {};
  // Sort by key descending; break exact ties on slot so the grouping is deterministic
  // whatever order the roster arrived in.
  const ordered = [...roster].sort((a, b) => keyOf(b) - keyOf(a) || a - b);

  let rank = 0;
  let i = 0;
  while (i < ordered.length) {
    const key = keyOf(ordered[i]!);
    let j = i;
    while (j < ordered.length && keyOf(ordered[j]!) === key) j++;
    const award = ROUND_POINTS[rank] ?? 0;
    for (let k = i; k < j; k++) out[ordered[k]!] = award;
    rank += j - i;
    i = j;
  }
  for (const slot of roster) out[slot] ??= 0;
  return out;
}
