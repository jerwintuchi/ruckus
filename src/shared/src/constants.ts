/** Tunables shared by both halves. The server is still the only thing that acts on them. */

/** Simulation rate. Snapshots go out at this rate too (design R8). */
/**
 * The simulation and snapshot rate (responsiveness R1, RD-036).
 *
 * Raised from 20 to 30 so snapshots arrive every 33 ms instead of every 50 ms, which
 * is what makes a shorter interpolation buffer safe. The two are one change: shipping
 * the shorter buffer at 20 Hz would trade a visible stall for the latency.
 *
 * Netcode-invariant I5 names this number; it is updated in the same commit.
 */
export const TICK_HZ = 30;
export const TICK_MS = 1000 / TICK_HZ;
export const TICK_DT = 1 / TICK_HZ;

/** Never advance more than this many steps for one real frame (P8, spiral-of-death guard). */
export const MAX_CATCHUP_STEPS = 5;

export const MAX_PLAYERS = 8;
export const MIN_PLAYERS_TO_START = 2;

/** Room codes avoid I, O, 0 and 1 — they are read aloud across a room (R1). */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 4;

/**
 * How long a closed room's code is held back before it can be minted again.
 *
 * Without this, a link shared ten minutes ago can drop someone into a room full of
 * strangers who happen to have been handed the same four letters. There are about a
 * million codes, so reserving a handful for a minute and a half costs nothing.
 */
export const CODE_COOLDOWN_MS = 90_000;

/** Movement. Metres and seconds throughout; the sim is 2.5D (X/Z plane + scalar y). */
/**
 * Tuned by playing it, not by taste (RD-008): at 8.0 m/s on the original 14.4 m
 * arena a player crossed from centre to edge in 0.9 s — the round was over before
 * anyone had read the rule, because everyone had walked off, not because the floor
 * had done anything.
 */
export const MAX_SPEED = 5.5;
export const ACCEL = 60.0;
export const FRICTION = 12.0;
export const PLAYER_RADIUS = 0.4;
/**
 * Gravity and jump speed, chosen to reproduce the arc RD-012 measured.
 *
 * The old 26.0 / 9.0 produced a 1.335 m peak over 0.600 s **only at 20 Hz**, because
 * the integration was semi-implicit Euler and its trajectory depends on dt. With exact
 * integration (move.ts) the same numbers would give the textbook 1.558 m — a 17%
 * higher jump — so they are retuned to hit the measured arc exactly instead:
 *
 *     GRAVITY = 8·peak/T²  = 8·1.335/0.600²  = 29.67
 *     JUMP_SPEED = GRAVITY·T/2               = 8.90
 *
 * The jump now feels exactly as it did, and no tick rate can retune it again (RD-036).
 */
export const GRAVITY = 29.67;
export const JUMP_SPEED = 8.90;

/**
 * The thinnest solid an arena may use **at base speed**. A body at MAX_SPEED covers
 * MAX_SPEED/TICK_HZ in one tick, which must stay under this or collision resolution
 * can be stepped straight over. Asserted in move.test.ts.
 */
export const MIN_SOLID_THICKNESS = 0.5;

/**
 * The thinnest solid that is safe for a given speed multiplier.
 *
 * A minigame that boosts a player (Hot Potato's tumble) makes its own arena unsafe at
 * the global minimum: at `speedMul` 2.1 a tumbling body covers 0.58 m per tick, over
 * the 0.5 m floor, and can cross a minimum-thickness wall between two resolutions.
 * The guard therefore belongs to the minigame that changes the speed, not to a single
 * global number that the next boost would silently invalidate.
 *
 * Every minigame with a `speedMul` above 1 must assert its walls clear this.
 */
export function minThicknessFor(speedMul: number): number {
  return Math.max(MIN_SOLID_THICKNESS, (MAX_SPEED * speedMul) / TICK_HZ);
}

/** Rounds per match, and the fixed intro dwell that shows the one-sentence rule (R4). */
export const ROUNDS_PER_MATCH = 5;
export const INTRO_MS = 4000;
export const RESULT_MS = 4000;

/** The client renders this far behind the newest snapshot and interpolates (RD-004). */
/**
 * How far behind the newest snapshot the client renders (responsiveness R2).
 *
 * 70 ms is 2.1 snapshots at 30 Hz — the same safety the old 100 ms bought at 20 Hz,
 * where it covered 2.0. The buffer's job is to hold enough frames that one late packet
 * does not starve the render clock, and that is a count of snapshots, not a duration.
 * Starvation still HOLDS the newest frame and never extrapolates (RD-004).
 */
export const INTERP_DELAY_MS = 70;

/* Prediction (input-prediction R2, R3). Other players still use the buffer above;
   these govern only the local player's own capsule. */

/**
 * How many unacknowledged inputs the client keeps for replay.
 *
 * Two seconds at 30 Hz. The cap is what makes replay cost O(1) in the worst case
 * rather than growing with session length (P4): a client whose acks stop arriving
 * discards the oldest input rather than accumulating for ever.
 */
export const MAX_PENDING = 64;

/**
 * A correction further than this is taken whole rather than blended (R3).
 *
 * One tick of legitimate movement is `MAX_SPEED / TICK_HZ`, well under a metre, so
 * only a genuine discontinuity — a respawn, a teleport, a round boundary — trips this.
 * Smearing one of those across the arena would look far worse than the snap.
 */
export const SNAP_DISTANCE = 2.0;

/**
 * Time constant for blending a small correction away (R3, P6).
 *
 * Three snapshots. Long enough that a mispredicted shove is invisible, short enough
 * that contact does not feel mushy. The decay is exponential rather than a linear
 * lerp so it is framerate-independent without tracking when each correction began.
 */
export const CORRECTION_MS = 100;

/**
 * Below this, a residual correction is dropped rather than decayed further (R3).
 *
 * Positions travel quantized to centimetres (I5), so a residual under half a
 * centimetre is smaller than anything the wire could have expressed. Carrying it is
 * tracking the quantiser's noise, not the server's opinion.
 */
export const SNAP_EPSILON = 0.005;

/**
 * How far prediction may run ahead of the server's last word before it HOLDS (I6, P9).
 *
 * The hold exists for exactly one reason: to stop the correction growing past
 * `SNAP_DISTANCE`, where it stops being blended and becomes a teleport. So the quantity
 * to bound is the DIVERGENCE, not the elapsed time — 80% of the snap distance, leaving
 * headroom for the blend to do its job.
 *
 * A time threshold was tried first and is the wrong shape. It fires while standing
 * still, where there is no divergence to bound and nothing to fix, so an ordinary
 * network hiccup froze a stationary player for no reason. And it cannot be tuned out:
 * `SNAP_DISTANCE / MAX_SPEED` is 364 ms, so any threshold generous enough to ride out
 * mobile jitter is already long enough to guarantee the teleport it was added to
 * prevent. Distance has neither problem — a stall costs nothing until it actually
 * moves you, and it can never cost more than can be blended away.
 *
 * The server keeps only the LATEST input and overwrites rather than queueing (R10), so
 * it never walks the path taken during a stall; every metre predicted through one has
 * to be given back. This is the budget for how many.
 */
export const PREDICT_BUDGET_M = SNAP_DISTANCE * 0.8;

/**
 * How stale the stream must get before the interface admits it (RD-081).
 *
 * 500 ms — twelve times the p95 measured on a real phone (41 ms), so ordinary jitter
 * never trips it and a genuine blackout always does. Purely a labelling threshold: it
 * changes nothing about prediction or interpolation, both of which hold on their own.
 */
export const STALL_NOTICE_MS = 500;
