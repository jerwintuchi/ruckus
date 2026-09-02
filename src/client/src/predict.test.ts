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
  JUMP_SPEED,
  MAX_PENDING,
  MAX_SPEED,
  PREDICT_STARVE_MS,
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
    const p = live();
    for (let k = 0; k < MAX_PENDING * 10; k++) {
      p.step(1, 0, false);
      expect(p.pendingCount).toBeLessThanOrEqual(MAX_PENDING);
    }
    // The bound is the whole cost story: replay is O(MAX_PENDING), never O(uptime).
    expect(p.pendingCount).toBe(MAX_PENDING);
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
    const inputs = Array.from({ length: 10 }, () => ({ ax: 1, ay: 0, btn: false }));
    for (const i of inputs) p.step(i.ax, i.ay, i.btn);
    p.reconcile(vec(0, 0), 0, 0, 2);

    const server = authoritative(inputs, [], 0, 2);
    expect(p.sample(0).x).toBeCloseTo(server.pos.x, 6);
    // A dash must actually outrun the base speed, or `sm` is doing nothing.
    expect(p.sample(0).x).toBeGreaterThan(MAX_SPEED * TICK_DT * 10);
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

describe("a stalled connection holds, it does not run on (RD-078, I6, P9)", () => {
  // Reported from a phone: the bots froze, the player kept walking smoothly, then the
  // character was yanked back to where it had been when the freeze started. Only the
  // last of those is a client bug, and this is it. The server overwrites `p.input`
  // rather than queueing it (R10), so it never walks the path taken during a stall —
  // predicting through one guarantees a correction the size of the distance covered,
  // which SNAP_DISTANCE then applies in a single frame as a teleport.
  it("stops banking input once the newest snapshot is too old", () => {
    const p = live();
    p.observeSnapshotAge(PREDICT_STARVE_MS + 1);
    for (let k = 0; k < 20; k++) p.step(1, 0, false);
    expect(p.pendingCount).toBe(0);
    expect(p.holding).toBe(true);
  });

  it("holds position while starved rather than walking on", () => {
    const p = live();
    for (let k = 0; k < 3; k++) p.step(1, 0, false);
    const at = p.sample(0, 1).x;
    p.observeSnapshotAge(PREDICT_STARVE_MS + 1);
    for (let k = 0; k < 30; k++) p.step(1, 0, false);
    expect(p.sample(0, 1).x).toBeCloseTo(at, 10);
  });

  it("keeps predicting through ordinary jitter, which is the common case", () => {
    // The interpolation buffer absorbs 70 ms on its own; this must not trip on a
    // hiccup or it would reintroduce the stutter it exists to avoid.
    const p = live();
    p.observeSnapshotAge(PREDICT_STARVE_MS - 1);
    for (let k = 0; k < 5; k++) p.step(1, 0, false);
    expect(p.pendingCount).toBe(5);
    expect(p.holding).toBe(false);
  });

  it("resumes the moment a snapshot proves the server is back", () => {
    const p = live();
    p.observeSnapshotAge(PREDICT_STARVE_MS + 1);
    p.step(1, 0, false);
    expect(p.holding).toBe(true);

    p.reconcile(vec(0, 0), 0, 0, 1);
    expect(p.holding).toBe(false);
    p.step(1, 0, false);
    expect(p.pendingCount).toBe(1);
  });

  it("still issues sequence numbers while holding, so the wire stays in step", () => {
    // main.ts still SENDS input while starved — the server should have the freshest
    // stick position the instant it can hear us again. What is withheld is the local
    // guess about where that input leads.
    const p = live();
    p.observeSnapshotAge(PREDICT_STARVE_MS + 1);
    const a = p.step(1, 0, false);
    const b = p.step(1, 0, false);
    expect(b).toBe(a + 1);
  });

  it("has nothing to take back when the server returns", () => {
    // The whole point: with no predicted movement during the stall, the correction on
    // resume is not a teleport, because there is no divergence to correct.
    const p = live();
    p.observeSnapshotAge(PREDICT_STARVE_MS + 1);
    for (let k = 0; k < 60; k++) p.step(1, 0, false); // two seconds of held stick
    p.reconcile(vec(0, 0), 0, 0, 1);
    expect(p.sample(0, 1).x).toBeCloseTo(0, 6);
  });

  it("forgets it was starved at a round boundary", () => {
    const p = live();
    p.observeSnapshotAge(PREDICT_STARVE_MS + 1);
    expect(p.holding).toBe(true);
    p.beginRound([], 0);
    expect(p.holding).toBe(false);
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
