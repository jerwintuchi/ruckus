/**
 * The instrument, tested by running it (RD-090, RD-094, RD-096, RD-104).
 *
 * These three rules were previously asserted by reading `main.ts` as text and checking
 * it contained certain strings. Those assertions passed while the behaviour was broken
 * and failed when a variable was renamed — the exact opposite of what a test on a piece
 * of measurement code should do. Every case here drives the real object.
 */
import { describe, expect, it } from "vitest";
import { Health, RECENT, STALL_MS, note, pct } from "./health.ts";

describe("snapshot gaps (RD-079)", () => {
  it("measures nothing from the first snapshot, which has no baseline", () => {
    const h = new Health();
    expect(h.noteSnap(1000)).toBe(0);
    expect(h.snapGaps).toHaveLength(0);
  });

  it("measures the gap between consecutive snapshots", () => {
    const h = new Health();
    h.noteSnap(1000);
    expect(h.noteSnap(1033)).toBe(33);
    expect(h.snapGaps).toEqual([33]);
    expect(h.worstSnap).toBe(33);
  });

  it("keeps the worst, not the last", () => {
    const h = new Health();
    h.noteSnap(0);
    h.noteSnap(500);
    h.noteSnap(510);
    expect(h.worstSnap).toBe(500);
  });
});

describe("a stall is only real if the page was awake for it (RD-096)", () => {
  it("counts a long gap the page was visible throughout", () => {
    const h = new Health();
    h.noteSnap(0);
    h.noteSnap(STALL_MS + 1);
    expect(h.visibleStalls).toBe(1);
  });

  it("does not count a gap that spans a suspension", () => {
    // Pressing screenshot lifts focus, the tab goes hidden, rAF stops, and both a frame
    // gap and a snapshot gap appear — so the act of capturing the evidence manufactures
    // the artefact. This is the case that cost the freeze hunt several rounds.
    const h = new Health();
    h.noteSnap(0);
    h.hide();
    h.show();
    h.noteSnap(14_538); // a fourteen-second "gap" that is really a window switch
    expect(h.visibleStalls).toBe(0);
    expect(h.snapGaps).toHaveLength(0);
  });

  it("marks hidden on the way OUT, not only visible on the way back (RD-094)", () => {
    // A hidden tab still receives WebSocket messages. If `hide()` did not set the flag,
    // a snapshot arriving mid-suspension would be measured against a pre-suspension
    // baseline and recorded as a huge network gap before the frame loop ever resumed.
    const h = new Health();
    h.noteSnap(0);
    h.hide();
    h.noteSnap(9_000); // arrives while still hidden
    expect(h.visibleStalls).toBe(0);
    expect(h.snapGaps).toHaveLength(0);
  });

  it("resumes measuring normally once a snapshot has re-established the baseline", () => {
    const h = new Health();
    h.noteSnap(0);
    h.hide();
    h.show();
    h.noteSnap(9_000);   // forgotten
    h.noteSnap(9_033);   // measured again
    expect(h.snapGaps).toEqual([33]);
    expect(h.visibleStalls).toBe(0);
  });

  it("counts a real stall that happens after a suspension has passed", () => {
    const h = new Health();
    h.noteSnap(0);
    h.hide();
    h.show();
    h.noteSnap(9_000);
    h.noteSnap(9_000 + STALL_MS + 1);
    expect(h.visibleStalls).toBe(1);
  });
});

describe("the stalled label (RD-081)", () => {
  const h = () => {
    const x = new Health();
    x.noteSnap(1000);
    return x;
  };

  it("says nothing while snapshots are arriving", () => {
    expect(h().stalled(1100, true, 500)).toBe(false);
  });

  it("fires once the stream has been quiet past the notice", () => {
    expect(h().stalled(1600, true, 500)).toBe(true);
  });

  it("says nothing when the socket is down — that is a different message", () => {
    expect(h().stalled(9999, false, 500)).toBe(false);
  });

  it("says nothing before the first snapshot, where quiet is expected", () => {
    expect(new Health().stalled(9999, true, 500)).toBe(false);
  });
});

describe("the recent window is bounded (P4)", () => {
  it("never grows past RECENT, however long the session runs", () => {
    const h = new Health();
    for (let i = 0; i < RECENT * 3; i++) h.noteFrame(16);
    expect(h.frameGaps).toHaveLength(RECENT);
  });

  it("drops the oldest sample, keeping the window recent", () => {
    const list: number[] = [];
    for (let i = 0; i < RECENT + 5; i++) note(list, i);
    expect(list).toHaveLength(RECENT);
    expect(list[0]).toBe(5);
  });
});

describe("percentiles", () => {
  it("is zero for an empty list rather than NaN", () => {
    expect(pct([], 0.5)).toBe(0);
  });

  it("does not disturb the caller's array", () => {
    const list = [5, 1, 3];
    pct(list, 0.5);
    expect(list).toEqual([5, 1, 3]);
  });

  it("reads the ordered sample at the quantile", () => {
    const list = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(pct(list, 0.5)).toBe(51);
    expect(pct(list, 0.95)).toBe(96);
  });

  it("clamps at the top rather than reading past the end", () => {
    expect(pct([1, 2, 3], 1)).toBe(3);
  });
});

describe("countOver", () => {
  it("counts only gaps past the threshold", () => {
    const h = new Health();
    h.noteSnap(0);
    h.noteSnap(100);
    h.noteSnap(600);
    h.noteSnap(700);
    expect(h.countOver(STALL_MS)).toBe(1);
  });
});

describe("a deliberate pause is not a stall (RD-090)", () => {
  it("does not measure the gap across a round boundary", () => {
    // The boundary is seconds long by design. Counting it would report the pause as the
    // worst stall of the session on every device, every round.
    const h = new Health();
    h.noteSnap(1000);
    h.expectGap();
    h.noteSnap(7500); // the next round's first snapshot, 6.5s later
    expect(h.visibleStalls).toBe(0);
    expect(h.snapGaps).toHaveLength(0);
  });

  it("does not count it as a page suspension either", () => {
    const h = new Health();
    h.noteSnap(1000);
    h.expectGap();
    expect(h.hiddenCount).toBe(0);
  });

  it("says nothing is stalled while waiting for the next round", () => {
    const h = new Health();
    h.noteSnap(1000);
    h.expectGap();
    expect(h.stalled(6000, true, 500)).toBe(false);
  });
});
