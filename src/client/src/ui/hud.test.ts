import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { COUNT_FROM, myCount, renderHud, rollTo, roundLabel, countdownAt } from "./hud.ts";
import { INTRO_MS } from "@ruckus/shared";
const SERVER = join(dirname(new URL(import.meta.url).pathname), "..", "..", "..", "server", "src");
import { MINIGAMES } from "../../../server/src/minigames/index.ts";

describe("the HUD draws known keys (visual-direction T16, R12)", () => {
  it("draws a fuse bar when a snapshot carries one", () => {
    const html = renderHud({ fuse: 4500, fuseLength: 9000 });
    expect(html).toContain("4.5s");
    expect(html).toContain("--pct:50.0%");
  });

  it("marks a fuse urgent only when it is nearly out", () => {
    expect(renderHud({ fuse: 1200, fuseLength: 9000 })).toContain("urgent");
    expect(renderHud({ fuse: 8000, fuseLength: 9000 })).not.toContain("urgent");
  });

  it("clamps a fuse bar rather than overflowing its track", () => {
    expect(renderHud({ fuse: 99_000, fuseLength: 9000 })).toContain("--pct:100.0%");
    expect(renderHud({ fuse: -500, fuseLength: 9000 })).toContain("--pct:0.0%");
  });

  it("draws a countdown when a snapshot carries one", () => {
    expect(renderHud({ remaining: 12_400 })).toContain("13s left");
  });

  it("draws a tally when a snapshot carries counts", () => {
    expect(renderHud({ counts: { 0: 3, 1: 5 } })).toContain("8 collected");
  });

  it("draws several gauges at once, in a stable order", () => {
    const html = renderHud({ remaining: 3000, fuse: 1000, fuseLength: 4000, counts: { 0: 1 } });
    expect(html.indexOf("1.0s")).toBeLessThan(html.indexOf("s left"));
    expect(html.indexOf("s left")).toBeLessThan(html.indexOf("collected"));
  });
});

describe("the HUD ignores what it does not know (R12)", () => {
  it("draws nothing for an empty or absent snapshot", () => {
    expect(renderHud(undefined)).toBe("");
    expect(renderHud({})).toBe("");
  });

  it("ignores unknown keys without throwing", () => {
    expect(() => renderHud({ bars: [1, 2], prims: [], holder: 3, wat: null })).not.toThrow();
    expect(renderHud({ bars: [1, 2], holder: 3 })).toBe("");
  });

  it("survives malformed values for keys it does know", () => {
    for (const bad of [{ fuse: "x" }, { fuse: NaN, fuseLength: 1 }, { remaining: null },
                       { counts: [1, 2] }, { counts: "no" }, { fuseLength: 0, fuse: 5 }]) {
      expect(() => renderHud(bad as Record<string, unknown>), JSON.stringify(bad)).not.toThrow();
    }
  });

  it("reads a player's own tally, and null when there is none", () => {
    expect(myCount({ counts: { 2: 7 } }, 2)).toBe(7);
    expect(myCount({ counts: { 2: 7 } }, 3)).toBeNull();
    expect(myCount({}, 0)).toBeNull();
    expect(myCount(undefined, 0)).toBeNull();
  });

  it("escapes a minigame name rather than letting it inject markup", () => {
    expect(roundLabel("<img src=x>", 1, 5)).not.toContain("<img");
  });
});

/**
 * The architectural guard (RD-009). A UI that names a minigame is a UI that grows a
 * branch per minigame, and adding one stops being a server-only job.
 */
describe("no minigame is named anywhere in the UI (R12, RD-009)", () => {
  const UI_DIR = join(import.meta.dirname);

  it("holds across every file in src/client/src/ui/", () => {
    const offences: string[] = [];
    for (const file of readdirSync(UI_DIR)) {
      if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
      const src = readFileSync(join(UI_DIR, file), "utf8");
      for (const m of MINIGAMES) {
        if (src.includes(m.id)) offences.push(`${file} mentions "${m.id}"`);
      }
    }
    expect(offences).toEqual([]);
  });
});

