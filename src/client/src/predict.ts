/**
 * Client-side prediction with server reconciliation (input-prediction R1–R4).
 *
 * The standard model, and only the standard model: **your own capsule is predicted,
 * every other player is interpolated** (`net.ts`), and the server stays authoritative
 * over everything that is not position (I1).
 *
 * The client owns a `Body` and steps it the instant you move the stick. Each input is
 * stamped with a sequence number and kept until the server acknowledges it. When a
 * snapshot arrives the predictor throws away its own answer, adopts the server's,
 * replays the inputs the server has not seen yet, and blends away whatever difference
 * remains.
 *
 * ## Why this does not violate I1/I4
 *
 * `stepMovement` is a **shared** deterministic primitive, and I4 names exactly this
 * category — "vector math, collision resolution, RNG" — as belonging in `src/shared`.
 * The client runs the same function the server runs, over the same arena solids the
 * server sent it. It does not contain a copy of any minigame's rules, and it never
 * decides an outcome: elimination, scoring, pickups and passes arrive by snapshot and
 * by snapshot only (R4, P5). RD-004's objection was to putting a copy of every
 * minigame in the client; this puts a copy of the integrator, which was already shared.
 */
import {
  CORRECTION_MS,
  MAX_PENDING,
  SNAP_DISTANCE,
  SNAP_EPSILON,
  TICK_DT,
  type Body,
  type Solid,
  type Vec2,
  makeBody,
  stepMovement,
  vec,
} from "@ruckus/shared";

export interface PendingInput {
  seq: number;
  ax: number;
  ay: number;
  btn: boolean;
}

/** Where the predictor thinks the local capsule is, and how it is oriented, this frame. */
export interface Predicted {
  x: number;
  y: number;
  z: number;
  /**
   * Facing and speed travel with the position, or the character comes apart.
   *
   * Both are pure movement — every round derives facing as `atan2` of the player's own
   * stick and speed from their own velocity, identically — so predicting them is the
   * same category of thing as predicting position, not a rule (R4).
   *
   * Leaving them on the interpolation buffer was a real defect and not a cosmetic one:
   * the body moved instantly while its rotation and its walk animation stayed 70 ms
   * behind, so a change of direction turned the character late and it slid the first
   * few frames of every movement. Prediction made position and orientation disagree,
   * where before they had at least been wrong together.
   */
  facing: number;
  speed: number;
  /** Only meaningful where height is predicted; undefined otherwise. */
  vy?: number;
}

/**
 * The flat ground plane the client predicts against.
 *
 * `falling-floor`'s holes are deliberately not modelled: falling is an *outcome*, R4
 * forbids predicting outcomes, and the alternative is shipping tile state into the
 * predictor — the minigame knowledge RD-009 exists to keep out. The local capsule
 * keeps standing until the server says it fell, which is a correction like any other.
 */
const FLAT_GROUND = (): number => 0;

function cloneBody(b: Body): Body {
  return {
    pos: { x: b.pos.x, z: b.pos.z },
    vel: { x: b.vel.x, z: b.vel.z },
    y: b.y,
    vy: b.vy,
    grounded: b.grounded,
    radius: b.radius,
  };
}

export class Predictor {
  /**
   * Two bodies, because the server sends a position but not a velocity.
   *
   * `base` is the last acknowledged state: the server's position, carrying the
   * velocity our own prediction had at that input. `body` is `base` plus the replayed
   * unacknowledged inputs — what actually gets drawn.
   *
   * Restoring position alone is not enough and the difference is not subtle: replaying
   * from the server's position while keeping the CURRENT velocity integrates the same
   * inputs twice over, and the predicted path bends away from the server's by a few
   * millimetres every tick. Velocity is state, so it has to be rewound with the rest.
   */
  private base: Body = makeBody(vec());
  private body: Body = makeBody(vec());
  private pending: PendingInput[] = [];
  private nextSeq = 1;

  /** Residual correction still being blended out, in metres (R3). */
  private errX = 0;
  private errZ = 0;

  private solids: readonly Solid[] = [];
  private jumpSpeed = 0;
  /**
   * Whether height is predicted at all (input-prediction R4).
   *
   * Only a round with a jump has a reason to predict `y`, and only such a round has a
   * floor that is solid everywhere — `FLAT_GROUND` is true for it by construction. A
   * round WITHOUT a jump can still move a player vertically, and when it does it is
   * because they are falling through a hole, which is an outcome and is the server's
   * to declare.
   *
   * Found by playtest, not by the suite: with a flat ground plane and one
   * unacknowledged input, `stepMovement` clamps a falling body back to y = 0 on every
   * replay, so a player dropping through `falling-floor` was drawn standing on nothing
   * while everyone else watched them fall. The design always said falling is not
   * predicted; the code predicted it to zero, which is not the same as not predicting.
   */
  private predictY = false;

  /** Held between inputs, exactly as the server holds it when the stick is centred. */
  private facing = 0;

  /** Still rendering and still settling, but no longer steering (R3). */
  private frozen = false;
  private speedMul = 1;

  /** Off until the round says otherwise — dead, spectating and off-roster all mean off (R4). */
  private on = false;

