/**
 * Where the time actually goes, measured on the device (RD-079).
 *
 * "It freezes every now and then" has two completely different causes needing completely
 * different fixes: the SNAPSHOT STREAM stalling (the network, or the server) or the FRAME
 * LOOP stalling (this phone, dropping frames). From the outside they look identical —
 * everything stops — and no test or screenshot tells them apart. A probe run on the
 * server host cannot see the first, because it never crosses the network the phone does.
 *
 * Counted always and shown only under `?debug=1`: a handful of numbers per frame is far
 * cheaper than another round trip to whoever is holding the device (RD-053).
 *
 * This lives in its own file because it is the instrument, and an instrument has to be
 * testable. Inline in `main.ts` its three hardest-won rules — RD-090, RD-094, RD-096 —
 * were "tested" by reading main.ts as text and asserting it contained certain strings.
 * That is not a test: it passes while the behaviour is broken, and it fails when a
 * variable is renamed, so it penalises exactly the refactoring it should protect.
 */

/** How many recent samples the percentiles are taken over. */
export const RECENT = 600;

/**
 * A stall shorter than this is jitter, not an event worth counting.
 *
 * The same threshold the debug line's `stalls>300` uses, deliberately. `visibleStalls`
 * previously counted gaps over STALL_NOTICE_MS (500) while the label beside it counted
 * 300, so `REAL` was not the awake-subset of the number it sat next to and the two could
 * not be compared — which is exactly what a reader does with them.
 */
export const STALL_MS = 300;

export class Health {
  readonly snapGaps: number[] = [];
  readonly frameGaps: number[] = [];

  worstFrame = 0;
  worstSnap = 0;

  /** When the last snapshot arrived, for the stalled label and the debug readout. */
  lastSnapAt = 0;

  /**
   * Whether `lastSnapAt` means anything yet.
   *
   * Explicit rather than `lastSnapAt > 0`, which was the original form and which quietly
   * assumes the clock is never zero. That holds for `performance.now()` in a browser and
   * fails the moment anything drives this from a test or a replay with a zero origin —
   * the first case written against this class hit it. A sentinel that depends on the
   * timebase is not a sentinel.
   */
  private hasBaseline = false;

  /**
   * Set the moment the page is hidden, cleared by the first snapshot after it returns
   * (RD-096).
   *
   * The RD-094 reset was not enough on its own. It ran on `visibilitychange`, but a
   * hidden tab still RECEIVES WebSocket messages — so the snap handler recorded the
   * whole suspension as a network gap before the frame loop ever resumed. Resetting a
   * clock the other reader has already read is not a reset.
   */
  wasHidden = false;

  /**
   * Stalls over STALL_MS with NO suspension anywhere near them.
   *
   * The one number the freeze hunt actually needed. A stall coinciding with a hidden tab
   * says nothing — the page was not running. A stall while the page was visible
   * throughout is a real fault.
   */
  visibleStalls = 0;

  /** How many times the page has come back from being hidden. */
  hiddenCount = 0;

  /**
   * Record a snapshot arriving at `now`.
   *
   * Returns the gap it measured, or 0 when there was no baseline to measure from — the
   * first snapshot of a session, and the first after a suspension.
   *
   * Note what is NOT skipped: the snapshot itself. An early return here would drop the
   * whole frame — no prims, no reconciliation — costing a real snapshot to avoid
   * mis-recording a fake gap. Only the MEASUREMENT is skipped.
   */
  noteSnap(now: number): number {
    let gap = 0;
    if (this.hasBaseline && !this.wasHidden) {
      gap = now - this.lastSnapAt;
      note(this.snapGaps, gap);
      if (gap > this.worstSnap) this.worstSnap = gap;
      if (gap > STALL_MS) this.visibleStalls++;
    }
    this.lastSnapAt = now;
    this.hasBaseline = true;
    this.wasHidden = false;
    return gap;
  }

  /** Record a rendered frame's delta. */
  noteFrame(dtMs: number): void {
    note(this.frameGaps, dtMs);
    if (dtMs > this.worstFrame) this.worstFrame = dtMs;
  }

  /**
   * The page stopped being drawn (RD-094).
   *
   * A browser SUSPENDS `requestAnimationFrame` in a hidden tab and throttles message
   * handling with it. Switch windows, take a screenshot, let a phone dim, glance at a
   * notification — the page stops and every clock goes stale together. On return
   * `now - lastSnapAt` is enormous, so the `reconnecting` chip fires and the frame log
   * records a fourteen-second frame, and neither has anything to do with the network.
   * That is what was being chased: 14538 ms of "frame" on a desktop whose p50 is 13 ms,
   * immediately after a window switch.
   */
  hide(): void {
    this.wasHidden = true;
  }

  /**
   * The page is being drawn again: forget the gap rather than measure it.
   *
   * The caller must reset ITS baselines too — the frame clock, the tick accumulator and
   * the predictor. A half-reset is worse than none: it leaves one clock honest and the
   * other reporting the whole suspension.
   */
  show(): void {
    this.hiddenCount++;
    this.lastSnapAt = 0;
    this.hasBaseline = false;
  }

  /**
   * Forget the baseline without counting a suspension (RD-090).
   *
   * For a pause that is DELIBERATE and known: the gap between rounds is seconds long, by
   * design, and both the stalled chip and the worst-gap figure key off "time since the
   * last snapshot". Without this the chip fires at every round transition on every
   * device and the worst-gap number reports the boundary rather than any real fault.
   */
  expectGap(): void {
    this.lastSnapAt = 0;
    this.hasBaseline = false;
  }

  /**
   * Has the stream stopped answering? Purely a label (RD-081).
   *
   * Prediction and interpolation each hold on their own and neither consults this.
   */
  stalled(now: number, connected: boolean, noticeMs: number): boolean {
    return connected && this.hasBaseline && now - this.lastSnapAt > noticeMs;
  }

  /** Stalls in the recent window, whether or not the page was awake for them. */
  countOver(ms: number): number {
    let n = 0;
    for (const g of this.snapGaps) if (g > ms) n++;
    return n;
  }
}

/** Append, bounded. A ring of the most recent samples, never the whole session. */
export function note(list: number[], v: number): void {
  list.push(v);
  if (list.length > RECENT) list.shift();
}

/** The q-th percentile of `list`, rounded. Zero for an empty list. */
export function pct(list: readonly number[], q: number): number {
  if (list.length === 0) return 0;
  const a = [...list].sort((x, y) => x - y);
  return Math.round(a[Math.min(a.length - 1, Math.floor(a.length * q))] ?? 0);
}