describe("the countdown before a round (round-brief T1, R1, P1)", () => {
  const ENDS = 10_000;

  it("counts 3, 2, 1 across the last three seconds", () => {
    expect(countdownAt(ENDS, ENDS - 2500)).toBe(3);
    expect(countdownAt(ENDS, ENDS - 1500)).toBe(2);
    expect(countdownAt(ENDS, ENDS - 500)).toBe(1);
  });

  it("draws nothing in the first second of a 4s intro", () => {
    // The rule needs a beat to be read before a number starts pulling the eye.
    //
    // THIS TEST SAID THE OPPOSITE OF ITS OWN NAME. It asserted COUNT_FROM here —
    // that a 3 IS drawn in that first second — because the implementation clamped
    // rather than waited. So the 3 was on screen for two seconds and the 2 and the 1
    // for one each, which is the uneven count a playtester reported (RD-065). The name
    // was right and the assertion was wrong; reversed in place, with the reason kept.
    expect(countdownAt(ENDS, ENDS - 3500)).toBe(0);
    expect(countdownAt(ENDS, ENDS - 3001)).toBe(0);
  });

  it("gives every number exactly one second", () => {
    // The property the uneven count violated. Sampled densely enough that a number
    // holding for two seconds cannot hide between the samples.
    const seen = new Map<number, number>();
    for (let t = 0; t <= COUNT_FROM * 1000; t += 10) {
      const n = countdownAt(ENDS, ENDS - t);
      if (n > 0) seen.set(n, (seen.get(n) ?? 0) + 10);
    }
    expect([...seen.keys()].sort()).toEqual([1, 2, 3]);
    for (const [n, ms] of seen) expect(ms, `the ${n}`).toBeCloseTo(1000, -2);
  });

  it("draws nothing once the deadline has passed", () => {
    expect(countdownAt(ENDS, ENDS)).toBe(0);
    expect(countdownAt(ENDS, ENDS + 5000)).toBe(0);
  });

  it("survives a nonsensical clock without printing a nonsensical number", () => {
    // This used to be the DEFENCE against clock skew, and clamping is not one: it
    // turned a phone whose clock ran a second fast into a phone that opened the intro
    // already on "1". The skew is gone at the source — the wire carries a duration
    // now, not an instant (RD-065) — and this is only the last line of defence.
    expect(countdownAt(ENDS, ENDS - 60_000)).toBe(0);
    expect(countdownAt(ENDS, ENDS + 60_000)).toBe(0);
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(countdownAt(ENDS, bad), String(bad)).toBe(0);
    }
  });

  it("is a pure function of its two arguments", () => {
    expect(countdownAt(ENDS, ENDS - 1500)).toBe(countdownAt(ENDS, ENDS - 1500));
  });
});

