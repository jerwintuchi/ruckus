/**
 * The in-round HUD (visual-direction T16, R12).
 *
 * It renders **known snapshot keys** and ignores everything else. A minigame that
 * wants a fuse bar puts `fuse` and `fuseLength` in its snapshot; one that wants a
 * countdown puts `remaining`. No minigame is named here, and none ever should be —
 * the same rule that keeps `main.ts` free of minigame ids (RD-009). A test asserts it.
 */
import { escapeHtml } from "./kit.ts";

/** Whatever a minigame put in its snapshot. Unknown shapes are simply not drawn. */
export type HudData = Record<string, unknown>;

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** One gauge per known key, in a fixed order so the HUD does not reshuffle mid-round. */
export function renderHud(extra: HudData | undefined): string {
  if (!extra) return "";
  const parts: string[] = [];

  // A fuse: how long until whoever is holding it goes out.
  const fuse = num(extra.fuse);
  const fuseLength = num(extra.fuseLength);
  if (fuse !== null && fuseLength !== null && fuseLength > 0) {
    const pct = Math.max(0, Math.min(100, (fuse / fuseLength) * 100));
    // Under two seconds is the part players actually react to, so it says so.
    const urgent = fuse <= 2000 ? " urgent" : "";
    parts.push(
      `<div class="gauge${urgent}"><span>${(fuse / 1000).toFixed(1)}s</span>` +
        `<span class="bar"><i style="--pct:${pct.toFixed(1)}%"></i></span></div>`,
    );
  }

  // A countdown: how long the round itself has left.
  const remaining = num(extra.remaining);
  if (remaining !== null) {
    parts.push(`<div class="gauge"><span>${Math.ceil(remaining / 1000)}s left</span></div>`);
  }

  // A tally: what each player has collected so far.
  const counts = extra.counts;
  if (counts && typeof counts === "object" && !Array.isArray(counts)) {
    const total = Object.values(counts as Record<string, unknown>)
      .map(num)
      .filter((v): v is number => v !== null)
      .reduce((a, b) => a + b, 0);
    parts.push(`<div class="gauge"><span>${total} collected</span></div>`);
  }

  return parts.join("");
}

/**
 * A player's own tally, when the snapshot carries one. Kept separate because it needs
 * to know which slot is you, and the rest of the HUD deliberately does not.
 */
export function myCount(extra: HudData | undefined, slot: number): number | null {
  const counts = extra?.counts;
  if (!counts || typeof counts !== "object") return null;
  return num((counts as Record<string, unknown>)[String(slot)]);
}

/** The round's name, shown small while it plays so a latecomer can orient. */
export function roundLabel(displayName: string, round: number, of: number): string {
  return `<div class="gauge"><span>${escapeHtml(displayName)} · ${round}/${of}</span></div>`;
}

/** The count shown before a round: 3, 2, 1, then nothing. */
export const COUNT_FROM = 3;

/**
 * The number to draw before a round starts, or 0 for none (round-brief T1, R1, P1).
 *
 * Derived from the server's absolute `endsAt`, never ticked locally. A client that
 * receives `intro` a second late computes 2, not 3, so everyone counts to the same
 * instant — a `setInterval` started on arrival would count each player to their own.
 *
 * Clamped at both ends: a clock far behind must not print 9, and one far ahead must
 * not print a negative. Neither is hypothetical across a phone, a laptop and a server.
 */
export function countdownAt(endsAt: number, now: number): number {
  const remaining = endsAt - now;
  if (!Number.isFinite(remaining) || remaining <= 0) return 0;
  // Nothing until the count actually starts. `Math.min(COUNT_FROM, ...)` CLAMPED
  // instead, so with a 4s intro the "3" was shown for the first second as well as its
  // own — two seconds of 3, then one each of 2 and 1. That is the uneven count a
  // playtester saw and called off timing (RD-065). Hidden above the threshold, each
  // number now gets exactly one second.
  if (remaining > COUNT_FROM * 1000) return 0;
  return Math.ceil(remaining / 1000);
}
