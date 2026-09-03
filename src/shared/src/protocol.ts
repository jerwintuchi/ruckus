/**
 * The wire protocol.
 *
 * Both halves are TypeScript and import this file directly, so the protocol is a
 * shared *type*, not a contract two languages mirror by hand. Validators live here
 * too: the server must validate every client message (I2), and keeping the validator
 * beside the type is what stops them drifting apart.
 */
import type { ArenaDescriptor, InputScheme, MinigameSnapshot } from "./minigame.ts";

export type MatchState = "LOBBY" | "ROUND_INTRO" | "ROUND_PLAY" | "ROUND_RESULT" | "MATCH_RESULT";

export type ErrCode =
  | "NO_ROOM" | "ROOM_FULL" | "NOT_HOST" | "TOO_FEW" | "BAD_MSG" | "BAD_CODE"
  /** The host removed you. Not a fault, and you may rejoin with the code (RD-108). */
  | "KICKED"
  /** Someone in the lobby has not readied (lobby-social R2). */
  | "NOT_READY";

/* Client to server. */

export type ClientMsg =
  | { t: "create"; name: string }
  | { t: "join"; code: string; name: string }
  | { t: "start" }
  /**
   * `seq` is what the server's `ack` refers to (input-prediction R2). It is the
   * client's own counter, not a shared clock, so the server compares it only against
   * the same client's previous value and never against another player's.
   */
  | { t: "input"; ax: number; ay: number; btn: boolean; seq: number }
  /* Lobby only. Each is validated for SHAPE here and for LEGALITY by the room (I2). */
  | { t: "ready"; on: boolean }
  | { t: "colour"; c: string }
  | { t: "kick"; slot: number }
  /** "I have read the rule" (round-open R2). Idempotent; only during ROUND_INTRO. */
  | { t: "skip" }
  | { t: "pong"; id: number };

/* Server to client. */

export interface PlayerView {
  slot: number;
  name: string;
  colour: string;
  score: number;
  connected: boolean;
  /** Ready to start (lobby-social R1). The host is always ready; START is their ready. */
  ready: boolean;
}

/** Quantized per-tick player state (P3). This is the hot path; keep it small. */
export interface SnapPlayer {
  slot: number;
  x: number; // cm
  z: number; // cm
  y: number; // cm
  a: number; // angle, 0..255
  alive: boolean;
}

export type ServerMsg =
  | { t: "welcome"; slot: number; code: string; host: number }
  | { t: "room"; players: PlayerView[]; host: number; state: MatchState }
  | {
      t: "intro";
      game: string;
      displayName: string;
      rule: string;
      /**
       * How long the intro has LEFT, in ms — a duration, never an instant.
       *
       * It used to be `Date.now() + INTRO_MS`, a server wall-clock timestamp that each
       * client subtracted from its own clock. Two devices that disagree about the time
       * by a second then disagree about the countdown by a second: the host counted
       * 3-2-1 and the phone opened on "1" and lost it immediately (RD-065). A duration
       * is skew-proof — every client adds it to a clock it already trusts.
       */
      inMs: number;
      round: number;
      of: number;
      /** How many have asked to skip, and how many that needs (round-open R2). */
      skips: number;
      ofPlayers: number;
    }
  | {
      t: "roundStart";
      game: string;
      arena: ArenaDescriptor;
      roster: number[];
      /** How to draw the controls: the input scheme, and the button's word if it has one. */
      input: InputScheme;
      buttonLabel?: string;
      /**
       * How fast this round's jump leaves the ground, in m/s, or 0 where the round has
       * no jump. A generic movement number, not a minigame fact: the client predicts
       * the arc without ever learning which round it is in (R5, RD-009).
       */
      jumpSpeed: number;
    }
  // RD-066 removed a sequence number from here because it was `Date.now() & 0xffff` —
  // a wall-clock value that wrapped every 65 seconds and that nobody read. `ack` is
  // not that field: it is PER CONNECTION, and the client acts on it every frame to
  // decide which inputs to replay (input-prediction R2). The lesson of RD-066 — never
  // put a field on the wire that no one consumes — still holds.
  | {
      t: "snap";
      players: SnapPlayer[];
      extra: MinigameSnapshot;
      /** The last `input.seq` this server applied FOR THE RECIPIENT (R2). */
      ack: number;
      /** The recipient's own speed multiplier, so a dash or slow predicts (R5). */
      sm: number;
    }
  /**
   * The round is now running (round-open R3).
   *
   * Separate from `roundStart`, which arrives at the INTRO so the arena can be drawn and
   * held still behind the rule card. The client cannot infer this instant from a timer:
   * a unanimous skip ends the card early, so the only honest source is the server saying
   * so. Empty on purpose — everything needed was sent with `roundStart`.
   */
  | { t: "play" }
  | { t: "roundEnd"; scores: Record<number, number>; totals: Record<number, number> }
  | { t: "matchEnd"; totals: Record<number, number>; winner: number }
  | { t: "err"; code: ErrCode }
  | { t: "ping"; id: number };

