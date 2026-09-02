/**
 * Prediction and reconciliation (input-prediction T3, T4, T5, T7).
 *
 * The properties here are the ones that make prediction safe to ship: it must add
 * nothing when there is nothing to add (P2), it must be replayable (P1), idempotent
 * (P3), bounded (P4), silent about outcomes (P5), framerate-independent (P6) and
 * completely inert when off (P7).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CORRECTION_MS,
  INTRO_MS,
  JUMP_SPEED,
  MATCH_RESULT_MS,
  MAX_CATCHUP_STEPS,
  MAX_PENDING,
  MAX_SPEED,
  PREDICT_BUDGET_M,
  RESULT_MS,
  SNAP_DISTANCE,
  TICK_DT,
  TICK_MS,
  type Solid,
  makeBody,
  stepMovement,
  vec,
} from "@ruckus/shared";
import { Predictor } from "./predict.ts";

const here = dirname(fileURLToPath(import.meta.url));
const FLAT = (): number => 0;

/** Drive a predictor into a live round with the server having placed it at the origin. */
function live(solids: Solid[] = [], jumpSpeed = 0): Predictor {
  const p = new Predictor();
  p.beginRound(solids, jumpSpeed);
  p.reconcile(vec(0, 0), 0, 0, 1);
  return p;
}

/** What the server would do with the same inputs, using the same shared primitive. */
function authoritative(
  inputs: { ax: number; ay: number; btn: boolean }[],
  solids: Solid[] = [],
  jumpSpeed = 0,
  speedMul = 1,
) {
  const body = makeBody(vec());
  for (const i of inputs) {
    stepMovement(body, { axis: vec(i.ax, i.ay), jump: i.btn }, TICK_DT, solids, FLAT, jumpSpeed, speedMul);
  }
  return body;
}

describe("prediction adds nothing when there is nothing to add (T3, P2)", () => {
  it("sits exactly on the server's position with no unacknowledged input", () => {
    const p = live();
    p.reconcile(vec(3, -4), 0, 0, 1);
    const at = p.sample(16);
    expect(at.x).toBeCloseTo(3, 10);
    expect(at.z).toBeCloseTo(-4, 10);
  });

  it("adopts a fully acknowledged run without drifting off it", () => {
    const p = live();
    const inputs = Array.from({ length: 10 }, () => ({ ax: 1, ay: 0, btn: false }));
    for (const i of inputs) p.step(i.ax, i.ay, i.btn);

    // The server applied all ten and says where that lands.
    const server = authoritative(inputs);
    p.reconcile(server.pos, server.y, 10, 1);

    const at = p.sample(1000); // any residual has long decayed
    expect(at.x).toBeCloseTo(server.pos.x, 6);
    expect(at.z).toBeCloseTo(server.pos.z, 6);
    expect(p.pendingCount).toBe(0);
  });
});

describe("replay reproduces the server exactly (T3, P1)", () => {
  it("predicts the same position the server will reach, over many input runs", () => {
    // The point of the whole spec: replaying unacknowledged inputs through the SHARED
    // integrator lands where the server independently lands. If this drifts, every
    // frame of prediction is a lie the correction has to clean up.
    for (let seed = 0; seed < 200; seed++) {
      const inputs = Array.from({ length: 12 }, (_, k) => ({
        ax: Math.sin(seed * 1.7 + k * 0.9),
        ay: Math.cos(seed * 2.3 + k * 0.4),
        btn: (seed + k) % 5 === 0,
      }));
      const p = live();
      for (const i of inputs) p.step(i.ax, i.ay, i.btn);

      // Server has acknowledged nothing, so all 12 are replayed onto the origin.
      p.reconcile(vec(0, 0), 0, 0, 1);
      const at = p.sample(0);
      const server = authoritative(inputs);
      expect(at.x).toBeCloseTo(server.pos.x, 6);
      expect(at.z).toBeCloseTo(server.pos.z, 6);
    }
  });

  it("is deterministic: the same pending run replays to the same place twice", () => {
    const run = () => {
      const p = live();
      for (let k = 0; k < 8; k++) p.step(Math.sin(k), Math.cos(k), false);
      p.reconcile(vec(0, 0), 0, 0, 1);
      return p.sample(0);
    };
    expect(run()).toEqual(run());
  });
});

describe("reconciliation is idempotent (T3, P3)", () => {
  it("applying the same snapshot twice leaves the same predicted position", () => {
    const p = live();
    for (let k = 0; k < 6; k++) p.step(1, 0, false);

    p.reconcile(vec(1, 1), 0, 3, 1);
    const once = p.sample(0);
    p.reconcile(vec(1, 1), 0, 3, 1);
    const twice = p.sample(0);

    expect(twice.x).toBeCloseTo(once.x, 10);
    expect(twice.z).toBeCloseTo(once.z, 10);
  });
});