  get active(): boolean {
    return this.on;
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  /**
   * A new round: adopt its arena and forget everything from the last one.
   *
   * Same lesson as `SnapshotBuffer.clear` (RD-050) — anything holding per-round state
   * has to be emptied at the boundary, and a body, a pending queue and a residual
   * error are all per-round state.
   */
  beginRound(solids: readonly Solid[], jumpSpeed: number): void {
    this.solids = solids;
    this.jumpSpeed = jumpSpeed;
    this.predictY = jumpSpeed > 0;
    this.facing = 0;
    this.frozen = false;
    this.base = makeBody(vec());
    this.body = makeBody(vec());
    this.pending = [];
    this.errX = 0;
    this.errZ = 0;
    this.speedMul = 1;
    this.on = false; // stays off until a snapshot places us (P7)
  }

  /** Leaving the round entirely: render straight from the snapshot again (R4, P7). */
  stop(): void {
    this.on = false;
    this.frozen = false;
    this.pending = [];
    this.errX = 0;
    this.errZ = 0;
  }

  /**
   * Stop steering, but keep settling (R3).
   *
   * Used when the server says this player is out. Turning prediction off outright is
   * the one correction the spec forbids: the rendered position would jump straight from
   * the predicted one to a snapshot 70 ms behind it — up to about 38 cm at full speed,
   * unblended, at the exact instant the elimination animation plays.
   *
   * Freezing instead lets the machinery it already has do the work. No further input is
   * banked, so the pending queue drains, the body converges on the server's own
   * position, and the residual blends away over `CORRECTION_MS` like any other
   * correction.
   */
  freeze(): void {
    this.frozen = true;
    this.pending = [];
  }

  /**
   * Stamp an input, remember it for replay, and step the local body immediately.
   *
   * Returns the sequence number to put on the wire. Called once per `TICK_MS` so that
   * replay uses the same fixed `TICK_DT` the server integrates with — a variable dt
   * here would make the client's arc differ from the server's by construction.
   */
  step(ax: number, ay: number, btn: boolean): number {
    const seq = this.nextSeq++;
    if (!this.on || this.frozen) return seq;

    this.pending.push({ seq, ax, ay, btn });
    // P4: bounded by MAX_PENDING, never by session length. A client whose acks have
    // stopped arriving drops its oldest input rather than growing without limit.
    if (this.pending.length > MAX_PENDING) this.pending.shift();

    this.apply(this.body, { seq, ax, ay, btn });
    return seq;
  }

  /**
   * Adopt the server's position, drop acknowledged inputs, replay the rest (R2).
   *
   * P3 (idempotent): the same snapshot applied twice lands in the same place, because
   * the authoritative position and the surviving pending list are both functions of
   * `ack` alone, not of how many times this ran.
   */
  reconcile(pos: Vec2, y: number, ack: number, speedMul: number): void {
    this.speedMul = speedMul;

    // Where we currently claim to be, before the server's answer overwrites it.
    const wasX = this.body.pos.x + this.errX;
    const wasZ = this.body.pos.z + this.errZ;
    const first = !this.on;

    // Advance `base` through the inputs the server has now acknowledged, so its
    // velocity is the one we predicted at that moment, then anchor it to the position
    // the server actually reached.
    for (const p of this.pending) {
      if (p.seq <= ack) this.apply(this.base, p);
    }
    this.base.pos = { x: pos.x, z: pos.z };
    this.base.y = y;
    this.on = true;

    this.pending = this.pending.filter((p) => p.seq > ack);

    // Replay the rest onto a copy, which is what gets drawn.
    this.body = cloneBody(this.base);
    for (const p of this.pending) this.apply(this.body, p);

    if (first) {
      // The first snapshot of a round is not a misprediction — there was nothing to
      // mispredict. Taking it whole avoids blending in from wherever the previous
      // round happened to leave the body.
      this.errX = 0;
      this.errZ = 0;
      return;
    }

    const dx = wasX - this.body.pos.x;
    const dz = wasZ - this.body.pos.z;
    if (Math.hypot(dx, dz) >= SNAP_DISTANCE) {
      // A teleport, a respawn or a shove past anything movement explains. Take it
      // whole — smearing it across the arena would look far worse than the snap (R3).
      this.errX = 0;
      this.errZ = 0;
    } else {
      this.errX = dx;
      this.errZ = dz;
    }
  }

  /**
   * Decay the residual correction and report where to draw (R3, P6).
   *
   * Exponential rather than a linear lerp, so the result depends only on elapsed wall
   * time and not on how many frames it was split into: the same correction lands
   * identically at 30 fps and at 120 fps.
   */
  sample(dtMs: number): Predicted {
    const k = Math.exp(-Math.max(0, dtMs) / CORRECTION_MS);
    this.errX *= k;
    this.errZ *= k;
    // Below the epsilon the residual is smaller than the wire's own quantisation, so
    // carrying it further would be tracking noise.
    if (Math.abs(this.errX) < SNAP_EPSILON) this.errX = 0;
    if (Math.abs(this.errZ) < SNAP_EPSILON) this.errZ = 0;

    return {
      x: this.body.pos.x + this.errX,
      // `base.y` is the server's own word, untouched by replay (R4).
      y: this.predictY ? this.body.y : this.base.y,
      z: this.body.pos.z + this.errZ,
      facing: this.facing,
      speed: Math.hypot(this.body.vel.x, this.body.vel.z),
      ...(this.predictY ? { vy: this.body.vy } : {}),
    };
  }

  /** One fixed step of the shared integrator — the same call the server makes. */
  private apply(body: Body, p: PendingInput): void {
    // The same expression every round uses, from the same axis. Held when the stick is
    // centred, which is what the server's own `!== 0` guard does.
    if (p.ax !== 0 || p.ay !== 0) this.facing = Math.atan2(p.ax, p.ay);
    stepMovement(
      body,
      { axis: vec(p.ax, p.ay), jump: p.btn },
      TICK_DT,
      this.solids,
      FLAT_GROUND,
      this.jumpSpeed,
      this.speedMul,
    );
  }
}