/* Validation (I2). */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";

/** Control characters, which would otherwise reach every other player's screen. */
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

/**
 * Normalise a room code as typed, pasted or shared.
 *
 * People paste codes with spaces, dashes and mixed case around them. Rejecting those
 * teaches nothing and costs a retype, so clean first and judge after.
 *
 * Codes are drawn from CODE_ALPHABET, which is letters **and digits** (2-9). An
 * earlier version stripped to `[^A-Z]` and silently ate the digit out of every code
 * containing one — a quarter of all codes, turning them into three characters that
 * then failed validation for a reason nobody could see.
 */
export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
}

/** Names are shown to everyone in the room, so they are stripped and clamped here. */
export function sanitizeName(raw: string): string {
  return raw.replace(CONTROL_CHARS, "").trim().slice(0, 12) || "player";
}

/**
 * Parse an untrusted client message.
 *
 * Returns null rather than throwing: a malformed message must be *dropped* and the
 * round must continue (R10). Note that `input` is never rejected for being out of
 * range — the axis is clamped downstream (I2, vec.clampUnit), because rejecting it
 * would let a client stall a round that waits on movement.
 */
export function parseClientMsg(raw: unknown): ClientMsg | null {
  if (!isObj(raw) || !isStr(raw.t)) return null;
  switch (raw.t) {
    case "create":
      if (!isStr(raw.name)) return null;
      return { t: "create", name: sanitizeName(raw.name) };
    case "join":
      if (!isStr(raw.code) || !isStr(raw.name)) return null;
      return { t: "join", code: normalizeCode(raw.code), name: sanitizeName(raw.name) };
    case "start":
      return { t: "start" };
    case "input": {
      if (!isNum(raw.ax) || !isNum(raw.ay)) return null;
      // Coerced, never rejected (I2). A client with no `seq`, a fractional one or a
      // negative one must still be able to move: dropping the message would let a
      // malformed field stall a round that waits on movement, which is exactly the
      // failure the "clamp, never reject" rule exists to prevent.
      const seq = isNum(raw.seq) && raw.seq >= 0 ? Math.floor(raw.seq) : 0;
      return { t: "input", ax: raw.ax, ay: raw.ay, btn: raw.btn === true, seq };
    }
    case "ready":
      // Coerced, never rejected — the same rule `input` follows. A malformed field must
      // not be able to stall a lobby, and "not true" is an unambiguous `false`.
      return { t: "ready", on: raw.on === true };
    case "colour":
      // Shape only. Whether this colour is in the palette, and whether anyone holds it,
      // are facts about live state and belong to the room (I2 step 2).
      if (!isStr(raw.c)) return null;
      return { t: "colour", c: raw.c };
    case "skip":
      return { t: "skip" };
    case "kick":
      if (!isNum(raw.slot) || raw.slot < 0) return null;
      return { t: "kick", slot: Math.floor(raw.slot) };
    case "pong":
      if (!isNum(raw.id)) return null;
      return { t: "pong", id: raw.id };
    default:
      return null;
  }
}