describe("replay is bounded, not unbounded (T3, T7, P4)", () => {
  it("never keeps more than MAX_PENDING inputs however long the acks stop", () => {
    // A centred stick banks inputs without diverging, so this reaches the hard ceiling
    // rather than stopping at the divergence budget (RD-079). Both bounds matter: the
    // budget bounds the CORRECTION, this bounds the WORK — replay is O(MAX_PENDING),
    // never O(uptime).
    const p = live();
    for (let k = 0; k < MAX_PENDING * 10; k++) {
      p.step(0, 0, false);
      expect(p.pendingCount).toBeLessThanOrEqual(MAX_PENDING);
    }
    expect(p.pendingCount).toBe(MAX_PENDING);
  });

  it("stops banking early when movement spends the divergence budget first", () => {
    const p = live();
    for (let k = 0; k < MAX_PENDING * 4; k++) p.step(1, 0, false);
    expect(p.pendingCount).toBeLessThan(MAX_PENDING);
    expect(p.holding).toBe(true);
  });
});

describe("a correction is blended, not snapped (T4, R3)", () => {
  it("does not apply a small error whole in one frame", () => {
    const p = live();
    p.step(1, 0, false);
    // Server disagrees by 20 cm — well inside SNAP_DISTANCE.
    p.reconcile(vec(0.2, 0), 0, 1, 1);

    const first = p.sample(16);
    // Still visibly short of the server's answer: the error is being carried, not taken.
    expect(Math.abs(first.x - 0.2)).toBeGreaterThan(0.001);
  });

  it("decays that error toward zero rather than holding it", () => {
    const p = live();
    p.step(1, 0, false);
    p.reconcile(vec(0.2, 0), 0, 1, 1);

    let prev = Infinity;
    for (let k = 0; k < 40; k++) {
      const at = p.sample(16);
      const err = Math.abs(at.x - 0.2);
      expect(err).toBeLessThanOrEqual(prev + 1e-9);
      prev = err;
    }
    expect(prev).toBeLessThan(0.005);
  });

  it("takes a correction past SNAP_DISTANCE whole — a teleport is not smeared", () => {
    const p = live();
    p.step(1, 0, false);
    const far = SNAP_DISTANCE + 5;
    p.reconcile(vec(far, 0), 0, 1, 1);

    const at = p.sample(0);
    expect(at.x).toBeCloseTo(far, 6);
  });
});

describe("the blend is framerate-independent (T4, P6)", () => {
  it("lands identically at 30 fps and at 120 fps over the same wall-clock time", () => {
    const settle = (dtMs: number, steps: number) => {
      const p = live();
      p.step(1, 0, false);
      p.reconcile(vec(0.5, 0), 0, 1, 1);
      for (let k = 0; k < steps; k++) p.sample(dtMs);
      return p.sample(0).x;
    };
    // 33.33 x 12 and 8.33 x 48 are both 400 ms.
    const slow = settle(1000 / 30, 12);
    const fast = settle(1000 / 120, 48);
    expect(fast).toBeCloseTo(slow, 6);
  });

  it("uses CORRECTION_MS as a real time constant", () => {
    const p = live();
    p.step(1, 0, false);
    p.reconcile(vec(1, 0), 0, 1, 1);
    const start = Math.abs(p.sample(0).x - 1);
    p.sample(CORRECTION_MS);
    const after = Math.abs(p.sample(0).x - 1);
    // One time constant of exponential decay leaves 1/e of the error.
    expect(after / start).toBeCloseTo(Math.exp(-1), 2);
  });
});