describe("two devices count together, whatever their clocks say (RD-065)", () => {
  const INTRO = 4000;

  /** What a client does now: add the wire's DURATION to a clock it already trusts. */
  const fromDuration = (localNow: number, inMs: number, at: number): number =>
    countdownAt(localNow + inMs, at);

  it("gives every device the same sequence, at any clock offset", () => {
    // The host and the phone disagreed about the time by about a second, so the phone
    // opened the intro already on "1" and lost it immediately. A duration cannot do
    // that: each device measures against itself.
    const sample = (deviceClock: number): number[] => {
      const ends = deviceClock + INTRO;
      return [0, 1000, 2000, 3000, 3500].map((dt) => countdownAt(ends, deviceClock + dt));
    };
    const host = sample(0);
    for (const skew of [-90_000, -1500, -1, 0, 1, 1500, 90_000, 1.7e12]) {
      expect(sample(skew), `skew ${skew}`).toEqual(host);
    }
    expect(host).toEqual([0, 3, 2, 1, 1]);
  });

  it("an INSTANT on the wire would NOT survive the same skew", () => {
    // Stated so the fix cannot be undone quietly. This is the old shape: the server
    // sends `serverNow + INTRO` and each client subtracts its own clock.
    const serverInstant = 0 + INTRO;
    const onTime = countdownAt(serverInstant, 0);
    const oneSecondFast = countdownAt(serverInstant, 1000);
    expect(onTime).not.toBe(oneSecondFast);
  });

  it("is what main.ts actually does — its own monotonic clock, not the wall clock", () => {
    const src = readFileSync(join(dirname(new URL(import.meta.url).pathname), "..", "main.ts"), "utf8");
    expect(src).toContain("introEndsAt = performance.now() + msg.inMs;");
    // Date.now() is steppable by the OS and disagrees between devices; neither is
    // acceptable for something counting seconds on eight screens at once.
    const countdown = src.slice(src.indexOf("introEndsAt = "), src.indexOf("introEndsAt = ") + 200);
    expect(countdown).not.toContain("Date.now()");
  });

  it("the intro is long enough for the count it promises", () => {
    // COUNT_FROM numbers at a second each have to fit, or the first one is clipped.
    expect(INTRO_MS).toBeGreaterThanOrEqual(COUNT_FROM * 1000);
  });

  it("the server sends a duration from the constant, not a literal or an instant", () => {
    const net = readFileSync(join(SERVER, "net.ts"), "utf8");
    // BRIEF_MS now: `intro` carries the brief's duration and `count` carries the
    // count's, each from its own constant (round-open R1). Still never a literal.
    expect(net).toContain("inMs: BRIEF_MS");
    expect(net).toContain("inMs: COUNT_MS");
    expect(net).toContain("of: ROUNDS_PER_MATCH");
    const intro = net.slice(net.indexOf('t: "intro"'), net.indexOf('t: "intro"') + 400);
    expect(intro).not.toContain("Date.now()");
  });
});

describe("scores roll, and are correct at every instant (ui-identity T2, R2, P2)", () => {
  const cell = () => ({ textContent: null as string | null });
  /** A clock and a scheduler under the test's control. */
  const rig = () => {
    const queue: (() => void)[] = [];
    let t = 0;
    return {
      now: () => t,
      schedule: (fn: () => void) => { queue.push(fn); },
      advance: (ms: number) => { t += ms; const q = queue.splice(0); for (const f of q) f(); },
      pending: () => queue.length,
    };
  };

  it("writes the FINAL value before it animates anything", () => {
    // The property everything else rests on. The obvious implementation counts
    // forwards and leaves a wrong number if interrupted — and this card is interrupted
    // constantly, because the next round starts.
    const el = cell();
    const r = rig();
    rollTo(el, 0, 7, r.now, r.schedule);
    expect(el.textContent).toBe("7");
  });

  it("still reads correctly if the card is destroyed mid-roll", () => {
    const el = cell();
    const r = rig();
    rollTo(el, 0, 12, r.now, r.schedule, 600);
    r.advance(200);           // a third of the way
    const midway = Number(el.textContent);
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(12);
    // Nothing more is scheduled by the test: the element is simply abandoned. The
    // guarantee is that it was correct the instant rollTo returned.
  });

  it("lands exactly on the target", () => {
    const el = cell();
    const r = rig();
    rollTo(el, 0, 9, r.now, r.schedule, 600);
    r.advance(600);
    expect(el.textContent).toBe("9");
    r.advance(10);
    expect(r.pending()).toBe(0);
  });

  it("writes integers only — a score never flickers through 2.3", () => {
    const el = cell();
    const r = rig();
    const seen: string[] = [];
    rollTo(el, 0, 5, r.now, r.schedule, 400);
    for (let i = 0; i < 8; i++) { r.advance(50); seen.push(el.textContent!); }
    for (const v of seen) expect(v, v).toMatch(/^-?\d+$/);
  });

  it("does nothing at all when the value did not change", () => {
    // Stillness is the information: a player who gained nothing must not animate.
    const el = cell();
    const r = rig();
    rollTo(el, 4, 4, r.now, r.schedule);
    expect(el.textContent).toBe("4");
    expect(r.pending()).toBe(0);
  });
});
