/** Tunables shared by both halves. The server is still the only thing that acts on them. */

/** Simulation rate. Snapshots go out at this rate too (design R8). */
export const TICK_HZ = 20;
export const TICK_MS = 1000 / TICK_HZ;
export const TICK_DT = 1 / TICK_HZ;

/** Never advance more than this many steps for one real frame (P8, spiral-of-death guard). */
export const MAX_CATCHUP_STEPS = 5;

export const MAX_PLAYERS = 8;
export const MIN_PLAYERS_TO_START = 2;

/** Room codes avoid I, O, 0 and 1 — they are read aloud across a room (R1). */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 4;

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
export const GRAVITY = 26.0;
export const JUMP_SPEED = 9.0;

/**
 * The thinnest solid any arena may use. P7: a body at MAX_SPEED covers
 * MAX_SPEED/TICK_HZ = 0.4 m in one tick, which must stay under this or a swept body
 * could tunnel. Asserted in move.test.ts so a future arena cannot silently break it.
 */
export const MIN_SOLID_THICKNESS = 0.5;

/** Rounds per match, and the fixed intro dwell that shows the one-sentence rule (R4). */
export const ROUNDS_PER_MATCH = 5;
export const INTRO_MS = 4000;
export const RESULT_MS = 4000;

/** The client renders this far behind the newest snapshot and interpolates (RD-004). */
export const INTERP_DELAY_MS = 100;