describe("prediction never invents an outcome (T5, R4, P5)", () => {
  it("has no code path that writes `alive`", () => {
    // Asserted against the source, because the failure this guards is a future edit
    // that "helpfully" hides your own capsule a frame early. Elimination is the
    // server's word (I1) and arrives by snapshot only.
    const src = readFileSync(join(here, "predict.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toContain("alive");
  });

  it("names no minigame (T6, RD-009)", () => {
    const src = readFileSync(join(here, "predict.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const id of ["falling-floor", "hot-potato", "sweepers", "scramble"]) {
      expect(code).not.toContain(id);
    }
  });
});

describe("prediction is inert when off (T5, P7)", () => {
  it("reports inactive before any snapshot has placed it", () => {
    const p = new Predictor();
    p.beginRound([], 0);
    expect(p.active).toBe(false);
  });

  it("stops predicting when told to, and keeps nothing to replay", () => {
    const p = live();
    for (let k = 0; k < 5; k++) p.step(1, 0, false);
    p.stop();
    expect(p.active).toBe(false);
    expect(p.pendingCount).toBe(0);
  });

  it("banks no input while off, so a spectator's stick moves nothing", () => {
    const p = new Predictor();
    p.beginRound([], 0);
    for (let k = 0; k < 10; k++) p.step(1, 0, false);
    expect(p.pendingCount).toBe(0);
  });

  it("forgets the previous round at a boundary (RD-050's shape)", () => {
    const p = live();
    for (let k = 0; k < 5; k++) p.step(1, 0, false);
    p.beginRound([], 0);
    expect(p.pendingCount).toBe(0);
    expect(p.active).toBe(false);
  });
});

describe("prediction respects the arena it was given (T3, R1)", () => {
  it("collides against the round's solids exactly as the server does", () => {
    // A wall at x = 1, thicker than the tunnelling floor so the comparison is fair.
    const wall: Solid = { min: vec(1, -5), max: vec(2, 5) };
    const p = live([wall]);
    const inputs = Array.from({ length: 30 }, () => ({ ax: 1, ay: 0, btn: false }));
    for (const i of inputs) p.step(i.ax, i.ay, i.btn);
    p.reconcile(vec(0, 0), 0, 0, 1);

    const server = authoritative(inputs, [wall]);
    expect(p.sample(0).x).toBeCloseTo(server.pos.x, 6);
    // And it actually stopped at the wall rather than walking through it.
    expect(p.sample(0).x).toBeLessThan(1);
  });

  it("predicts a dash at the speed multiplier the snapshot reported (R5)", () => {
    const p = live();
    p.reconcile(vec(0, 0), 0, 0, 2); // server says: you are dashing
    // Three steps, not ten: a dash covers ground twice as fast and would otherwise
    // spend the divergence budget mid-test and hold (RD-079), which is correct
    // behaviour but not what this test is about.
    const inputs = Array.from({ length: 3 }, () => ({ ax: 1, ay: 0, btn: false }));
    for (const i of inputs) p.step(i.ax, i.ay, i.btn);
    p.reconcile(vec(0, 0), 0, 0, 2);

    const server = authoritative(inputs, [], 0, 2);
    expect(p.sample(0).x).toBeCloseTo(server.pos.x, 6);
    // A dash must actually outrun the base speed, or `sm` is doing nothing.
    expect(p.sample(0).x).toBeGreaterThan(MAX_SPEED * TICK_DT * 3);
  });
});

describe("height is the server's word unless the round has a jump (R4)", () => {
  // FOUND BY PLAYTEST, not by the suite. Every test above drove a player on flat
  // ground, where the bug is invisible: `stepMovement` clamps a body to the ground
  // plane it is given, so with a flat plane and one unacknowledged input a player
  // falling through `falling-floor` was replayed back to y = 0 every frame — drawn
  // standing on nothing while everyone else watched them drop.
  it("follows the server down a hole in a round with no jump", () => {
    const p = new Predictor();
    p.beginRound([], 0); // no jump: falling-floor, hot-potato, scramble
    p.reconcile(vec(0, 0), 0, 0, 1);
    p.step(0, 0, false); // one unacknowledged input — the normal steady state
    p.reconcile(vec(0, 0), -1.5, 0, 1);
    expect(p.sample(16).y).toBeCloseTo(-1.5, 6);
  });

  it("keeps following it down as the fall continues", () => {
    const p = new Predictor();
    p.beginRound([], 0);
    p.reconcile(vec(0, 0), 0, 0, 1);
    let last = 0;
    for (const y of [-0.4, -1.2, -2.6, -4.5]) {
      p.step(0, 0, false);
      p.reconcile(vec(0, 0), y, 0, 1);
      const got = p.sample(16).y;
      expect(got).toBeCloseTo(y, 6);
      expect(got).toBeLessThan(last);
      last = got;
    }
  });

  it("still predicts the arc in a round that HAS a jump", () => {
    // The other half: sweepers' floor is solid everywhere, so a flat plane is correct
    // there and the jump must stay predicted — that is the whole point of `jumpSpeed`.
    const p = new Predictor();
    p.beginRound([], JUMP_SPEED);
    p.reconcile(vec(0, 0), 0, 0, 1);
    p.step(0, 0, true); // jump
    expect(p.sample(0).y).toBeGreaterThan(0);
  });

  it("does not let a jumping round's prediction outlive the round", () => {
    const p = new Predictor();
    p.beginRound([], JUMP_SPEED);
    p.reconcile(vec(0, 0), 0, 0, 1);
    p.step(0, 0, true);
    // A round with no jump follows: height must go back to being the server's word.
    p.beginRound([], 0);
    p.reconcile(vec(0, 0), -3, 0, 1);
    p.step(0, 0, false);
    p.reconcile(vec(0, 0), -3, 0, 1);
    expect(p.sample(0).y).toBeCloseTo(-3, 6);
  });
});

describe("facing and speed travel with the position (R1)", () => {
  // Also found by playing rather than by the suite: prediction made the body move
  // instantly while its rotation and walk animation stayed on the 70 ms buffer, so the
  // character turned late and slid into the first frames of every movement. Before
  // prediction they were at least wrong together.
  it("faces the way the stick is pushed, the same expression every round uses", () => {
    const p = live();
    p.step(1, 0, false);
    expect(p.sample(0).facing).toBeCloseTo(Math.atan2(1, 0), 6);
    p.step(0, -1, false);
    expect(p.sample(0).facing).toBeCloseTo(Math.atan2(0, -1), 6);
  });

  it("holds the last facing when the stick is centred, as the server does", () => {
    const p = live();
    p.step(1, 0, false);
    const held = p.sample(0).facing;
    for (let k = 0; k < 5; k++) p.step(0, 0, false);
    expect(p.sample(0).facing).toBeCloseTo(held, 6);
  });

  it("reports a speed that rises from rest and matches the predicted velocity", () => {
    const p = live();
    expect(p.sample(0).speed).toBeCloseTo(0, 6);
    for (let k = 0; k < 10; k++) p.step(1, 0, false);
    const at = p.sample(0);
    expect(at.speed).toBeGreaterThan(0);
    expect(at.speed).toBeLessThanOrEqual(MAX_SPEED + 1e-6);
  });

  it("survives reconciliation: the newest input still sets the facing", () => {
    const p = live();
    p.step(1, 0, false);
    p.step(0, 1, false);
    p.reconcile(vec(0, 0), 0, 1, 1); // first acked, second replayed
    expect(p.sample(0).facing).toBeCloseTo(Math.atan2(0, 1), 6);
  });

  it("offers no vy in a round with no jump, so nothing invents one", () => {
    const p = live();
    p.step(0, 0, false);
    expect(p.sample(0).vy).toBeUndefined();
    const j = live([], JUMP_SPEED);
    j.step(0, 0, true);
    expect(j.sample(0).vy).toBeGreaterThan(0);
  });

  it("resets facing at a round boundary rather than inheriting the last one", () => {
    const p = live();
    p.step(1, 0, false);
    p.beginRound([], 0);
    expect(p.sample(0).facing).toBe(0);
  });
});

describe("being eliminated settles, it does not snap (R3)", () => {
  it("banks no further input once frozen", () => {
    const p = live();
    p.freeze();
    for (let k = 0; k < 10; k++) p.step(1, 0, false);
    expect(p.pendingCount).toBe(0);
  });

  it("converges on the server's position instead of jumping to it", () => {
    // Turning prediction off outright is the one correction the spec forbids: the
    // rendered position would jump straight to a snapshot 70 ms behind it, unblended,
    // at the exact moment the elimination animation plays.
    const p = live();
    for (let k = 0; k < 6; k++) p.step(1, 0, false);
    const before = p.sample(0).x;

    p.freeze();
    p.reconcile(vec(0, 0), 0, 999, 1); // server: you are back here, and out

    // Not taken whole in the first frame...
    const first = p.sample(16).x;
    expect(Math.abs(first - before)).toBeLessThan(Math.abs(before));
    // ...but arrived at shortly after.
    for (let k = 0; k < 40; k++) p.sample(16);
    expect(p.sample(0).x).toBeCloseTo(0, 3);
  });

  it("is cleared by the next round, so freezing cannot outlive it", () => {
    const p = live();
    p.freeze();
    p.beginRound([], 0);
    p.reconcile(vec(0, 0), 0, 0, 1);
    p.step(1, 0, false);
    expect(p.pendingCount).toBe(1);
  });
});

describe("the drawing is smooth even though the simulation is not (RD-077)", () => {
  // Reported from a phone: "the bots seem fine but the player looks like it's
  // stuttering when walking". The simulation is locked to TICK_MS so replay matches the
  // server tick-for-tick — but the screen refreshes two to four times as often, so
  // drawing the raw simulated position holds the character still for one or two frames
  // and then jumps it. The bots were smooth throughout because they never left the
  // interpolation buffer, which is continuous.
  const walk = (fps: number, interpolate: boolean) => {
    const p = live();
    let lastStep = 0;
    let moved = 0;
    let frames = 0;
    let prev = Number.NaN;
    for (let t = 0; t <= 1000; t += 1000 / fps) {
      if (t - lastStep >= TICK_MS) { lastStep = t; p.step(1, 0, false); }
      const alpha = interpolate ? (t - lastStep) / TICK_MS : 1;
      const x = p.sample(1000 / fps, alpha).x;
      frames++;
      if (x !== prev) moved++;
      prev = x;
    }
    return moved / frames;
  };

  it("moves the drawn position on nearly every frame at 60fps", () => {
    expect(walk(60, true)).toBeGreaterThan(0.9);
  });

  it("moves it on nearly every frame at 120fps too, where the stutter was worst", () => {
    // Without interpolation this was 28 of 120 — the character was static on three
    // frames out of four on a high-refresh phone.
    expect(walk(120, true)).toBeGreaterThan(0.9);
  });

  it("is a real improvement over drawing the raw simulated position", () => {
    for (const fps of [60, 120]) {
      expect(walk(fps, true)).toBeGreaterThan(walk(fps, false) * 2);
    }
  });

  it("clamps rather than extrapolating past the newest step", () => {
    // Guessing beyond the last simulated step would slide the character through a wall
    // it has already been stopped by, and would keep it moving for a third of a second
    // after the stick is released — a worse artefact than the one being fixed.
    const p = live();
    for (let k = 0; k < 4; k++) p.step(1, 0, false);
    const atEnd = p.sample(0, 1).x;
    expect(p.sample(0, 2).x).toBeCloseTo(atEnd, 10);
    expect(p.sample(0, 50).x).toBeCloseTo(atEnd, 10);
  });

  it("never draws behind the previous step either", () => {
    const p = live();
    for (let k = 0; k < 4; k++) p.step(1, 0, false);
    const atStart = p.sample(0, 0).x;
    expect(p.sample(0, -3).x).toBeCloseTo(atStart, 10);
  });

  it("interpolates strictly between the two steps it has", () => {
    const p = live();
    for (let k = 0; k < 4; k++) p.step(1, 0, false);
    const lo = p.sample(0, 0).x;
    const hi = p.sample(0, 1).x;
    expect(hi).toBeGreaterThan(lo);
    const mid = p.sample(0, 0.5).x;
    expect(mid).toBeGreaterThan(lo);
    expect(mid).toBeLessThan(hi);
    expect(mid).toBeCloseTo((lo + hi) / 2, 9);
  });

  it("keeps a tween across reconciliation, so a snapshot does not reintroduce a jump", () => {
    // A reconciliation rebuilds the drawn body from the acknowledged base; if it
    // flattened `prev` onto the new position the character would freeze for one frame
    // every snapshot — the same stutter at 30 Hz instead of a smooth line.
    const p = live();
    for (let k = 0; k < 4; k++) p.step(1, 0, false);
    p.reconcile(vec(0, 0), 0, 1, 1);
    expect(p.sample(0, 1).x).not.toBeCloseTo(p.sample(0, 0).x, 6);
  });

  it("still lands exactly on the server's position at alpha 1 (P2 holds)", () => {
    // Interpolation must not have quietly changed where prediction says you ARE, only
    // how the frames between are drawn.
    const p = live();
    p.reconcile(vec(3, -4), 0, 0, 1);
    const at = p.sample(16, 1);
    expect(at.x).toBeCloseTo(3, 10);
    expect(at.z).toBeCloseTo(-4, 10);
  });
});

describe("prediction is bounded by divergence, not by time (RD-079, I6, P9)", () => {
  // Reported from a phone: with a time-based hold the player froze too, and the whole
  // thing felt laggy. Time is the wrong quantity. The hold exists to stop the
  // correction growing past SNAP_DISTANCE, so what must be bounded is the DIVERGENCE.
  it("never runs further ahead of the server than can be blended back", () => {
    const p = live();
    for (let k = 0; k < 300; k++) p.step(1, 0, false); // ten seconds of held stick
    expect(p.divergence).toBeLessThanOrEqual(PREDICT_BUDGET_M + 0.2);
    expect(p.divergence).toBeLessThan(SNAP_DISTANCE);
  });

  it("holds once the budget is spent, and banks nothing more", () => {
    const p = live();
    for (let k = 0; k < 300; k++) p.step(1, 0, false);
    expect(p.holding).toBe(true);
    const banked = p.pendingCount;
    const at = p.sample(0, 1).x;
    for (let k = 0; k < 60; k++) p.step(1, 0, false);
    expect(p.pendingCount).toBe(banked);
    expect(p.sample(0, 1).x).toBeCloseTo(at, 10);
  });

  it("does not freeze a player who is standing still, however long the stall", () => {
    // The time-based rule fired here, where there is no divergence to bound and so
    // nothing to fix — an ordinary hiccup froze a stationary player for no reason.
    const p = live();
    for (let k = 0; k < 300; k++) p.step(0, 0, false);
    expect(p.holding).toBe(false);
  });

  it("keeps predicting through a short stall, which is the common case", () => {
    // Five ticks is ~165ms at a dead run — longer than ordinary jitter and inside the
    // budget, so it must stay perfectly smooth. At full speed the budget is spent in
    // about nine ticks; a slower player gets proportionally longer, which is the point.
    const p = live();
    for (let k = 0; k < 5; k++) p.step(1, 0, false);
    expect(p.holding).toBe(false);
    expect(p.pendingCount).toBe(5);
  });

  it("resumes the moment the server catches up", () => {
    const p = live();
    for (let k = 0; k < 300; k++) p.step(1, 0, false);
    expect(p.holding).toBe(true);
    // The server acknowledges everything and agrees where we are.
    p.reconcile({ x: p.sample(0, 1).x, z: 0 }, 0, 1e9, 1);
    expect(p.holding).toBe(false);
    p.step(1, 0, false);
    expect(p.pendingCount).toBe(1);
  });

  it("keeps the correction inside the blend, so recovery is never a teleport", () => {
    // The whole point of the budget: whatever the server says on its return, the error
    // is under SNAP_DISTANCE and is therefore blended rather than snapped.
    const p = live();
    for (let k = 0; k < 300; k++) p.step(1, 0, false);
    const drifted = p.sample(0, 1).x;
    p.reconcile(vec(0, 0), 0, 0, 1);
    const first = p.sample(16, 1).x;
    expect(Math.abs(first - drifted)).toBeLessThan(Math.abs(drifted));
    expect(first).not.toBeCloseTo(0, 2);
  });

  it("still issues sequence numbers while holding, so the wire stays in step", () => {
    const p = live();
    for (let k = 0; k < 300; k++) p.step(1, 0, false);
    const a = p.step(1, 0, false);
    expect(p.step(1, 0, false)).toBe(a + 1);
  });
});

describe("the round boundary stops the steering (RD-078)", () => {
  it("banks nothing once the round has ended", () => {
    // Measured: the server sends no snapshot for the whole RESULT_MS + INTRO_MS gap,
    // eight seconds. Without freezing, a held stick walks the body that entire time
    // and the next round's first snapshot takes it all back at once.
    const p = live();
    p.freeze();
    for (let k = 0; k < 240; k++) p.step(1, 0, false); // 8 s at 30 Hz
    expect(p.pendingCount).toBe(0);
  });

  it("does not move the drawn body through the gap", () => {
    const p = live();
    for (let k = 0; k < 3; k++) p.step(1, 0, false);
    const at = p.sample(0, 1).x;
    p.freeze();
    for (let k = 0; k < 240; k++) p.step(1, 0, false);
    expect(p.sample(0, 1).x).toBeCloseTo(at, 10);
  });
});

describe("the frame clock advances every frame (RD-080, P6)", () => {
  // `lastFrameAt` lived inside main.ts's `if (playing)` block, so across the eight
  // seconds between rounds it stopped advancing and every frame reported `now` minus
  // the last IN-ROUND frame — a fabricated gap climbing to 8000 ms. The `?debug=1`
  // readout added to distinguish "the network stalled" from "the phone hitched" was, for
  // one of those two answers, measuring itself: it showed frame p50 1850ms and p95
  // 6351ms at every round boundary while the loop was running at a steady 60.
  //
  // It also fed the correction decay a dt of seconds on the first frame of a new round.
  const main = () =>
    readFileSync(join(here, "main.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("assigns lastFrameAt outside the playing block", () => {
    const src = main();
    const assign = src.indexOf("lastFrameAt = now");
    expect(assign).toBeGreaterThan(-1);
    const playingGate = src.indexOf("if (playing)");
    expect(playingGate).toBeGreaterThan(-1);
    // Before the gate, so it cannot be skipped when a round is not running.
    expect(assign).toBeLessThan(playingGate);
  });

  it("captures the frame delta before moving the clock", () => {
    // Assigning first and subtracting after would make every decay dt zero, which is
    // silent: the correction would simply never blend.
    const src = main();
    expect(src.indexOf("const frameDt")).toBeLessThan(src.indexOf("lastFrameAt = now"));
    expect(src).toContain("predictor.sample(frameDt");
  });

  it("does not cap the worst frame it will admit to", () => {
    // The cap made `worst` smaller than p95, which is impossible for real data and was
    // the tell that the numbers were fabricated. A genuinely slow frame is exactly what
    // this readout exists to surface.
    const src = main();
    const worst = src.slice(src.indexOf("frameDt > health.worstFrame"), src.indexOf("frameDt > health.worstFrame") + 120);
    expect(worst).not.toContain("< 2000");
  });
});

describe("grouped prims are expanded before anything reads them (RD-085)", () => {
  const main = () =>
    readFileSync(join(here, "main.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("unpacks in the snap handler, ahead of setPrims and the minigame handler", () => {
    // The server groups prims that differ only in position. Everything downstream — the
    // renderer, any client minigame handler — still expects a plain list, so the
    // expansion has to happen first or they receive a shape they have never seen.
    const src = main();
    const snap = src.slice(src.indexOf('case "snap"'), src.indexOf('case "roundEnd"'));
    const unpack = snap.indexOf("unpackPrims");
    expect(unpack).toBeGreaterThan(-1);
    expect(unpack).toBeLessThan(snap.indexOf("setPrims"));
    expect(unpack).toBeLessThan(snap.indexOf("onSnapshot"));
  });
});

describe("the deliberate round-boundary gap is not a stall (RD-090)", () => {
  const main = () =>
    readFileSync(join(here, "main.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("forgets the last snapshot time when a round starts", () => {
    // The server sends nothing for the whole RESULT_MS + INTRO_MS between rounds —
    // eight seconds, measured, by design. The `reconnecting` chip and the `net worst`
    // figure both key off "time since the last snapshot", so without this the chip
    // fires at EVERY round transition on every device, network irrelevant, and the
    // worst-gap number reports the boundary instead of a real stall.
    const src = main();
    const roundStart = src.slice(src.indexOf('case "roundStart"'), src.indexOf('case "snap"'));
    expect(roundStart).toContain("health.lastSnapAt = 0");
  });

  it("guards both the chip and the gap stat behind a non-zero timestamp", () => {
    // Zeroing only helps if both readers skip a zero. The gap recorder must not treat
    // "no previous snapshot" as a gap of `now`, and the chip must not call it a stall.
    const src = main();
    // The condition gained a suspension guard (RD-096); what must hold is that a zero
    // timestamp still means "no gap to measure".
    expect(src).toContain("if (health.lastSnapAt &&");
    expect(src).toContain("health.lastSnapAt > 0");
  });

  it("still reports a stall that happens inside a round", () => {
    // The fix must not blind the instrument: only the boundary is excused.
    const src = main();
    const stalled = src.slice(src.indexOf("ui.setStalled("), src.indexOf("ui.setStalled(") + 200);
    expect(stalled).toContain("STALL_NOTICE_MS");
  });
});

describe("the world keeps breathing between rounds (RD-091)", () => {
  const main = () =>
    readFileSync(join(here, "main.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("syncs players on `playing OR worldLive`, not on `playing` alone", () => {
    // syncPlayers used to sit inside `if (playing)`, so for the whole gap between
    // rounds every character stood frozen mid-stride. The scene was still drawn; it
    // just never updated. Eight seconds of that reads as a hang, not as pacing.
    const src = main();
    expect(src).toContain("if (playing || worldLive)");
    const block = src.slice(src.indexOf("if (playing || worldLive)"));
    expect(block.indexOf("renderer.syncPlayers")).toBeGreaterThan(-1);
  });

  it("keeps the HUD and prediction gated on a LIVE round", () => {
    // The world outliving the round must not hand a spectator a HUD, or let the
    // predictor steer a body after the round has ended.
    const src = main();
    expect(src).toContain("if (playing) ui.renderHud(");
    expect(src).toContain("if (playing && predictor.active)");
    expect(src).toContain("if (playing) handler?.onFrame?.(");
  });

  it("clears worldLive wherever the world itself is cleared", () => {
    // A stale `worldLive` would animate the corpses of a previous match behind a lobby.
    const src = main();
    const clears = src.split("worldLive = false").length - 1;
    expect(clears).toBeGreaterThanOrEqual(3); // lobby, matchEnd, quit
    expect(src).toContain("worldLive = true");
  });
});

describe("the gap between rounds is shorter than it was (RD-091)", () => {
  it("keeps the intro intact and cuts only the result dwell", () => {
    // INTRO_MS is 1s of plain card so the rule can be read, then a 3-2-1 count
    // (round-brief R1, R4). Cutting it clips the first number or takes away the read.
    expect(INTRO_MS).toBe(4000);
    expect(RESULT_MS).toBeLessThan(INTRO_MS);
    expect(INTRO_MS + RESULT_MS).toBeLessThan(8000);
  });

  it("still leaves the scores up long enough to read", () => {
    // Three to six rows are read in about two seconds; this is not a flash.
    expect(RESULT_MS).toBeGreaterThanOrEqual(2000);
  });

  it("gives the end of a whole match longer than the end of one round", () => {
    expect(MATCH_RESULT_MS).toBeGreaterThan(RESULT_MS);
  });
});

describe("the prediction clock is an accumulator, not a timestamp (RD-092)", () => {
  const TICK = TICK_MS;
  const V = 5.5 / 1000; // metres per ms at full speed

  /** Drawn position per frame under each scheduler, at constant speed. */
  const drawn = (useAccumulator: boolean) => {
    const frames: number[] = [];
    let t = 0;
    for (let i = 0; i < 900; i++) { t += 16.667 + Math.sin(i * 2.3) * 0.4; frames.push(t); }
    let lastSent = 0, acc = 0, last = 0, prevPos = 0, pos = 0;
    const out: number[] = [];
    for (const now of frames) {
      if (useAccumulator) {
        acc += now - last; last = now;
        while (acc >= TICK) { acc -= TICK; prevPos = pos; pos += V * TICK; }
        out.push(prevPos + (pos - prevPos) * (acc / TICK));
      } else {
        if (now - lastSent >= TICK) { lastSent = now; prevPos = pos; pos += V * TICK; }
        const a = Math.min(1, Math.max(0, (now - lastSent) / TICK));
        out.push(prevPos + (pos - prevPos) * a);
      }
    }
    return out;
  };
  const advances = (d: number[]) => d.slice(1).map((v, i) => v - d[i]!);

  it("advances the simulation at real-world speed, which the old clock did not", () => {
    // `lastSent = now` resets the schedule to whenever a frame landed rather than to
    // the tick grid, so a step comes every 2 OR 3 frames at 60fps while each one always
    // advances a FIXED tick. The sim then runs slow: measured at 67mm per frame against
    // the 91.7mm real time asks for — 27% behind, made up by server corrections, which
    // is what stutter looks like.
    const expected = V * 16.667;
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(advances(drawn(true)))).toBeCloseTo(expected, 3);
    expect(mean(advances(drawn(false)))).toBeLessThan(expected * 0.8);
  });

  it("never draws a frame that did not move at all", () => {
    // The old alpha reached 1 and then held until the late step arrived — a frozen
    // frame in the middle of a run.
    expect(advances(drawn(true)).filter((a) => a <= 1e-9).length).toBe(0);
  });

  it("uses the accumulator remainder for alpha, so it cannot clamp", () => {
    const src = readFileSync(join(here, "main.ts"), "utf8");
    expect(src).toContain("const alpha = acc / TICK_MS");
    expect(src).not.toContain("(now - lastSent) / TICK_MS");
  });

  it("caps catch-up like the server's loop does", () => {
    // After a long stall, replaying every missed tick takes longer than the stall (P8).
    const src = readFileSync(join(here, "main.ts"), "utf8");
    expect(src).toContain("MAX_CATCHUP_STEPS");
  });
});

describe("a suspended tab is not a network fault (RD-094)", () => {
  const main = () =>
    readFileSync(join(here, "main.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("listens for the page coming back", () => {
    // A browser SUSPENDS requestAnimationFrame in a hidden tab and throttles message
    // handling with it. Switch windows, take a screenshot, let a phone dim — the page
    // stops and every clock goes stale together. Measured on a desktop PC whose frame
    // p50 is 13ms: a 14538ms "frame", immediately after a window switch, with
    // `reconnecting` on screen. Neither had anything to do with the network.
    expect(main()).toContain('addEventListener("visibilitychange"');
  });

  it("resets every baseline together, not some of them", () => {
    // A half-reset is worse than none: one clock honest, the other reporting the whole
    // suspension, and the disagreement reads as a real fault.
    const src = main();
    const fn = src.slice(src.indexOf("function onVisible"), src.indexOf("function onVisible") + 400);
    expect(fn).toContain("lastFrameAt = 0");
    expect(fn).toContain("acc = 0");
    expect(fn).toContain("health.lastSnapAt = 0");
    expect(fn).toContain("predictor.resync()");
  });

  it("only acts when the page is actually visible again", () => {
    const src = main();
    const fn = src.slice(src.indexOf("function onVisible"), src.indexOf("function onVisible") + 400);
    expect(fn).toContain('visibilityState !== "visible"');
  });

  it("drops inputs banked before the pause rather than replaying them", () => {
    // A hidden tab keeps its socket but stops running. Inputs banked before the pause
    // describe a stick position from before it; replaying them walks the capsule
    // somewhere the server never went.
    const p = live();
    for (let k = 0; k < 5; k++) p.step(1, 0, false);
    expect(p.pendingCount).toBe(5);
    p.resync();
    expect(p.pendingCount).toBe(0);
  });

  it("clears the residual correction too, so nothing blends across the gap", () => {
    const p = live();
    p.step(1, 0, false);
    p.reconcile(vec(0.3, 0), 0, 1, 1);
    p.resync();
    p.reconcile(vec(0.3, 0), 0, 1, 1);
    expect(p.sample(0, 1).x).toBeCloseTo(0.3, 6);
  });
});

describe("a stall is only real if the page was awake for it (RD-096)", () => {
  const main = () =>
    readFileSync(join(here, "main.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("counts stalls that had no suspension anywhere near them", () => {
    // The one number this hunt needed. Pressing screenshot lifts focus, the tab goes
    // hidden, rAF stops, and both a frame gap and an input gap appear — so the act of
    // capturing the evidence manufactures the artefact. A stall recorded while the page
    // was visible throughout is the only kind that means anything.
    const src = main();
    expect(src).toContain("visibleStalls");
    expect(src).toContain("if (health.lastSnapAt && !health.wasHidden)");
  });

  it("marks the page hidden on the way out, not only visible on the way back", () => {
    // RD-094 reset the clocks on becoming visible, which was too late: a hidden tab
    // still RECEIVES messages, so the snap handler had already recorded the whole
    // suspension as a network gap. Resetting a clock the other reader has read is not
    // a reset.
    const src = main();
    const fn = src.slice(src.indexOf("function onVisible"), src.indexOf("function onVisible") + 300);
    expect(fn).toContain("health.wasHidden = true");
  });

  it("skips only the measurement across a suspension, never the snapshot", () => {
    // An early `break` here would drop the whole frame — no prims, no reconciliation —
    // costing a real snapshot to avoid mis-recording a fake gap.
    const src = main();
    const snap = src.slice(src.indexOf('case "snap"'), src.indexOf("const extra ="));
    expect(snap).not.toContain("break;");
    expect(snap).toContain("health.wasHidden = false");
  });
});
